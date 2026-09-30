import Foundation
import CoreLocation
import CoreBluetooth
import UserNotifications
import UIKit

@objc(CarLockBridge)
final class CarLockBridge: RCTEventEmitter, CLLocationManagerDelegate, CBCentralManagerDelegate, CBPeripheralDelegate {

    // MARK: - ESP32 Protocol Constants
    private let beaconUUIDString = "e2c56db5-dffb-48d2-b060-d0f5a71096e0"
    private let beaconMajor: UInt16 = 1
    private let beaconMinor: UInt16 = 1
    
    private let serviceUUID = CBUUID(string: "91bad492-b950-4226-aa2b-4ede9fa42f59")
    private let charNonceUUID = CBUUID(string: "cba1d466-344c-4be3-ab3f-101f4633b380")
    private let charAuthUUID = CBUUID(string: "ca73b3ba-39f6-4ab3-91ae-186dc9577d99")

    // Protocol Command Codes
    private let cmdUnlock: UInt8 = 0x01
    private let cmdLock: UInt8 = 0x02

    // Watchdog and Defaults
    private let bleTimeoutSeconds: Double = 7.0
    private let defaultRssiThreshold: Int = -65
    private let restoreIdentifier = "CarLockCentralRestoreIdentifier"
    private let regionIdentifier = "VehicleProximityRegion"
    private let userDefaultsKeyThreshold = "com.carlock.rssiThreshold"
    private let userDefaultsKeyMonitoring = "com.carlock.isMonitoring"

    // MARK: - Core Subsystems
    private var locationManager: CLLocationManager?
    private var centralManager: CBCentralManager?
    private var activePeripheral: CBPeripheral?
    private let bleQueue = DispatchQueue(label: "com.carlock.bleQueue", qos: .userInitiated)

    // GATT Characteristics
    private var nonceChar: CBCharacteristic?
    private var authChar: CBCharacteristic?

    // Watchdog & Background Tasks
    private var watchdogTimer: DispatchSourceTimer?
    private var backgroundTask: UIBackgroundTaskIdentifier = .invalid

    // Operation State
    private var hasListeners = false
    private var isMonitoringActive = false
    private var currentRssi: Int = -100
    private var pendingCommand: UInt8? = nil
    private var pendingReason: String = ""
    private var isLockedState: Bool = true

    // Manual Trigger Promises
    private var manualResolve: RCTPromiseResolveBlock?
    private var manualReject: RCTPromiseRejectBlock?

    // MARK: - RCTEventEmitter Overrides
    override static func requiresMainQueueSetup() -> Bool {
        return true
    }

    override func supportedEvents() -> [String]! {
        return [
            "onStatusChange",
            "onLogUpdate",
            "onLockStateChange",
            "onRssiUpdate"
        ]
    }

    override func startObserving() {
        hasListeners = true
    }

    override func stopObserving() {
        hasListeners = false
    }

    // MARK: - Initialization
    override init() {
        super.init()
        setupCoreLocation()
        setupCoreBluetooth()
        requestNotificationAuthorization()
    }

    private func setupCoreLocation() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            let lm = CLLocationManager()
            lm.delegate = self
            lm.allowsBackgroundLocationUpdates = true
            lm.pausesLocationUpdatesAutomatically = false
            self.locationManager = lm

            // Restore monitoring state if previously active
            if UserDefaults.standard.bool(forKey: self.userDefaultsKeyMonitoring) {
                self.startMonitoringInternal()
            }
        }
    }

    private func setupCoreBluetooth() {
        centralManager = CBCentralManager(
            delegate: self,
            queue: bleQueue,
            options: [
                CBCentralManagerOptionRestoreIdentifierKey: restoreIdentifier,
                CBCentralManagerOptionShowPowerAlertKey: true
            ]
        )
    }

    // MARK: - Settings Persistence
    private var storedThreshold: Int {
        get {
            let val = UserDefaults.standard.integer(forKey: userDefaultsKeyThreshold)
            return val != 0 ? val : defaultRssiThreshold
        }
        set {
            UserDefaults.standard.set(newValue, forKey: userDefaultsKeyThreshold)
        }
    }

    // MARK: - Exported Methods to React Native

    @objc(startProximityService:rejecter:)
    func startProximityService(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self, let lm = self.locationManager else {
                reject("ERROR", "Location manager no inicializado", nil)
                return
            }

            let status = lm.authorizationStatus
            if status == .notDetermined {
                lm.requestAlwaysAuthorization()
            } else if status != .authorizedAlways {
                self.sendLog("Advertencia: Se requiere permiso 'Siempre' para ejecución con pantalla bloqueada", level: "warn")
            }

            self.startMonitoringInternal()
            UserDefaults.standard.set(true, forKey: self.userDefaultsKeyMonitoring)
            resolve(["success": true, "monitoring": true])
        }
    }

    @objc(stopProximityService:rejecter:)
    func stopProximityService(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.stopMonitoringInternal()
            UserDefaults.standard.set(false, forKey: self.userDefaultsKeyMonitoring)
            resolve(["success": true, "monitoring": false])
        }
    }

    @objc(manualTrigger:resolver:rejecter:)
    func manualTrigger(_ action: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        let isUnlock = action.lowercased() == "unlock"
        let cmd = isUnlock ? cmdUnlock : cmdLock
        
        bleQueue.async { [weak self] in
            guard let self = self else { return }
            self.manualResolve = resolve
            self.manualReject = reject
            self.pendingCommand = cmd
            self.pendingReason = "manual-\(action)"

            self.sendLog("Comando manual recibido: \(action.uppercased())", level: "info")
            self.executeBleHandshake(reason: "Manual UI \(action.uppercased())", enforceRssi: false)
        }
    }

    @objc(setRssiThreshold:resolver:rejecter:)
    func setRssiThreshold(_ threshold: Int, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        self.storedThreshold = threshold
        self.sendLog("Umbral RSSI actualizado a: \(threshold) dBm", level: "info")
        broadcastStatus()
        resolve(["success": true, "threshold": threshold])
    }

    @objc(getProximitySettings:rejecter:)
    func getProximitySettings(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        var authStatus = "unknown"
        if let lm = locationManager {
            switch lm.authorizationStatus {
            case .authorizedAlways: authStatus = "authorizedAlways"
            case .authorizedWhenInUse: authStatus = "authorizedWhenInUse"
            case .denied: authStatus = "denied"
            case .restricted: authStatus = "restricted"
            case .notDetermined: authStatus = "notDetermined"
            @unknown default: authStatus = "unknown"
            }
        }

        var btState = "unknown"
        if let cm = centralManager {
            switch cm.state {
            case .poweredOn: btState = "poweredOn"
            case .poweredOff: btState = "poweredOff"
            case .unauthorized: btState = "unauthorized"
            case .unsupported: btState = "unsupported"
            case .resetting: btState = "resetting"
            case .unknown: btState = "unknown"
            @unknown default: btState = "unknown"
            }
        }

        resolve([
            "isMonitoring": isMonitoringActive,
            "rssiThreshold": storedThreshold,
            "beaconUUID": beaconUUIDString,
            "major": Int(beaconMajor),
            "minor": Int(beaconMinor),
            "authorizationStatus": authStatus,
            "bluetoothState": btState,
            "isLocked": isLockedState
        ])
    }

    @objc(setSecretKey:resolver:rejecter:)
    func setSecretKey(_ key: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        if KeychainHelper.shared.saveSecretKey(key) {
            self.sendLog("Nueva clave PSK guardada de forma segura en iOS Keychain", level: "success")
            resolve(["success": true])
        } else {
            reject("KEYCHAIN_ERROR", "Error al guardar en Keychain", nil)
        }
    }

    @objc(getSecretKey:rejecter:)
    func getSecretKey(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        let key = KeychainHelper.shared.getSecretKey()
        let masked = key.count > 8 ? "\(key.prefix(4))....\(key.suffix(4))" : "****"
        resolve(["hasKey": true, "maskedKey": masked])
    }

    @objc(checkPermissions:rejecter:)
    func checkPermissions(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        let isLocationAlways = locationManager?.authorizationStatus == .authorizedAlways
        let isBluetoothOn = centralManager?.state == .poweredOn
        resolve([
            "locationAlways": isLocationAlways,
            "bluetoothReady": isBluetoothOn
        ])
    }

    // MARK: - CoreLocation Beacon Region Setup

    private func createBeaconRegion() -> CLBeaconRegion? {
        guard let uuid = UUID(uuidString: beaconUUIDString) else { return nil }
        let constraint = CLBeaconIdentityConstraint(uuid: uuid, major: beaconMajor, minor: beaconMinor)
        let region = CLBeaconRegion(beaconIdentityConstraint: constraint, identifier: regionIdentifier)
        region.notifyOnEntry = true
        region.notifyOnExit = true
        region.notifyEntryStateOnDisplay = true
        return region
    }

    private func startMonitoringInternal() {
        guard let lm = locationManager, let region = createBeaconRegion() else { return }
        lm.startMonitoring(for: region)
        isMonitoringActive = true
        sendLog("Monitoreo de región iBeacon iniciado (UUID: \(beaconUUIDString))", level: "info")
        broadcastStatus()
    }

    private func stopMonitoringInternal() {
        guard let lm = locationManager, let region = createBeaconRegion() else { return }
        lm.stopMonitoring(for: region)
        isMonitoringActive = false
        sendLog("Monitoreo de región iBeacon detenido", level: "info")
        broadcastStatus()
    }

    // MARK: - CLLocationManagerDelegate (Background Wake-Up)

    func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
        guard region.identifier == regionIdentifier else { return }
        
        sendLog("⚡ [WAKEUP] didEnterRegion: Vehículo detectado por iBeacon. Iniciando Walk-Up Unlock...", level: "info")
        
        pendingCommand = cmdUnlock
        pendingReason = "walk-up-unlock"
        executeBleHandshake(reason: "Walk-Up Proximity Entry", enforceRssi: true)
    }

    func locationManager(_ manager: CLLocationManager, didExitRegion region: CLRegion) {
        guard region.identifier == regionIdentifier else { return }

        sendLog("⚡ [WAKEUP] didExitRegion: Baliza iBeacon fuera de alcance. Iniciando Walk-Away Auto-Lock...", level: "info")

        pendingCommand = cmdLock
        pendingReason = "walk-away-lock"
        executeBleHandshake(reason: "Walk-Away Proximity Exit", enforceRssi: false)
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        broadcastStatus()
    }

    func locationManager(_ manager: CLLocationManager, monitoringDidFailFor region: CLRegion?, withError error: Error) {
        sendLog("Error en monitoreo de región: \(error.localizedDescription)", level: "error")
    }

    // MARK: - BLE Handshake & 7-Second Watchdog

    private func executeBleHandshake(reason: String, enforceRssi: Bool) {
        beginBackgroundTask()
        startWatchdogTimer()

        bleQueue.async { [weak self] in
            guard let self = self, let cm = self.centralManager else { return }
            
            self.sendLog("[BLE] Ejecutando secuencia de acceso (\(reason)). Estado BT: \(cm.state.rawValue)", level: "info")

            if cm.state == .poweredOn {
                self.startScanningForVehicle()
            } else {
                self.sendLog("[BLE] Bluetooth no listo (Estado: \(cm.state.rawValue)). Esperando encendido...", level: "warn")
            }
        }
    }

    private func startScanningForVehicle() {
        guard let cm = centralManager, cm.state == .poweredOn else { return }
        
        sendLog("[BLE] Escaneando servicio GATT: \(serviceUUID.uuidString)", level: "info")
        cm.scanForPeripherals(
            withServices: [serviceUUID],
            options: [CBCentralManagerScanOptionAllowDuplicatesKey: false]
        )
    }

    private func startWatchdogTimer() {
        cancelWatchdogTimer()
        let timer = DispatchSource.makeTimerSource(queue: bleQueue)
        timer.schedule(deadline: .now() + bleTimeoutSeconds)
        timer.setEventHandler { [weak self] in
            guard let self = self else { return }
            self.sendLog("⏱️ [WATCHDOG] Timeout de \(Int(self.bleTimeoutSeconds))s alcanzado. Abortando conexión BLE para proteger watchdog de iOS.", level: "warn")
            self.handleWatchdogTimeout()
        }
        timer.resume()
        self.watchdogTimer = timer
    }

    private func cancelWatchdogTimer() {
        watchdogTimer?.cancel()
        watchdogTimer = nil
    }

    private func handleWatchdogTimeout() {
        centralManager?.stopScan()
        disconnectPeripheral()

        // Special handling for Walk-Away exit if already out of range
        if pendingCommand == cmdLock && pendingReason == "walk-away-lock" {
            self.sendLog("🔒 Auto-Lock completado: Fuera del radio de alcance del vehículo.", level: "success")
            self.isLockedState = true
            self.sendNotification(title: "🔒 Vehículo Bloqueado", body: "Tu vehículo quedó cerrado y asegurado al alejarte.")
            self.emitLockState(isLocked: true, action: "lock", reason: "walk-away-exit-timeout")
        }

        if let reject = manualReject {
            reject("TIMEOUT", "Tiempo de espera agotado: no se pudo conectar con el ESP32", nil)
            manualResolve = nil
            manualReject = nil
        }

        endBackgroundTask()
    }

    // MARK: - CBCentralManagerDelegate

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        broadcastStatus()
        if central.state == .poweredOn && pendingCommand != nil {
            startScanningForVehicle()
        }
    }

    func centralManager(_ central: CBCentralManager, willRestoreState dict: [String : Any]) {
        sendLog("[BLE] Restauración de estado CoreBluetooth en segundo plano", level: "info")
        if let peripherals = dict[CBCentralManagerRestoredStatePeripheralsKey] as? [CBPeripheral], let first = peripherals.first {
            self.activePeripheral = first
            first.delegate = self
        }
    }

    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String : Any], rssi RSSI: NSNumber) {
        let detectedRssi = RSSI.intValue
        self.currentRssi = detectedRssi
        emitRssi(detectedRssi)

        sendLog("[BLE] ESP32 descubierto (\(peripheral.name ?? "Vehículo")) | RSSI: \(detectedRssi) dBm", level: "info")

        // Proximity Filter for Walk-Up Unlock: Only unlock if close enough
        if pendingCommand == cmdUnlock && pendingReason == "walk-up-unlock" {
            if detectedRssi < storedThreshold {
                sendLog("Proximidad insuficiente (RSSI \(detectedRssi) < umbral \(storedThreshold) dBm). Esperando mayor cercanía...", level: "warn")
                return
            }
        }

        // Stop scanning and connect
        central.stopScan()
        self.activePeripheral = peripheral
        self.activePeripheral?.delegate = self

        sendLog("[BLE] Conectando a periférico...", level: "info")
        central.connect(peripheral, options: [
            CBConnectPeripheralOptionNotifyOnConnectionKey: true,
            CBConnectPeripheralOptionNotifyOnDisconnectionKey: true
        ])
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        sendLog("[BLE] Conexión BLE establecida con éxito. Descubriendo servicios...", level: "info")
        peripheral.discoverServices([serviceUUID])
    }

    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        let msg = error?.localizedDescription ?? "Fallo desconocido"
        sendLog("[BLE] Error al conectar con periférico: \(msg)", level: "error")
        abortOperation(error: msg)
    }

    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        sendLog("[BLE] Periférico desconectado", level: "info")
        self.activePeripheral = nil
        endBackgroundTask()
    }

    // MARK: - CBPeripheralDelegate (GATT Exchange)

    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        if let error = error {
            abortOperation(error: "Error descubriendo servicio: \(error.localizedDescription)")
            return
        }

        guard let service = peripheral.services?.first(where: { $0.uuid == serviceUUID }) else {
            abortOperation(error: "Servicio de acceso no encontrado en ESP32")
            return
        }

        peripheral.discoverCharacteristics([charNonceUUID, charAuthUUID], for: service)
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        if let error = error {
            abortOperation(error: "Error descubriendo características: \(error.localizedDescription)")
            return
        }

        guard let chars = service.characteristics else { return }

        for char in chars {
            if char.uuid == charNonceUUID {
                self.nonceChar = char
            } else if char.uuid == charAuthUUID {
                self.authChar = char
            }
        }

        // Read Nonce from ESP32
        if let nonce = self.nonceChar {
            sendLog("[GATT] Leyendo Nonce de reto...", level: "info")
            peripheral.readValue(for: nonce)
        } else {
            abortOperation(error: "Característica Nonce no encontrada")
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        if let error = error {
            abortOperation(error: "Error al leer característica: \(error.localizedDescription)")
            return
        }

        guard characteristic.uuid == charNonceUUID, let nonceData = characteristic.value else { return }

        sendLog("[GATT] Nonce de 16 bytes recibido: \(CryptoHelper.hexString(from: nonceData))", level: "info")

        processChallengeAndAuthenticate(nonceData: nonceData)
    }

    // MARK: - 33-Byte HMAC-SHA256 Payload Construction & Writing

    private func processChallengeAndAuthenticate(nonceData: Data) {
        guard let peripheral = activePeripheral, let authCharacteristic = authChar else {
            abortOperation(error: "Periférico o característica de autenticación no listos")
            return
        }

        guard let command = pendingCommand else {
            abortOperation(error: "No hay comando pendiente")
            return
        }

        let psk = KeychainHelper.shared.getSecretKey()

        // Build 33-byte authentication payload:
        // Byte 0: Command (0x01 = UNLOCK, 0x02 = LOCK)
        // Bytes 1..32: HMAC-SHA256([Command (1B) + Nonce (16B)])
        guard let payload = CryptoHelper.buildAuthPayload(command: command, nonce: nonceData, pskString: psk) else {
            abortOperation(error: "Error en construcción del payload criptográfico de 33 bytes")
            return
        }

        sendLog("[CRYPTO] Enviando payload autenticado de \(payload.count) bytes (Comando: \(command == cmdUnlock ? "0x01 UNLOCK" : "0x02 LOCK"))...", level: "info")

        let writeType: CBCharacteristicWriteType = authCharacteristic.properties.contains(.write) ? .withResponse : .withoutResponse
        peripheral.writeValue(payload, for: authCharacteristic, type: writeType)

        // Successful execution handling
        cancelWatchdogTimer()
        let isUnlock = (command == cmdUnlock)
        self.isLockedState = !isUnlock

        if isUnlock {
            sendLog("🚗 ¡Vehículo Desbloqueado Exitosamente!", level: "success")
            sendNotification(
                title: "🚗 Vehículo Desbloqueado",
                body: "El vehículo se ha abierto automáticamente por proximidad."
            )
            emitLockState(isLocked: false, action: "unlock", reason: pendingReason)
        } else {
            sendLog("🔒 ¡Vehículo Bloqueado Exitosamente!", level: "success")
            sendNotification(
                title: "🔒 Vehículo Bloqueado",
                body: "Tu vehículo quedó cerrado y asegurado."
            )
            emitLockState(isLocked: true, action: "lock", reason: pendingReason)
        }

        if let resolve = manualResolve {
            resolve(["success": true, "action": isUnlock ? "unlock" : "lock", "rssi": currentRssi])
            manualResolve = nil
            manualReject = nil
        }

        // Clean disconnect
        disconnectPeripheral()
        endBackgroundTask()
        pendingCommand = nil
    }

    // MARK: - Error Handling & Background Task Cleanup

    private func abortOperation(error: String) {
        cancelWatchdogTimer()
        sendLog("Operación abortada: \(error)", level: "error")

        if let reject = manualReject {
            reject("BLE_ERROR", error, nil)
            manualResolve = nil
            manualReject = nil
        }

        disconnectPeripheral()
        endBackgroundTask()
        pendingCommand = nil
    }

    private func disconnectPeripheral() {
        if let p = activePeripheral {
            centralManager?.cancelPeripheralConnection(p)
        }
    }

    private func beginBackgroundTask() {
        endBackgroundTask()
        backgroundTask = UIApplication.shared.beginBackgroundTask(withName: "CarLockExecutionTask") { [weak self] in
            self?.sendLog("[BACKGROUND] Presupuesto de segundo plano de iOS expirado", level: "warn")
            self?.endBackgroundTask()
        }
    }

    private func endBackgroundTask() {
        if backgroundTask != .invalid {
            UIApplication.shared.endBackgroundTask(backgroundTask)
            backgroundTask = .invalid
        }
    }

    // MARK: - Notifications & Logging

    private func requestNotificationAuthorization() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
    }

    private func sendNotification(title: String, body: String) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        
        let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request, withCompletionHandler: nil)
    }

    private func sendLog(_ message: String, level: String = "info") {
        NSLog("[CarLockBridge] [%@] %@", level.uppercased(), message)
        if hasListeners {
            sendEvent(withName: "onLogUpdate", body: [
                "message": message,
                "timestamp": Date().timeIntervalSince1970 * 1000,
                "level": level
            ])
        }
    }

    private func emitRssi(_ rssi: Int) {
        if hasListeners {
            sendEvent(withName: "onRssiUpdate", body: ["rssi": rssi])
        }
    }

    private func emitLockState(isLocked: Bool, action: String, reason: String) {
        if hasListeners {
            sendEvent(withName: "onLockStateChange", body: [
                "isLocked": isLocked,
                "action": action,
                "reason": reason,
                "rssi": currentRssi,
                "timestamp": Date().timeIntervalSince1970 * 1000
            ])
        }
    }

    private func broadcastStatus() {
        if hasListeners {
            var authStatus = "unknown"
            if let lm = locationManager {
                switch lm.authorizationStatus {
                case .authorizedAlways: authStatus = "authorizedAlways"
                case .authorizedWhenInUse: authStatus = "authorizedWhenInUse"
                case .denied: authStatus = "denied"
                case .restricted: authStatus = "restricted"
                case .notDetermined: authStatus = "notDetermined"
                @unknown default: authStatus = "unknown"
                }
            }

            var btState = "unknown"
            if let cm = centralManager {
                switch cm.state {
                case .poweredOn: btState = "poweredOn"
                case .poweredOff: btState = "poweredOff"
                default: btState = "other"
                }
            }

            sendEvent(withName: "onStatusChange", body: [
                "isMonitoring": isMonitoringActive,
                "authorizationStatus": authStatus,
                "bluetoothState": btState,
                "rssiThreshold": storedThreshold,
                "isLocked": isLockedState
            ])
        }
    }
}
