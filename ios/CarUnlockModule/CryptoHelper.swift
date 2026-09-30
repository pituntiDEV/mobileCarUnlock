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
    
    /// Converts a hex string (e.g. "a4f89c...") into raw Data
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
