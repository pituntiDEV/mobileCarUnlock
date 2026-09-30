# Guía de Instalación y Cableado Automotriz

Esta guía proporciona las instrucciones paso a paso para localizar las señales del vehículo e instalar el sistema **CarUnlock** de manera profesional y segura.

---

## 1. Identificación del Sistema de Cierre Centralizado

La mayoría de los vehículos emplean uno de los siguientes tipos de accionamiento para el cierre centralizado:

### Tipo A: Pulso Negativo (Más Común - 90% de los casos)
- **Comportamiento:** El cable de señal mantiene un voltaje flotante o de referencia (~5V o ~12V) a través de una resistencia pull-up interna en la computadora de carrocería (BCM).
- **Activación:** Al pulsar el botón interior de apertura de la puerta, ese cable se deriva momentáneamente a **GND (Masa)**.
- **Configuración del Relé:**
  - `COM` del relé -> Conectar a **GND** (Chasis del vehículo).
  - `NO` del relé -> Conectar al **Cable de Desbloqueo** del vehículo.

### Tipo B: Pulso Positivo (+12V)
- **Comportamiento:** El cable de señal permanece en 0V en reposo. Al pulsar el botón, recibe un pulso momentáneo de **+12V**.
- **Configuración del Relé:**
  - `COM` del relé -> Conectar a **+12V** (a través de fusible).
  - `NO` del relé -> Conectar al **Cable de Desbloqueo** del vehículo.

---

## 2. Cómo Encontrar el Cable de Desbloqueo con Multímetro

1. **Ubicación típica del mazo de cables:**
   - Detrás del panel de la puerta del conductor.
   - En el panel inferior del pilar "A" (junto al reposapiés del conductor).
   - En el conector principal del módulo BCM (Body Control Module), habitualmente bajo el volante o detrás de la guantera.
2. **Procedimiento de prueba:**
   - Conecta la sonda negra del multímetro a un tornillo sin pintar del chasis (Masa / GND).
   - Configura el multímetro en medición de voltaje DC (escala 20V).
   - Con una sonda tipo aguja (backprobe), inserta suavemente la punta roja en los pines del conector de la cerradura.
   - Presiona manualmente el botón de **Desbloquear (Unlock)** en la puerta del auto:
     - Si ves una caída rápida de voltaje (ej. de 12V a 0V durante el pulso): **Es un cable de pulso negativo**.
     - Si ves una subida rápida de 0V a 12V: **Es un cable de pulso positivo**.

---

## 3. Toma de Alimentación de 12V Segura ("Add-a-Circuit / Fuse Tap")

> [!WARNING]
> No cortes ni peles cables principales del mazo eléctrico bajo el volante sin protección. Utiliza siempre un adaptador de fusible ("Fuse Tap").

1. Abre la caja de fusibles interior del habitáculo.
2. Utiliza el multímetro para identificar un fusible con **12V Constante (Batería / B+)**, es decir, que mantenga 12V incluso con la llave quitada (ej. fusible del cierre centralizado original, luces de emergencia o bocina).
3. Inserta el **Fuse Tap**:
   - En la ranura inferior va el fusible original del vehículo.
   - En la ranura superior va el fusible de 1A dedicado al convertidor Buck del ESP32.
4. Conecta el cable de tierra (GND) a un punto de masa original del chasis asegurado con tuerca.

---

## 4. Análisis de Consumo Eléctrico y Batería

- **Consumo típico del ESP32 en modo BLE Advertising:** ~35 mA a 50 mA a 5V (equivalente a ~15-20 mA en la línea de 12V gracias a la eficiencia del convertidor Buck).
- **Consumo diario:** 20 mA × 24 h = ~0.48 Ah/día.
- En una batería automotriz estándar de 50 Ah a 60 Ah, este consumo representa menos del 1% diario, permitiendo dejar el auto estacionado por más de 3 a 4 semanas sin riesgo de descarga profunda.
- **Optimización opcional de firmware:**
  - Si el vehículo permanece inactivo por largos periodos, el intervalo de publicidad BLE se puede ampliar a 250 ms o habilitar *Light Sleep* entre intervalos de publicidad.

---

## 5. Medidas de Seguridad y Montaje

1. **Desconectar la Batería:** Desconecta el borne negativo de la batería del auto antes de manipular conectores o empalmes.
2. **Aislamiento Térmico y Mecánico:** Aloja el ESP32, el Buck y el módulo de relé dentro de un gabinete de plástico ABS ignífugo.
3. **Cinta Automotriz:** Envuelve todos los cables con cinta de tela automotriz (estilo *Tesa tape*) para evitar vibraciones, ruidos o fricciones contra los bordes metálicos de la carrocería.
4. **Ubicación de la Antena:** Coloca el módulo detrás del tablero o consola central, evitando encerrarlo completamente en una jaula metálica para asegurar una buena propagación de la señal Bluetooth hacia el exterior.
