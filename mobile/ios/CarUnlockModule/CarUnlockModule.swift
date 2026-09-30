import Foundation
import CoreLocation
import CoreBluetooth
import UserNotifications
import UIKit

@objc(CarUnlockModule)
final class CarUnlockModule: RCTEventEmitter, CLLocationManagerDelegate, CBCentralManagerDelegate, CBPeripheralDelegate {
    
    // MARK: - Constants & Defaults
    private let defaultBeaconUUID = "74278BDA-B644-4520-8F0C-720EAF059935"
    private let defaultMajor: UInt16 = 1
    private let defaultMinor: UInt16 = 100
    private let defaultServiceUUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
    private let defaultCharNonceUUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8"
    private let defaultCharAuthUUID = "beb5483e-36e1-4688-b7f5-ea07361b26a9"
    private let defaultCharStatusUUID = "beb5483e-36e1-4688-b7f5-ea07361b26aa"
    private let defaultRssiThreshold: Int = -65 // dBm

    private let userDefaultsPrefix = "com.carunlock.config."
    private let centralRestoreIdentifier = "CarUnlockCentralRestoreKey"

    // MARK: - Core Subsystems
    private var locationManager: CLLocationManager?
    private var centralManager: CBCentralManager?
    private var activePeripheral: CBPeripheral?
    private var centralQueue = DispatchQueue(label: "com.carunlock.centralQueue", qos: .userInitiated)
    
    // GATT Characteristics References
    private var nonceCharacteristic: CBCharacteristic?
    private var authCharacteristic: CBCharacteristic?
    private var statusCharacteristic: CBCharacteristic?
    
    // State Tracking
    private var hasListeners = false
    private var isMonitoringActive = false
    private var currentRssi: Int = -100
    private var isManualUnlockTriggered = false
    private var backgroundTask: UIBackgroundTaskIdentifier = .invalid
    private var connectionTimeoutTimer: DispatchSourceTimer?

    // Manual unlock callback promises
    private var manualUnlockResolve: RCTPromiseResolveBlock?
    private var manualUnlockReject: RCTPromiseRejectBlock?

    // MARK: - RCTEventEmitter Overrides
    override static func requiresMainQueueSetup() -> Bool {
        return true
    }

    override func supportedEvents() -> [String]! {
        return [
            "onUnlockEvent",
            "onStatusChange",
            "onRssiUpdate",
            "onLogMessage"
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
        setupManagers()
        requestNotificationPermissions()
    }

    private func setupManagers() {
        // Run location manager on main thread
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.locationManager = CLLocationManager()
            self.locationManager?.delegate = self
            self.locationManager?.allowsBackgroundLocationUpdates = true
            self.locationManager?.pausesLocationUpdatesAutomatically = false
        }

        // Initialize CoreBluetooth on background queue with state restoration
        centralManager = CBCentralManager(
            delegate: self,
            queue: centralQueue,
            options: [
                CBCentralManagerOptionRestoreIdentifierKey: centralRestoreIdentifier,
                CBCentralManagerOptionShowPowerAlertKey: true
            ]
        )
    }

    // MARK: - Configuration Getters/Setters (UserDefaults & Keychain)
    private var storedBeaconUUID: String {
        get { UserDefaults.standard.string(forKey: userDefaultsPrefix + "beaconUUID") ?? defaultBeaconUUID }
        set { UserDefaults.standard.set(newValue, forKey: userDefaultsPrefix + "beaconUUID") }
    }

    private var storedMajor: UInt16 {
        get { UInt16(UserDefaults.standard.integer(forKey: userDefaultsPrefix + "major")) != 0 ? UInt16(UserDefaults.standard.integer(forKey: userDefaultsPrefix + "major")) : defaultMajor }
        set { UserDefaults.standard.set(Int(newValue), forKey: userDefaultsPrefix + "major") }
    }

    private var storedMinor: UInt16 {
        get { UInt16(UserDefaults.standard.integer(forKey: userDefaultsPrefix + "minor")) != 0 ? UInt16(UserDefaults.standard.integer(forKey: userDefaultsPrefix + "minor")) : defaultMinor }
        set { UserDefaults.standard.set(Int(newValue), forKey: userDefaultsPrefix + "minor") }
    }

    private var storedRssiThreshold: Int {
        get {
            let val = UserDefaults.standard.integer(forKey: userDefaultsPrefix + "rssiThreshold")
            return val != 0 ? val : defaultRssiThreshold
        }
        set { UserDefaults.standard.set(newValue, forKey: userDefaultsPrefix + "rssiThreshold") }
    }

    private var isHandsFreeEnabled: Bool {
        get { UserDefaults.standard.bool(forKey: userDefaultsPrefix + "handsFreeEnabled") }
        set { UserDefaults.standard.set(newValue, forKey: userDefaultsPrefix + "handsFreeEnabled") }
    }

    // MARK: - React Native Exported Methods

    @objc(requestPermissions:rejecter:)
    func requestPermissions(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self, let locationManager = self.locationManager else {
                reject("ERROR", "Location manager not ready", nil)
                return
            }
            
            // Request Always location authorization required for locked screen iBeacon wake-up
            locationManager.requestAlwaysAuthorization()
            self.requestNotificationPermissions()
            
            resolve(["status": "requested"])
        }
    }

    @objc(setSecretKey:resolver:rejecter:)
    func setSecretKey(_ key: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        if KeychainHelper.shared.saveSecretKey(key) {
            resolve(["success": true])
        } else {
            reject("KEYCHAIN_ERROR", "Failed to store PSK in iOS Keychain", nil)
        }
    }

    @objc(getSecretKey:rejecter:)
    func getSecretKey(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        if let key = KeychainHelper.shared.getSecretKey() {
            // Mask key for UI safety: e.g. "c9a7...cdef"
            let masked = key.count > 8 ? "\(key.prefix(4))....\(key.suffix(4))" : "****"
            resolve(["hasKey": true, "maskedKey": masked])
        } else {
            resolve(["hasKey": false, "maskedKey": ""])
        }
    }

    @objc(setProximityConfig:major:minor:rssiThreshold:resolver:rejecter:)
    func setProximityConfig(_ uuid: String, major: Int, minor: Int, rssiThreshold: Int, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        self.storedBeaconUUID = uuid
        self.storedMajor = UInt16(major)
        self.storedMinor = UInt16(minor)
        self.storedRssiThreshold = rssiThreshold

        // Restart monitoring if currently active
        if isHandsFreeEnabled {
            restartBeaconMonitoring()
        }

        resolve(["success": true])
    }

    @objc(getProximityConfig:rejecter:)
    func getProximityConfig(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        resolve([
            "beaconUUID": storedBeaconUUID,
            "major": Int(storedMajor),
            "minor": Int(storedMinor),
            "rssiThreshold": storedRssiThreshold,
            "handsFreeEnabled": isHandsFreeEnabled
        ])
    }

    @objc(setHandsFreeEnabled:resolver:rejecter:)
    func setHandsFreeEnabled(_ enabled: Bool, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        self.isHandsFreeEnabled = enabled
        if enabled {
            startBeaconMonitoring()
        } else {
            stopBeaconMonitoring()
        }
        resolve(["enabled": enabled])
    }

    @objc(triggerManualUnlock:rejecter:)
    func triggerManualUnlock(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        centralQueue.async { [weak self] in
            guard let self = self else { return }
            self.manualUnlockResolve = resolve
            self.manualUnlockReject = reject
            self.isManualUnlockTriggered = true

            self.sendLog("Manual unlock command triggered by user.")
            self.initiateUnlockSequence(reason: "Manual UI Trigger")
        }
    }

    @objc(getMonitoringStatus:rejecter:)
    func getMonitoringStatus(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        var authStatusStr = "unknown"
        if let lm = locationManager {
            switch lm.authorizationStatus {
            case .authorizedAlways: authStatusStr = "authorizedAlways"
            case .authorizedWhenInUse: authStatusStr = "authorizedWhenInUse"
            case .denied: authStatusStr = "denied"
            case .restricted: authStatusStr = "restricted"
            case .notDetermined: authStatusStr = "notDetermined"
            @unknown default: authStatusStr = "unknown"
            }
        }

        var btStateStr = "unknown"
        if let cm = centralManager {
            switch cm.state {
            case .poweredOn: btStateStr = "poweredOn"
            case .poweredOff: btStateStr = "poweredOff"
            case .unauthorized: btStateStr = "unauthorized"
            case .unsupported: btStateStr = "unsupported"
            case .resetting: btStateStr = "resetting"
            case .unknown: btStateStr = "unknown"
            @unknown default: btStateStr = "unknown"
            }
        }

        resolve([
            "isMonitoring": self.isMonitoringActive,
            "handsFreeEnabled": self.isHandsFreeEnabled,
            "authorizationStatus": authStatusStr,
            "bluetoothState": btStateStr,
            "rssiThreshold": self.storedRssiThreshold
        ])
    }

    // MARK: - Beacon Monitoring Logic (CoreLocation)

    private func createBeaconRegion() -> CLBeaconRegion? {
        guard let uuid = UUID(uuidString: storedBeaconUUID) else {
            sendLog("Error: Invalid Beacon UUID: \(storedBeaconUUID)")
            return nil
        }
        
        let beaconIdentity = CLBeaconIdentityConstraint(uuid: uuid, major: storedMajor, minor: storedMinor)
        let region = CLBeaconRegion(beaconIdentityConstraint: beaconIdentity, identifier: "CarUnlockRegion")
        region.notifyOnEntry = true
        region.notifyOnExit = true
        region.notifyEntryStateOnDisplay = true // Trigger also when user turns on screen near beacon
        return region
    }

    private func startBeaconMonitoring() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self, let locationManager = self.locationManager, let region = self.createBeaconRegion() else { return }
            
            locationManager.startMonitoring(for: region)
            self.isMonitoringActive = true
            self.sendLog("Started iBeacon monitoring for UUID: \(self.storedBeaconUUID)")
            self.broadcastStatus()
        }
    }

    private func stopBeaconMonitoring() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self, let locationManager = self.locationManager, let region = self.createBeaconRegion() else { return }
            
            locationManager.stopMonitoring(for: region)
            self.isMonitoringActive = false
            self.sendLog("Stopped iBeacon monitoring.")
            self.broadcastStatus()
        }
    }

    private func restartBeaconMonitoring() {
        stopBeaconMonitoring()
        startBeaconMonitoring()
    }

    // MARK: - CLLocationManagerDelegate

    func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
        guard region.identifier == "CarUnlockRegion" else { return }
        
        sendLog("[CoreLocation] Entered Car iBeacon region! Waking app up in background...")

        // Begin background task to protect execution while screen is locked
        beginBackgroundTask()

        // Initiate native BLE handshake
        centralQueue.async { [weak self] in
            self?.initiateUnlockSequence(reason: "iBeacon Region Entry")
        }
    }

    func locationManager(_ manager: CLLocationManager, didExitRegion region: CLRegion) {
        guard region.identifier == "CarUnlockRegion" else { return }
        sendLog("[CoreLocation] Exited Car iBeacon region.")
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        broadcastStatus()
    }

    func locationManager(_ manager: CLLocationManager, monitoringDidFailFor region: CLRegion?, withError error: Error) {
        sendLog("[CoreLocation] Monitoring failed with error: \(error.localizedDescription)")
    }

    // MARK: - BLE Sequence & CBCentralManagerDelegate

    private func initiateUnlockSequence(reason: String) {
        guard let centralManager = centralManager else { return }

        sendLog("[BLE] Initiating unlock sequence (Reason: \(reason)). Central state: \(centralManager.state.rawValue)")
        
        startConnectionTimeoutTimer()

        if centralManager.state == .poweredOn {
            startScanningForVehicle()
        } else {
            sendLog("[BLE] CentralManager not powered on yet (State: \(centralManager.state)). Scan deferred.")
        }
    }

    private func startScanningForVehicle() {
        guard let centralManager = centralManager, centralManager.state == .poweredOn else { return }
        
        let serviceUUID = CBUUID(string: defaultServiceUUID)
        sendLog("[BLE] Scanning for vehicle GATT service: \(defaultServiceUUID)")
        
        // Background scan requires specifying the exact service UUID
        centralManager.scanForPeripherals(
            withServices: [serviceUUID],
            options: [CBCentralManagerScanOptionAllowDuplicatesKey: false]
        )
    }

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        sendLog("[BLE] CentralManager state updated: \(central.state.rawValue)")
        broadcastStatus()
        
        if central.state == .poweredOn && (isManualUnlockTriggered || isMonitoringActive) {
            startScanningForVehicle()
        }
    }

    func centralManager(_ central: CBCentralManager, willRestoreState dict: [String : Any]) {
        sendLog("[BLE] Restoring CBCentralManager state in background...")
        if let peripherals = dict[CBCentralManagerRestoredStatePeripheralsKey] as? [CBPeripheral], let first = peripherals.first {
            self.activePeripheral = first
            first.delegate = self
            sendLog("[BLE] Restored active peripheral: \(first.identifier.uuidString)")
        }
    }

    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String : Any], rssi RSSI: NSNumber) {
        let detectedRssi = RSSI.intValue
        self.currentRssi = detectedRssi
        
        sendLog("[BLE] Discovered ESP32 peripheral: \(peripheral.name ?? "Unknown") | RSSI: \(detectedRssi) dBm")
        emitRssi(detectedRssi)

        // Strict Proximity Filter: If RSSI is lower than threshold and not manual override, skip
        if !isManualUnlockTriggered && detectedRssi < storedRssiThreshold {
            sendLog("[BLE] Proximity check: RSSI (\(detectedRssi) dBm) is below threshold (\(storedRssiThreshold) dBm). Waiting for closer approach.")
            return;
        }

        // Stop scanning and connect
        central.stopScan()
        self.activePeripheral = peripheral
        self.activePeripheral?.delegate = self
        
        sendLog("[BLE] Connecting to vehicle...")
        central.connect(peripheral, options: [
            CBConnectPeripheralOptionNotifyOnConnectionKey: true,
            CBConnectPeripheralOptionNotifyOnDisconnectionKey: true
        ])
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        sendLog("[BLE] Connected to vehicle peripheral successfully. Discovering GATT services...")
        let serviceUUID = CBUUID(string: defaultServiceUUID)
        peripheral.discoverServices([serviceUUID])
    }

    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        let msg = "Failed to connect to peripheral: \(error?.localizedDescription ?? "Unknown error")"
        sendLog("[BLE] \(msg)")
        completeUnlockAttempt(success: false, message: msg)
    }

    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        sendLog("[BLE] Disconnected from vehicle peripheral.")
        self.activePeripheral = nil
        endBackgroundTask()
    }

    // MARK: - CBPeripheralDelegate (GATT Operations)

    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        if let error = error {
            let msg = "Service discovery error: \(error.localizedDescription)"
            sendLog("[GATT] \(msg)")
            completeUnlockAttempt(success: false, message: msg)
            return
        }

        guard let service = peripheral.services?.first(where: { $0.uuid == CBUUID(string: defaultServiceUUID) }) else {
            sendLog("[GATT] Error: Vehicle unlock service not found on peripheral!")
            completeUnlockAttempt(success: false, message: "Unlock service not found")
            return
        }

        sendLog("[GATT] Found vehicle unlock service. Discovering characteristics...")
        let charsToDiscover = [
            CBUUID(string: defaultCharNonceUUID),
            CBUUID(string: defaultCharAuthUUID),
            CBUUID(string: defaultCharStatusUUID)
        ]
        peripheral.discoverCharacteristics(charsToDiscover, for: service)
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        if let error = error {
            let msg = "Characteristics discovery error: \(error.localizedDescription)"
            sendLog("[GATT] \(msg)")
            completeUnlockAttempt(success: false, message: msg)
            return
        }

        guard let chars = service.characteristics else { return }

        for char in chars {
            if char.uuid == CBUUID(string: defaultCharNonceUUID) {
                self.nonceCharacteristic = char
            } else if char.uuid == CBUUID(string: defaultCharAuthUUID) {
                self.authCharacteristic = char
            } else if char.uuid == CBUUID(string: defaultCharStatusUUID) {
                self.statusCharacteristic = char
                // Subscribe to status notifications
                peripheral.setNotifyValue(true, for: char)
            }
        }

        // Read connection RSSI to ensure current proximity
        peripheral.readRSSI()

        // Read challenge nonce
        if let nonceChar = self.nonceCharacteristic {
            sendLog("[GATT] Reading challenge nonce from ESP32...")
            peripheral.readValue(for: nonceChar)
        } else {
            sendLog("[GATT] Error: Nonce characteristic missing!")
            completeUnlockAttempt(success: false, message: "Nonce characteristic missing")
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didReadRSSI RSSI: NSNumber, error: Error?) {
        let rssiVal = RSSI.intValue
        self.currentRssi = rssiVal
        emitRssi(rssiVal)
        sendLog("[GATT] Updated connection RSSI: \(rssiVal) dBm")
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        if let error = error {
            sendLog("[GATT] Error reading characteristic value: \(error.localizedDescription)")
            return
        }

        guard let data = characteristic.value else { return }

        // 1. Process Nonce (Challenge)
        if characteristic.uuid == CBUUID(string: defaultCharNonceUUID) {
            sendLog("[GATT] Challenge Nonce received (\(data.count) bytes): \(CryptoHelper.hexString(from: data))")
            handleChallengeNonce(nonceData: data)
        }

        // 2. Process Status Notification
        if characteristic.uuid == CBUUID(string: defaultCharStatusUUID) {
            handleStatusResponse(statusData: data)
        }
    }

    // MARK: - Challenge Response Handler (HMAC-SHA256)

    private func handleChallengeNonce(nonceData: Data) {
        guard let peripheral = self.activePeripheral, let authChar = self.authCharacteristic else {
            completeUnlockAttempt(success: false, message: "Auth characteristic or peripheral not ready")
            return
        }

        // Verify RSSI proximity again before submitting signature
        if !isManualUnlockTriggered && currentRssi < storedRssiThreshold {
            sendLog("[AUTH] Aborted: Connection RSSI (\(currentRssi) dBm) is lower than threshold (\(storedRssiThreshold) dBm)")
            completeUnlockAttempt(success: false, message: "Too far from vehicle")
            disconnectCurrentPeripheral()
            return
        }

        // Retrieve PSK from Keychain
        guard let pskString = KeychainHelper.shared.getSecretKey() else {
            sendLog("[AUTH] Error: No Pre-Shared Key found in Keychain! Please configure in app.")
            completeUnlockAttempt(success: false, message: "PSK not configured in Keychain")
            disconnectCurrentPeripheral()
            return
        }

        // Parse key: if 64 hex chars, decode to 32 bytes; else use utf8 bytes
        let keyData: Data
        if let hexKey = CryptoHelper.dataFromHexString(pskString), pskString.count == 64 {
            keyData = hexKey
        } else {
            keyData = pskString.data(using: .utf8) ?? Data()
        }

        // Compute HMAC-SHA256(Key, Nonce)
        let signatureData = CryptoHelper.hmacSHA256(key: keyData, data: nonceData)
        sendLog("[AUTH] Computed HMAC-SHA256 signature (\(signatureData.count) bytes). Writing to vehicle...")

        // Send signature to ESP32
        let writeType: CBCharacteristicWriteType = authChar.properties.contains(.write) ? .withResponse : .withoutResponse
        peripheral.writeValue(signatureData, for: authChar, type: writeType)
    }

    private func handleStatusResponse(statusData: Data) {
        guard let code = statusData.first else { return }

        switch code {
        case 0x02: // STATUS_SUCCESS_UNLOCKED
            sendLog("[STATUS] VEHICLE UNLOCKED SUCCESSFULLY!")
            sendLocalNotification(
                title: "🚗 Vehículo Desbloqueado",
                body: "El sistema de cierre centralizado se ha abierto por proximidad."
            )
            emitUnlockEvent(type: "SUCCESS", message: "Vehículo desbloqueado exitosamente", rssi: currentRssi)
            completeUnlockAttempt(success: true, message: "Desbloqueado exitosamente")

        case 0x03: // STATUS_ERR_INVALID_HMAC
            sendLog("[STATUS] ERROR: HMAC verification failed on ESP32!")
            emitUnlockEvent(type: "ERROR", message: "Firma criptográfica inválida (HMAC falló)", rssi: currentRssi)
            completeUnlockAttempt(success: false, message: "Firma criptográfica inválida")

        case 0x05: // STATUS_ERR_COOLDOWN_ACTIVE
            sendLog("[STATUS] REJECTED: Cooldown active on ESP32 (anti-rebote)")
            emitUnlockEvent(type: "COOLDOWN", message: "En periodo de enfriamiento (cooldown activo)", rssi: currentRssi)
            completeUnlockAttempt(success: false, message: "Cooldown activo en el vehículo")

        case 0x06: // STATUS_ERR_NONCE_EXPIRED
            sendLog("[STATUS] ERROR: Nonce challenge expired on ESP32.")
            completeUnlockAttempt(success: false, message: "El reto Nonce expiró")

        default:
            sendLog("[STATUS] Received status code: \(code)")
        }

        // Disconnect immediately after result
        disconnectCurrentPeripheral()
    }

    // MARK: - Cleanup & Helpers

    private func completeUnlockAttempt(success: Bool, message: String) {
        cancelConnectionTimeoutTimer()
        
        if isManualUnlockTriggered {
            if success {
                manualUnlockResolve?(["success": true, "message": message, "rssi": currentRssi])
            } else {
                manualUnlockReject?("UNLOCK_FAILED", message, nil)
            }
            manualUnlockResolve = nil
            manualUnlockReject = nil
            isManualUnlockTriggered = false
        }
    }

    private func disconnectCurrentPeripheral() {
        if let peripheral = activePeripheral {
            centralManager?.cancelPeripheralConnection(peripheral)
        }
    }

    private func startConnectionTimeoutTimer() {
        cancelConnectionTimeoutTimer()
        let timer = DispatchSource.makeTimerSource(queue: centralQueue)
        timer.schedule(deadline: .now() + 15.0) // 15 seconds timeout
        timer.setEventHandler { [weak self] in
            guard let self = self else { return }
            self.sendLog("[TIMEOUT] Unlock sequence timed out after 15 seconds.")
            self.centralManager?.stopScan()
            self.disconnectCurrentPeripheral()
            self.completeUnlockAttempt(success: false, message: "Timeout: No se pudo conectar al vehículo")
            self.endBackgroundTask()
        }
        timer.resume()
        self.connectionTimeoutTimer = timer
    }

    private func cancelConnectionTimeoutTimer() {
        connectionTimeoutTimer?.cancel()
        connectionTimeoutTimer = nil
    }

    private func beginBackgroundTask() {
        endBackgroundTask()
        backgroundTask = UIApplication.shared.beginBackgroundTask(withName: "CarUnlockBackgroundHandshake") { [weak self] in
            self?.sendLog("[BACKGROUND] Background execution budget expired by iOS.")
            self?.endBackgroundTask()
        }
    }

    private func endBackgroundTask() {
        if backgroundTask != .invalid {
            UIApplication.shared.endBackgroundTask(backgroundTask)
            backgroundTask = .invalid
        }
    }

    // MARK: - Notifications & Event Emitter

    private func requestNotificationPermissions() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            if granted {
                // Notifications authorized
            }
        }
    }

    private func sendLocalNotification(title: String, body: String) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        
        let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request, withCompletionHandler: nil)
    }

    private func sendLog(_ message: String) {
        NSLog("[CarUnlock] %@", message)
        if hasListeners {
            sendEvent(withName: "onLogMessage", body: [
                "message": message,
                "timestamp": Date().timeIntervalSince1970 * 1000
            ])
        }
    }

    private func emitRssi(_ rssi: Int) {
        if hasListeners {
            sendEvent(withName: "onRssiUpdate", body: ["rssi": rssi])
        }
    }

    private func emitUnlockEvent(type: String, message: String, rssi: Int) {
        if hasListeners {
            sendEvent(withName: "onUnlockEvent", body: [
                "type": type,
                "message": message,
                "rssi": rssi,
                "timestamp": Date().timeIntervalSince1970 * 1000
            ])
        }
    }

    private func broadcastStatus() {
        if hasListeners {
            sendEvent(withName: "onStatusChange", body: [
                "isMonitoring": isMonitoringActive,
                "handsFreeEnabled": isHandsFreeEnabled
            ])
        }
    }
}
