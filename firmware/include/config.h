#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>

// ==============================================================================
// BLUETOOTH IDENTIFIERS (Matching Apple iBeacon & GATT Protocol Specs)
// ==============================================================================
#define BEACON_UUID           "e2c56db5-dffb-48d2-b060-d0f5a71096e0"
#define BEACON_MAJOR          1
#define BEACON_MINOR          1
#define BEACON_MEASURED_POWER -59 // Calibrated RSSI at 1 meter

// GATT Service & Characteristic UUIDs
#define SERVICE_UUID          "91bad492-b950-4226-aa2b-4ede9fa42f59"
#define CHAR_NONCE_UUID       "cba1d466-344c-4be3-ab3f-101f4633b380" // Read (16 bytes)
#define CHAR_AUTH_UUID        "ca73b3ba-39f6-4ab3-91ae-186dc9577d99" // Write (33 bytes)

#define DEVICE_NAME           "CarLock-ESP32"

// ==============================================================================
// PROTOCOL COMMAND CODES
// ==============================================================================
#define CMD_UNLOCK            0x01
#define CMD_LOCK              0x02

#define PAYLOAD_TOTAL_LENGTH  33   // 1 byte Command + 32 bytes HMAC-SHA256
#define NONCE_LENGTH          16   // 16 bytes challenge
#define HMAC_LENGTH           32   // 32 bytes digest

// ==============================================================================
// HARDWARE GPIO PIN DEFINITIONS
// ==============================================================================
#define PIN_RELAY_UNLOCK      23   // Pulse to unlock line (500 ms)
#define PIN_RELAY_LOCK        22   // Pulse to lock line (500 ms)
#define PIN_LED_STATUS        2    // Onboard status LED

#define RELAY_ACTIVE_LOGIC    HIGH

// ==============================================================================
// SECURITY & OPERATIONAL PARAMETERS
// ==============================================================================
// 32-byte Pre-Shared Key (PSK) stored in ESP32 Flash and iOS Keychain
#define PRE_SHARED_KEY        "c9a72b84ef301298dc56784310fedcba876543210abcdef0123456789abcdef"

#define DEFAULT_RSSI_THRESHOLD -65 // dBm (Approaching within ~1.5 meters)
#define RELAY_PULSE_MS         500 // Duration of relay closure
#define COOLDOWN_MS            180000 // 3 minutes cooldown for walk-up unlock
#define NONCE_TIMEOUT_MS       30000  // Challenge expires after 30 seconds

#endif // CONFIG_H
