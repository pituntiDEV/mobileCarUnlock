import Foundation
import Security

/// Helper class for securely persisting secrets in the iOS Keychain.
/// Uses `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` to ensure the key
/// is accessible when the device is locked (screen off) after first boot unlock.
final class KeychainHelper {
    
    static let shared = KeychainHelper()
    private let serviceName = "com.carlock.auth"
    private let accountName = "VehiclePreSharedKey"
    
    // Default fallback PSK (32 bytes hex) matching ESP32 firmware
    static let defaultKeyHex = "c9a72b84ef301298dc56784310fedcba876543210abcdef0123456789abcdef"
    
    private init() {}
    
    /// Saves or updates the pre-shared key (PSK) in Keychain
    @discardableResult
    func saveSecretKey(_ key: String) -> Bool {
        guard let data = key.data(using: .utf8) else { return false }
        
        // Delete existing item if present
        deleteSecretKey()
        
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: accountName,
            kSecValueData as String: data,
            // Crucial: Must be accessible in background while phone is locked!
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]
        
        let status = SecItemAdd(query as CFDictionary, nil)
        return status == errSecSuccess
    }
    
    /// Retrieves the pre-shared key from Keychain (falls back to default if not set)
    func getSecretKey() -> String {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: accountName,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        
        if status == errSecSuccess, let data = item as? Data,
           let secret = String(data: data, encoding: .utf8), !secret.isEmpty {
            return secret
        }
        
        // Save and return default if not already initialized
        saveSecretKey(KeychainHelper.defaultKeyHex)
        return KeychainHelper.defaultKeyHex
    }
    
    /// Deletes the pre-shared key
    @discardableResult
    func deleteSecretKey() -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: accountName
        ]
        let status = SecItemDelete(query as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }
}
