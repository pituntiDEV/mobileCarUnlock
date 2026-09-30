import Foundation
import CommonCrypto

final class CryptoHelper {
    
    /// Computes HMAC-SHA256 using Apple CommonCrypto
    static func hmacSHA256(key: Data, data: Data) -> Data {
        var hmac = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
        
        key.withUnsafeBytes { keyBytes in
            data.withUnsafeBytes { dataBytes in
                CCHmac(
                    CCHmacAlgorithm(kCCHmacAlgSHA256),
                    keyBytes.baseAddress,
                    key.count,
                    dataBytes.baseAddress,
                    data.count,
                    &hmac
                )
            }
        }
        
        return Data(hmac)
    }
    
    /// Constructs the 33-byte authentication payload:
    /// - Byte 0: Command (0x01 = UNLOCK, 0x02 = LOCK)
    /// - Bytes 1..32: HMAC-SHA256 over [Command (1B) + Nonce (16B)] using 32B PSK
    static func buildAuthPayload(command: UInt8, nonce: Data, pskString: String) -> Data? {
        guard nonce.count == 16 else { return nil }
        
        // 1. Resolve PSK Data (prefer 64-char hex -> 32 bytes)
        let keyData: Data
        if let hexData = dataFromHexString(pskString), hexData.count == 32 {
            keyData = hexData
        } else if let utf8Data = pskString.data(using: .utf8), utf8Data.count == 32 {
            keyData = utf8Data
        } else {
            // Hash key to ensure 32 bytes if length is non-standard
            keyData = sha256(data: pskString.data(using: .utf8) ?? Data())
        }
        
        // 2. Prepare message to sign = [Command (1B) + Nonce (16B)] (17 bytes total)
        var messageToSign = Data([command])
        messageToSign.append(nonce)
        
        // 3. Compute HMAC-SHA256 (32 bytes)
        let signature = hmacSHA256(key: keyData, data: messageToSign)
        guard signature.count == 32 else { return nil }
        
        // 4. Construct final 33-byte payload = [Command (1B) + Signature (32B)]
        var payload = Data([command])
        payload.append(signature)
        return payload
    }
    
    /// SHA256 helper
    static func sha256(data: Data) -> Data {
        var hash = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
        data.withUnsafeBytes {
            _ = CC_SHA256($0.baseAddress, CC_LONG(data.count), &hash)
        }
        return Data(hash)
    }

    /// Converts a hex string into raw Data
    static func dataFromHexString(_ hex: String) -> Data? {
        var hexSanitized = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if hexSanitized.hasPrefix("0x") {
            hexSanitized = String(hexSanitized.dropFirst(2))
        }
        
        guard hexSanitized.count % 2 == 0 else { return nil }
        
        var data = Data()
        var index = hexSanitized.startIndex
        
        while index < hexSanitized.endIndex {
            let nextIndex = hexSanitized.index(index, offsetBy: 2)
            let byteString = hexSanitized[index..<nextIndex]
            guard let byte = UInt8(byteString, radix: 16) else { return nil }
            data.append(byte)
            index = nextIndex
        }
        
        return data
    }
    
    /// Converts raw Data to hex string representation
    static func hexString(from data: Data) -> String {
        return data.map { String(format: "%02hhx", $0) }.joined()
    }
}
