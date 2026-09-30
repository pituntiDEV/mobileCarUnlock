# ESP32 Firmware: Smart Car Proximity Unlock

Este firmware convierte un módulo ESP32 en un sistema de autenticación de proximidad para vehículos combinando tramas de **iBeacon** (para despertar pasivo en iOS) y un **Servidor BLE GATT** seguro con Challenge-Response.

## Características Principales
1. **Publicidad Simultánea Dual:** Emite tramas Apple iBeacon estándar (UUID, Major, Minor, TxPower) y a su vez anuncia el servicio GATT seguro en la trama de respuesta de escaneo (`Scan Response`).
2. **Protocolo Challenge-Response:** 
   - Generación de un número aleatorio de 16 bytes (Nonce) mediante el hardware TRNG del ESP32 (`esp_fill_random`).
   - Verificación de firma criptográfica HMAC-SHA256 con aceleración por hardware (`mbedtls`).
   - Comparación en tiempo constante para mitigar ataques de canal lateral (Timing Attacks).
3. **Mecanismo Anti-rebote (Cooldown):** Impide re-aperturas no deseadas durante 3 minutos (180,000 ms) tras una apertura exitosa.
4. **Pulso de Relé de 500 ms no bloqueante:** Controlado por temporizadores de FreeRTOS sin congelar la pila BLE.

---

## Estructura de Archivos
- `include/config.h`: UUIDs de iBeacon y GATT, credenciales pre-compartidas (PSK), temporizadores y pines GPIO.
- `include/security.h`: Declaración del gestor de seguridad criptográfico.
- `src/security.cpp`: Implementación de HMAC-SHA256, TRNG y comparación de tiempo constante.
- `src/main.cpp`: Inicialización del servidor BLE, callbacks de eventos GATT y control del relé.
- `platformio.ini`: Configuración para PlatformIO.

---

## Compilación y Flasheo

### Opción 1: Con PlatformIO (VS Code o CLI)
```bash
cd firmware
pio run --target upload
pio device monitor -b 115200
```

### Opción 2: Con Arduino IDE (v2.x)
1. Instalar el paquete de placas **ESP32 by Espressif Systems** (versión 2.0.x o 3.0.x).
2. Seleccionar la placa: **ESP32 Dev Module**.
3. Configurar:
   - Partition Scheme: `Default 4MB with spiffs` o `Minimal SPIFFS (1.9MB APP with OTA/190KB SPIFFS)`
   - Upload Speed: `921600`
   - Core Debug Level: `Info`
4. Copiar los archivos en la carpeta de sketch y pulsar **Upload**.

---

## Mapeo de Pines Predeterminado
| Pin ESP32 | Función | Destino en Hardware |
| :--- | :--- | :--- |
| **GPIO 23** | Salida Digital | Entrada de señal del módulo de relé / optoacoplador |
| **GPIO 2** | Salida Digital | LED indicador de estado a bordo |
| **GND** | Referencia | GND común del vehículo / módulo de relé |
| **VIN / 5V** | Alimentación | Salida de 5V del convertidor Buck Step-Down |
