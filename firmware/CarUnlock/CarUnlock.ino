#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <BLEBeacon.h>
#include "config.h"
#include "security.h"

// ==============================================================================
// GLOBAL STATE & TIMERS
// ==============================================================================
static SecurityManager g_security;
static BLEServer* g_pServer = nullptr;
static BLECharacteristic* g_pCharNonce = nullptr;
static BLECharacteristic* g_pCharAuth = nullptr;

static bool g_deviceConnected = false;
static uint32_t g_lastUnlockTimestamp = 0;

static bool g_unlockRelayActive = false;
static uint32_t g_unlockRelayTimestamp = 0;

static bool g_lockRelayActive = false;
static uint32_t g_lockRelayTimestamp = 0;

// Forward Declarations
void startDualAdvertising();
void triggerUnlockPulse();
void triggerLockPulse();

// ==============================================================================
// BLE SERVER CALLBACKS
// ==============================================================================
class CarLockServerCallbacks : public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) override {
        g_deviceConnected = true;
        digitalWrite(PIN_LED_STATUS, HIGH);
        Serial.println("[BLE] iPhone conectado. Generando nuevo Nonce de reto...");

        // Generate and update challenge nonce
        uint8_t nonce[NONCE_LENGTH];
        g_security.generateNewNonce(nonce);
        g_pCharNonce->setValue(nonce, NONCE_LENGTH);
        g_pCharNonce->notify();
    }

    void onDisconnect(BLEServer* pServer) override {
        g_deviceConnected = false;
        digitalWrite(PIN_LED_STATUS, LOW);
        Serial.println("[BLE] iPhone desconectado. Reiniciando publicidad dual...");
        startDualAdvertising();
    }
};

// ==============================================================================
// AUTHENTICATION CHARACTERISTIC (33 BYTES WRITE)
// ==============================================================================
class AuthCharacteristicCallbacks : public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic* pCharacteristic) override {
        uint8_t* rawData = pCharacteristic->getData();
        size_t len = pCharacteristic->getLength();

        Serial.printf("[AUTH] Recibido payload de %u bytes (esperado: %d bytes)\n", (unsigned int)len, PAYLOAD_TOTAL_LENGTH);

        // 1. Verify exact 33-byte payload length
        if (len != PAYLOAD_TOTAL_LENGTH || rawData == nullptr) {
            Serial.printf("[AUTH] RECHAZADO: Longitud inválida (%u bytes)\n", (unsigned int)len);
            return;
        }

        uint8_t command = rawData[0];
        const uint8_t* receivedHmac = &rawData[1];

        // 2. Validate Command
        if (command != CMD_UNLOCK && command != CMD_LOCK) {
            Serial.printf("[AUTH] RECHAZADO: Comando desconocido 0x%02X\n", command);
            return;
        }

        // 3. Cooldown check only for auto walk-up unlock (Lock is always permitted)
        uint32_t now = millis();
        if (command == CMD_UNLOCK) {
            if (g_lastUnlockTimestamp > 0 && (now - g_lastUnlockTimestamp < COOLDOWN_MS)) {
                uint32_t remaining = (COOLDOWN_MS - (now - g_lastUnlockTimestamp)) / 1000;
                Serial.printf("[AUTH] RECHAZADO: Cooldown activo para UNLOCK. Restan: %u s\n", remaining);
                return;
            }
        }

        // 4. Verify HMAC-SHA256 signature over [Command + Nonce]
        bool isValid = g_security.verifyCommandHMAC(command, receivedHmac, HMAC_LENGTH);
        if (!isValid) {
            Serial.println("[AUTH] RECHAZADO: Firma HMAC inválida o Nonce expirado.");
            return;
        }

        // 5. Execute action based on verified command
        if (command == CMD_UNLOCK) {
            Serial.println("[AUTH] ÉXITO: Firma válida -> DESBLOQUEANDO VEHÍCULO (GPIO 23)");
            g_lastUnlockTimestamp = now;
            triggerUnlockPulse();
        } else if (command == CMD_LOCK) {
            Serial.println("[AUTH] ÉXITO: Firma válida -> BLOQUEANDO VEHÍCULO (GPIO 22)");
            triggerLockPulse();
        }
    }
};

// ==============================================================================
// NONCE CHARACTERISTIC (READ CHALLENGE)
// ==============================================================================
class NonceCharacteristicCallbacks : public BLECharacteristicCallbacks {
    void onRead(BLECharacteristic* pCharacteristic) override {
        if (!g_security.isNonceValid()) {
            Serial.println("[NONCE] Nonce expirado o inexistente; generando nuevo...");
            uint8_t nonce[NONCE_LENGTH];
            g_security.generateNewNonce(nonce);
            pCharacteristic->setValue(nonce, NONCE_LENGTH);
        } else {
            Serial.println("[NONCE] Sirviendo Nonce de reto activo.");
        }
    }
};

// ==============================================================================
// HARDWARE RELAY PULSE HELPERS
// ==============================================================================
void triggerUnlockPulse() {
    digitalWrite(PIN_RELAY_UNLOCK, RELAY_ACTIVE_LOGIC);
    g_unlockRelayActive = true;
    g_unlockRelayTimestamp = millis();
}

void triggerLockPulse() {
    digitalWrite(PIN_RELAY_LOCK, RELAY_ACTIVE_LOGIC);
    g_lockRelayActive = true;
    g_lockRelayTimestamp = millis();
}

void processRelayTimers() {
    uint32_t now = millis();

    // Unlock pulse completion (500 ms)
    if (g_unlockRelayActive && (now - g_unlockRelayTimestamp >= RELAY_PULSE_MS)) {
        digitalWrite(PIN_RELAY_UNLOCK, !RELAY_ACTIVE_LOGIC);
        g_unlockRelayActive = false;
        Serial.println("[HARDWARE] Pulso de apertura finalizado.");
    }

    // Lock pulse completion (500 ms)
    if (g_lockRelayActive && (now - g_lockRelayTimestamp >= RELAY_PULSE_MS)) {
        digitalWrite(PIN_RELAY_LOCK, !RELAY_ACTIVE_LOGIC);
        g_lockRelayActive = false;
        Serial.println("[HARDWARE] Pulso de cierre finalizado.");
    }
}

// ==============================================================================
// DUAL iBeacon + GATT ADVERTISING SETUP
// ==============================================================================
void startDualAdvertising() {
    BLEAdvertising* pAdvertising = BLEDevice::getAdvertising();
    pAdvertising->stop();

    // Apple iBeacon Standard Manufacturer Frame
    BLEBeacon beacon;
    beacon.setManufacturerId(0x4C00); // Apple Inc.
    
    BLEUUID beaconUUID(BEACON_UUID);
    beacon.setProximityUUID(beaconUUID);
    beacon.setMajor(BEACON_MAJOR);
    beacon.setMinor(BEACON_MINOR);
    beacon.setSignalPower(BEACON_MEASURED_POWER);

    BLEAdvertisementData advData;
    advData.setFlags(0x06); // General Discoverable + BR/EDR Not Supported
    advData.setManufacturerData(beacon.getData());

    // Scan Response containing GATT Service UUID & Name
    BLEAdvertisementData scanResponseData;
    scanResponseData.setName(DEVICE_NAME);
    scanResponseData.setCompleteServices(BLEUUID(SERVICE_UUID));

    pAdvertising->setAdvertisementData(advData);
    pAdvertising->setScanResponseData(scanResponseData);

    // 100 ms interval (160 * 0.625ms)
    pAdvertising->setMinInterval(0x00A0);
    pAdvertising->setMaxInterval(0x00A0);

    pAdvertising->start();
    Serial.println("[BLE] Publicidad dual iBeacon + GATT iniciada.");
}

// ==============================================================================
// SETUP & LOOP
// ==============================================================================
void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n===============================================");
    Serial.println("  CarLock ESP32 - Walk-Up & Walk-Away Access");
    Serial.println("===============================================");

    // Pins setup
    pinMode(PIN_RELAY_UNLOCK, OUTPUT);
    digitalWrite(PIN_RELAY_UNLOCK, !RELAY_ACTIVE_LOGIC);

    pinMode(PIN_RELAY_LOCK, OUTPUT);
    digitalWrite(PIN_RELAY_LOCK, !RELAY_ACTIVE_LOGIC);

    pinMode(PIN_LED_STATUS, OUTPUT);
    digitalWrite(PIN_LED_STATUS, LOW);

    // Security & Crypto
    g_security.init(PRE_SHARED_KEY);

    // BLE Stack
    BLEDevice::init(DEVICE_NAME);
    BLEDevice::setPower(ESP_PWR_LVL_P9);

    g_pServer = BLEDevice::createServer();
    g_pServer->setCallbacks(new CarLockServerCallbacks());

    BLEService* pService = g_pServer->createService(SERVICE_UUID);

    // Nonce characteristic (Read + Notify)
    g_pCharNonce = pService->createCharacteristic(
        CHAR_NONCE_UUID,
        BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
    );
    g_pCharNonce->setCallbacks(new NonceCharacteristicCallbacks());
    g_pCharNonce->addDescriptor(new BLE2902());

    // Auth characteristic (Write - 33 bytes)
    g_pCharAuth = pService->createCharacteristic(
        CHAR_AUTH_UUID,
        BLECharacteristic::PROPERTY_WRITE
    );
    g_pCharAuth->setCallbacks(new AuthCharacteristicCallbacks());

    pService->start();

    // Start Broadcast
    startDualAdvertising();
    Serial.println("[SISTEMA] Listo para Walk-Up Unlock y Walk-Away Lock.");
}

void loop() {
    processRelayTimers();
    vTaskDelay(10 / portTICK_PERIOD_MS);
}
