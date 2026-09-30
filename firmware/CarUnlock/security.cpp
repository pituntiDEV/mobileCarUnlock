#include "security.h"
#include <mbedtls/md.h>
#include <esp_random.h>
#include <string.h>

static uint8_t hexNibble(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return 0;
}

static bool parseHexKey(const char* hexStr, uint8_t* outBytes, size_t maxBytes, size_t* outLen) {
    size_t hexLen = strlen(hexStr);
    if (hexLen % 2 != 0 || (hexLen / 2) > maxBytes) {
        return false;
    }
    *outLen = hexLen / 2;
    for (size_t i = 0; i < *outLen; i++) {
        outBytes[i] = (hexNibble(hexStr[i * 2]) << 4) | hexNibble(hexStr[i * 2 + 1]);
    }
    return true;
}

SecurityManager::SecurityManager()
    : m_nonceTimestamp(0), m_nonceActive(false), m_keyLen(0) {
    memset(m_currentNonce, 0, sizeof(m_currentNonce));
    memset(m_keyBytes, 0, sizeof(m_keyBytes));
}

void SecurityManager::init(const char* psk) {
    if (!parseHexKey(psk, m_keyBytes, sizeof(m_keyBytes), &m_keyLen)) {
        m_keyLen = strlen(psk);
        if (m_keyLen > sizeof(m_keyBytes)) {
            m_keyLen = sizeof(m_keyBytes);
        }
        memcpy(m_keyBytes, psk, m_keyLen);
    }
    invalidateNonce();
}

void SecurityManager::generateNewNonce(uint8_t* outNonce) {
    esp_fill_random(m_currentNonce, NONCE_LENGTH);
    m_nonceTimestamp = millis();
    m_nonceActive = true;

    if (outNonce != nullptr) {
        memcpy(outNonce, m_currentNonce, NONCE_LENGTH);
    }
}

bool SecurityManager::isNonceValid() const {
    if (!m_nonceActive) return false;
    if (millis() - m_nonceTimestamp > NONCE_TIMEOUT_MS) {
        return false;
    }
    return true;
}

void SecurityManager::invalidateNonce() {
    m_nonceActive = false;
    m_nonceTimestamp = 0;
    memset(m_currentNonce, 0, sizeof(m_currentNonce));
}

void SecurityManager::computeHMACSHA256(const uint8_t* key, size_t keyLen, 
                                        const uint8_t* data, size_t dataLen, 
                                        uint8_t* outDigest) {
    mbedtls_md_context_t ctx;
    mbedtls_md_type_t md_type = MBEDTLS_MD_SHA256;

    mbedtls_md_init(&ctx);
    mbedtls_md_setup(&ctx, mbedtls_md_info_from_type(md_type), 1);
    mbedtls_md_hmac_starts(&ctx, key, keyLen);
    mbedtls_md_hmac_update(&ctx, data, dataLen);
    mbedtls_md_hmac_finish(&ctx, outDigest);
    mbedtls_md_free(&ctx);
}

bool SecurityManager::constantTimeCompare(const uint8_t* a, const uint8_t* b, size_t size) {
    uint8_t result = 0;
    for (size_t i = 0; i < size; ++i) {
        result |= (a[i] ^ b[i]);
    }
    return (result == 0);
}

bool SecurityManager::verifyCommandHMAC(uint8_t command, const uint8_t* receivedHmac, size_t hmacLen) {
    if (!isNonceValid()) {
        return false;
    }
    if (hmacLen != HMAC_LENGTH) {
        return false;
    }

    // Message to sign is [Command (1B) + Nonce (16B)] (17 bytes)
    uint8_t messageToSign[1 + NONCE_LENGTH];
    messageToSign[0] = command;
    memcpy(&messageToSign[1], m_currentNonce, NONCE_LENGTH);

    // Compute expected HMAC-SHA256
    uint8_t expectedHmac[HMAC_LENGTH];
    computeHMACSHA256(m_keyBytes, m_keyLen, messageToSign, sizeof(messageToSign), expectedHmac);

    // Constant-time compare
    bool isValid = constantTimeCompare(receivedHmac, expectedHmac, HMAC_LENGTH);

    // Invalidate challenge immediately to prevent replay attacks
    invalidateNonce();

    return isValid;
}
