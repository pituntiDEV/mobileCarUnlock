#ifndef SECURITY_H
#define SECURITY_H

#include <Arduino.h>
#include "config.h"

class SecurityManager {
public:
    SecurityManager();
    void init(const char* psk = PRE_SHARED_KEY);

    // Generates a 16-byte cryptographically secure random challenge
    void generateNewNonce(uint8_t* outNonce);

    // Checks if current nonce is still valid
    bool isNonceValid() const;

    // Invalidate challenge immediately after validation or timeout
    void invalidateNonce();

    // Verifies client HMAC over [Command (1B) + Nonce (16B)] against PSK
    bool verifyCommandHMAC(uint8_t command, const uint8_t* receivedHmac, size_t hmacLen);

    // Constant-time memory comparison to protect against side-channel timing attacks
    static bool constantTimeCompare(const uint8_t* a, const uint8_t* b, size_t size);

    // Utility: Computes HMAC-SHA256 using mbedtls
    static void computeHMACSHA256(const uint8_t* key, size_t keyLen, 
                                  const uint8_t* data, size_t dataLen, 
                                  uint8_t* outDigest);

private:
    uint8_t m_currentNonce[NONCE_LENGTH];
    uint32_t m_nonceTimestamp;
    bool m_nonceActive;
    uint8_t m_keyBytes[64];
    size_t m_keyLen;
};

#endif // SECURITY_H
