import React, { useState, useEffect, useRef } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  StatusBar,
  Alert,
} from 'react-native';
import {
  CarLockNative,
  LockStateChangeEvent,
  LogUpdateEvent,
  StatusChangeEvent,
  isNativeAvailable,
} from './src/native/CarLockNative';

export default function App() {
  // Service State
  const [isMonitoring, setIsMonitoring] = useState<boolean>(true);
  const [isLocked, setIsLocked] = useState<boolean>(true);
  const [authorizationStatus, setAuthorizationStatus] = useState<string>('unknown');
  const [bluetoothState, setBluetoothState] = useState<string>('unknown');
  const [rssiThreshold, setRssiThreshold] = useState<number>(-65);
  const [currentRssi, setCurrentRssi] = useState<number>(-100);
  const [bannerDismissed, setBannerDismissed] = useState<boolean>(false);
  const [isRadarActive, setIsRadarActive] = useState<boolean>(false);
  const radarTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Manual Operation Loading
  const [activeAction, setActiveAction] = useState<'unlock' | 'lock' | null>(null);

  // Real-time Event Feed
  const [events, setEvents] = useState<
    Array<{
      id: string;
      timestamp: number;
      message: string;
      level: 'info' | 'warn' | 'error' | 'success';
    }>
  >([]);

  // 1. Initial Load & Native Subscriptions
  useEffect(() => {
    loadInitialSettings();

    // Listen to Status Updates
    const subStatus = CarLockNative.onStatusChange((status: StatusChangeEvent) => {
      setIsMonitoring(status.isMonitoring);
      setAuthorizationStatus(status.authorizationStatus);
      setBluetoothState(status.bluetoothState);
      setRssiThreshold(status.rssiThreshold);
      setIsLocked(status.isLocked);
    });

    // Listen to Real-time Logs
    const subLog = CarLockNative.onLogUpdate((log: LogUpdateEvent) => {
      addLogEntry(log.message, log.level, log.timestamp);
    });

    // Listen to Lock State Changes
    const subLockState = CarLockNative.onLockStateChange((data: LockStateChangeEvent) => {
      setIsLocked(data.isLocked);
      addLogEntry(
        `Vehículo ${data.isLocked ? 'BLOQUEADO' : 'DESBLOQUEADO'} (${data.reason})`,
        data.isLocked ? 'warn' : 'success',
        data.timestamp
      );
    });

    // Listen to RSSI Updates
    const subRssi = CarLockNative.onRssiUpdate((data: { rssi: number }) => {
      setCurrentRssi(data.rssi);
    });

    return () => {
      subStatus?.remove();
      subLog?.remove();
      subLockState?.remove();
      subRssi?.remove();
    };
  }, []);

  const loadInitialSettings = async () => {
    const settings = await CarLockNative.getProximitySettings();
    setIsMonitoring(settings.isMonitoring);
    setRssiThreshold(settings.rssiThreshold);
    setAuthorizationStatus(settings.authorizationStatus);
    setBluetoothState(settings.bluetoothState);
    setIsLocked(settings.isLocked);

    addLogEntry('Módulo CarLock iniciado. Listo para control de acceso vehicular.', 'info');
  };

  const addLogEntry = (
    message: string,
    level: 'info' | 'warn' | 'error' | 'success' = 'info',
    timestamp = Date.now()
  ) => {
    setEvents((prev) => [
      { id: Math.random().toString(), timestamp, message, level },
      ...prev.slice(0, 49), // Retain last 50 events
    ]);
  };

  // 2. Proximity Hands-Free Toggle
  const handleToggleMonitoring = async (enabled: boolean) => {
    setIsMonitoring(enabled);
    if (enabled) {
      const res = await CarLockNative.startProximityService();
      if (res.success) {
        addLogEntry('Servicio de proximidad activo (Walk-Up / Walk-Away)', 'success');
      }
    } else {
      const res = await CarLockNative.stopProximityService();
      if (res.success) {
        addLogEntry('Servicio de proximidad pausado', 'info');
      }
    }
  };

  // 3. Manual On-Demand Trigger
  const handleManualAction = async (action: 'unlock' | 'lock') => {
    if (activeAction) return;
    setActiveAction(action);
    addLogEntry(`Enviando comando manual: ${action.toUpperCase()}...`, 'info');

    try {
      const result = await CarLockNative.manualTrigger(action);
      if (result.success) {
        setIsLocked(action === 'lock');
        addLogEntry(
          `Comando ${action.toUpperCase()} ejecutado exitosamente con ESP32`,
          'success'
        );
      }
    } catch (err: any) {
      addLogEntry(`Fallo al ejecutar ${action}: ${err.message || 'Error BLE'}`, 'error');
      Alert.alert('Fallo de Conexión', err.message || 'No se pudo conectar con el ESP32');
    } finally {
      setActiveAction(null);
    }
  };

  // 4. Proximity Simulation for Expo Go Mode
  const simulateProximityWalkUp = () => {
    addLogEntry('iBeacon detectado: e2c56db5 (Major: 1, Minor: 1)', 'info');
    setCurrentRssi(-58);
    setTimeout(() => {
      addLogEntry('RSSI -58 dBm >= Umbral (-65 dBm). Conectando BLE GATT...', 'info');
      setTimeout(() => {
        addLogEntry('Firma HMAC-SHA256 validada con éxito con ESP32.', 'success');
        setIsLocked(false);
        addLogEntry('Vehículo DESBLOQUEADO (Walk-Up de proximidad)', 'success');
      }, 400);
    }, 350);
  };

  const simulateProximityWalkAway = () => {
    addLogEntry('iBeacon señal perdida / didExitRegion', 'warn');
    setCurrentRssi(-95);
    setTimeout(() => {
      addLogEntry('Transmitiendo comando BLE LOCK (0x02)...', 'info');
      setTimeout(() => {
        setIsLocked(true);
        addLogEntry('Vehículo BLOQUEADO (Walk-Away automático)', 'warn');
      }, 400);
    }, 350);
  };

  // 5. Live BLE Proximity Distance & Radar Engine
  const calculateDistance = (rssi: number): string => {
    if (rssi <= -95) return '> 15 m';
    if (rssi >= -40) return '< 0.3 m';
    const measuredPower = -59;
    const n = 2.0;
    const dist = Math.pow(10, (measuredPower - rssi) / (10 * n));
    return `${dist.toFixed(1)} m`;
  };

  const getSignalMeta = (rssi: number) => {
    if (rssi >= -55) {
      return { label: '🟢 Muy Cerca (Zona de Entrada: < 0.8m)', color: '#00E676', bars: 5 };
    }
    if (rssi >= -65) {
      return { label: '🔵 Zona de Desbloqueo Walk-Up (1-2m)', color: '#00E5FF', bars: 4 };
    }
    if (rssi >= -75) {
      return { label: '🟡 Aproximación Detectada (3-6m)', color: '#FFAB00', bars: 3 };
    }
    if (rssi >= -85) {
      return { label: '🟠 Límite de Cobertura iBeacon (7-12m)', color: '#FF9100', bars: 2 };
    }
    return { label: '⚪ Fuera de Alcance / En Espera', color: '#757575', bars: 1 };
  };

  const updateRssiAndEvaluate = (newRssi: number) => {
    setCurrentRssi(newRssi);
    if (isMonitoring) {
      if (newRssi >= rssiThreshold && isLocked) {
        setIsLocked(false);
        addLogEntry(`[Radar] RSSI ${newRssi} dBm cruzó umbral (${rssiThreshold} dBm) -> AUTO-UNLOCK`, 'success');
      } else if (newRssi < rssiThreshold - 15 && !isLocked) {
        setIsLocked(true);
        addLogEntry(`[Radar] RSSI ${newRssi} dBm cayó bajo zona segura -> AUTO-LOCK`, 'warn');
      }
    }
  };

  const walkSteps = [
    { rssi: -90, msg: '🚶 Iniciando caminata hacia el auto: 15 metros' },
    { rssi: -82, msg: '📡 Señal iBeacon detectada a ~10 metros' },
    { rssi: -74, msg: '🚶 Acercándote al vehículo (~5.5 metros)' },
    { rssi: -66, msg: '🟡 En zona de advertencia (~2.2 metros)...' },
    { rssi: -58, msg: '🟢 ¡UMBRAL DE APERTURA ALCANZADO! (~0.9 metros)' },
    { rssi: -48, msg: '🔑 Junto a la manija de la puerta (~0.3 metros)' },
    { rssi: -45, msg: '🚗 Dentro del vehículo (~0.2 metros)' },
    { rssi: -55, msg: '🚶 Comenzando a alejarte...' },
    { rssi: -70, msg: '🚶 Alejándote a ~4 metros' },
    { rssi: -80, msg: '🚶 Saliendo del perímetro (~8.5 metros)' },
    { rssi: -88, msg: '🔒 Señal débil: activación de Walk-Away Auto-Lock' },
  ];

  const toggleLiveRadar = () => {
    if (isRadarActive) {
      if (radarTimerRef.current) clearInterval(radarTimerRef.current);
      setIsRadarActive(false);
      addLogEntry('Radar continuo en vivo pausado', 'info');
    } else {
      setIsRadarActive(true);
      addLogEntry('Radar continuo BLE en vivo activado (Simulando caminata)', 'info');
      let stepIndex = 0;
      radarTimerRef.current = setInterval(() => {
        const step = walkSteps[stepIndex];
        updateRssiAndEvaluate(step.rssi);
        addLogEntry(step.msg, step.rssi >= -65 ? 'success' : step.rssi <= -82 ? 'warn' : 'info');
        stepIndex = (stepIndex + 1) % walkSteps.length;
      }, 1500);
    }
  };

  useEffect(() => {
    return () => {
      if (radarTimerRef.current) clearInterval(radarTimerRef.current);
    };
  }, []);

  // 6. RSSI Threshold Calibration
  const handleChangeThreshold = async (val: number) => {
    setRssiThreshold(val);
    await CarLockNative.setRssiThreshold(val);
  };

  // Format Helper
  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toTimeString().split(' ')[0];
  };

  const isAlwaysAuthorized = authorizationStatus === 'authorizedAlways';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0B0E14" />
      <ScrollView contentContainerStyle={styles.container} bounces={false}>

        {/* ================================================================= */}
        {/* HEADER & VEHICLE LOCK STATUS BADGE                                */}
        {/* ================================================================= */}
        <View style={styles.header}>
          <View>
            <Text style={styles.brandTitle}>CARLOCK PRO</Text>
            <Text style={styles.brandSubtitle}>ACCESO VEHICULAR INTELIGENTE</Text>
          </View>

          <View
            style={[
              styles.lockStatusBadge,
              isLocked ? styles.badgeLocked : styles.badgeUnlocked,
            ]}
          >
            <Text style={styles.lockBadgeIcon}>{isLocked ? '🔒' : '🔓'}</Text>
            <Text
              style={[
                styles.lockBadgeText,
                { color: isLocked ? '#FFAB00' : '#00E676' },
              ]}
            >
              {isLocked ? 'BLOQUEADO' : 'ABIERTO'}
            </Text>
          </View>
        </View>

        {/* ================================================================= */}
        {/* EXPO GO PREVIEW / SIMULATION BANNER                               */}
        {/* ================================================================= */}
        {!isNativeAvailable && !bannerDismissed && (
          <View style={styles.expoGoBanner}>
            <View style={styles.bannerHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <Text style={styles.bannerIcon}>📱</Text>
                <Text style={styles.expoBannerTitle}>Modo Expo Go (Vista Previa)</Text>
              </View>
              <TouchableOpacity
                onPress={() => setBannerDismissed(true)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.dismissBtn}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.expoBannerText}>
              Los controles manuales, la sensibilidad y la consola de auditoría están 100% operativos. Prueba las simulaciones de proximidad:
            </Text>
            <View style={styles.simulationBtnRow}>
              <TouchableOpacity
                style={styles.simBtnUnlock}
                onPress={simulateProximityWalkUp}
                activeOpacity={0.8}
              >
                <Text style={styles.simBtnTextUnlock}>🚶‍♂️ Simular Walk-Up</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.simBtnLock}
                onPress={simulateProximityWalkAway}
                activeOpacity={0.8}
              >
                <Text style={styles.simBtnTextLock}>🚶‍♀️ Simular Walk-Away</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ================================================================= */}
        {/* NATIVE iOS PERMISSION BANNER (Only on native builds when ungranted)*/}
        {/* ================================================================= */}
        {isNativeAvailable && !isAlwaysAuthorized && !bannerDismissed && (
          <View style={styles.permissionBanner}>
            <View style={styles.bannerHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <Text style={styles.bannerIcon}>⚠️</Text>
                <Text style={styles.bannerTitle}>
                  Permiso "Siempre" Requerido en iOS
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setBannerDismissed(true)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.dismissBtn}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.bannerText}>
              Para que el auto se desbloquee al acercarte y se bloquee al alejarte con la{' '}
              <Text style={{ fontWeight: '700', color: '#FFF' }}>pantalla apagada</Text>
              , iOS exige cambiar el permiso de ubicación a "Permitir siempre".
            </Text>
            <TouchableOpacity
              style={styles.bannerButton}
              onPress={() => Linking.openSettings()}
              activeOpacity={0.8}
            >
              <Text style={styles.bannerButtonText}>Abrir Ajustes de iOS</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ================================================================= */}
        {/* HANDS-FREE AUTOMATION SWITCH CARD                                 */}
        {/* ================================================================= */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleGroup}>
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor:
                      isMonitoring && bluetoothState === 'poweredOn'
                        ? '#00E676'
                        : '#757575',
                  },
                ]}
              />
              <Text style={styles.cardTitle}>Modo Manos Libres</Text>
            </View>

            <Switch
              value={isMonitoring}
              onValueChange={handleToggleMonitoring}
              trackColor={{ false: '#1E2532', true: '#00E5FF' }}
              thumbColor={isMonitoring ? '#FFFFFF' : '#757575'}
            />
          </View>

          <Text style={styles.cardDescription}>
            • <Text style={{ color: '#00E5FF', fontWeight: '600' }}>Walk-Up Unlock:</Text> Abre el vehículo automáticamente al acercarte.
            {'\n'}• <Text style={{ color: '#FFAB00', fontWeight: '600' }}>Walk-Away Auto-Lock:</Text> Cierra y asegura las puertas al alejarte.
          </Text>

          <View style={styles.divider} />

          <View style={styles.statusRow}>
            <View style={styles.chip}>
              <Text style={styles.chipLabel}>BLUETOOTH</Text>
              <Text
                style={[
                  styles.chipValue,
                  {
                    color:
                      bluetoothState === 'poweredOn' ? '#00E676' : '#FF1744',
                  },
                ]}
              >
                {bluetoothState === 'poweredOn' ? 'Activo' : 'Desactivado'}
              </Text>
            </View>

            <View style={styles.chip}>
              <Text style={styles.chipLabel}>UBICACIÓN</Text>
              <Text
                style={[
                  styles.chipValue,
                  { color: isAlwaysAuthorized ? '#00E676' : '#FFAB00' },
                ]}
              >
                {isAlwaysAuthorized ? 'Siempre (OK)' : 'Limitada'}
              </Text>
            </View>

            <View style={styles.chip}>
              <Text style={styles.chipLabel}>SEÑAL ESP32</Text>
              <Text style={[styles.chipValue, { color: '#00E5FF' }]}>
                {currentRssi !== -100 ? `${currentRssi} dBm` : '--'}
              </Text>
            </View>
          </View>
        </View>

        {/* ================================================================= */}
        {/* LIVE BLE PROXIMITY RADAR & DISTANCE METER                         */}
        {/* ================================================================= */}
        <View style={styles.radarCard}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleGroup}>
              <Text style={{ fontSize: 18, marginRight: 8 }}>📡</Text>
              <Text style={styles.cardTitle}>Radar de Proximidad BLE</Text>
              {isRadarActive && (
                <View style={styles.liveTag}>
                  <Text style={styles.liveTagText}>EN VIVO</Text>
                </View>
              )}
            </View>
            <TouchableOpacity
              style={[
                styles.radarToggleBtn,
                isRadarActive ? styles.radarToggleBtnStop : styles.radarToggleBtnStart,
              ]}
              onPress={toggleLiveRadar}
              activeOpacity={0.8}
            >
              <Text style={styles.radarToggleText}>
                {isRadarActive ? '⏸️ Pausar Radar' : '▶️ Simular Caminata'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Main Meter Row: RSSI & Distance & Bars */}
          <View style={styles.meterContainer}>
            <View style={styles.meterValueBlock}>
              <Text style={styles.meterRssiNumber}>
                {currentRssi !== -100 ? `${currentRssi}` : '--'}
                <Text style={styles.meterUnit}> dBm</Text>
              </Text>
              <Text style={styles.meterDistanceText}>
                Distancia estimada: <Text style={{ color: '#00E5FF', fontWeight: '800' }}>{calculateDistance(currentRssi)}</Text>
              </Text>
            </View>

            {/* Dynamic Signal Bars */}
            <View style={styles.signalBarsContainer}>
              {[1, 2, 3, 4, 5].map((barIndex) => {
                const meta = getSignalMeta(currentRssi);
                const isBarActive = meta.bars >= barIndex;
                const barHeight = 8 + barIndex * 6;
                return (
                  <View
                    key={barIndex}
                    style={[
                      styles.signalBar,
                      {
                        height: barHeight,
                        backgroundColor: isBarActive ? meta.color : '#1E2532',
                      },
                    ]}
                  />
                );
              })}
            </View>
          </View>

          {/* Zone Badge */}
          <View
            style={[
              styles.zonePill,
              { borderColor: getSignalMeta(currentRssi).color },
            ]}
          >
            <Text style={[styles.zonePillText, { color: getSignalMeta(currentRssi).color }]}>
              {getSignalMeta(currentRssi).label}
            </Text>
          </View>

          {/* Stepper Buttons for Manual Live Adjustment */}
          <View style={styles.stepperRow}>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => updateRssiAndEvaluate(Math.max(-100, (currentRssi === -100 ? -90 : currentRssi) - 5))}
              activeOpacity={0.7}
            >
              <Text style={styles.stepperBtnText}>➖ Alejarse (-5 dBm)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.stepperBtn, styles.stepperBtnCloser]}
              onPress={() => updateRssiAndEvaluate(Math.min(-40, (currentRssi === -100 ? -70 : currentRssi) + 5))}
              activeOpacity={0.7}
            >
              <Text style={styles.stepperBtnTextCloser}>➕ Acercarse (+5 dBm)</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ================================================================= */}
        {/* MANUAL DUAL CONTROLS (DESBLOQUEAR / BLOQUEAR)                     */}
        {/* ================================================================= */}
        <View style={styles.manualControlsRow}>
          <TouchableOpacity
            style={[
              styles.actionButton,
              styles.unlockButton,
              activeAction === 'unlock' && styles.actionButtonDisabled,
            ]}
            onPress={() => handleManualAction('unlock')}
            disabled={activeAction !== null}
            activeOpacity={0.8}
          >
            {activeAction === 'unlock' ? (
              <ActivityIndicator color="#0B0E14" />
            ) : (
              <View style={styles.actionInner}>
                <Text style={styles.actionIcon}>🔓</Text>
                <Text style={styles.actionTextUnlock}>DESBLOQUEAR</Text>
                <Text style={styles.actionSubtext}>Comando 0x01</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.actionButton,
              styles.lockButton,
              activeAction === 'lock' && styles.actionButtonDisabled,
            ]}
            onPress={() => handleManualAction('lock')}
            disabled={activeAction !== null}
            activeOpacity={0.8}
          >
            {activeAction === 'lock' ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <View style={styles.actionInner}>
                <Text style={styles.actionIcon}>🔒</Text>
                <Text style={styles.actionTextLock}>BLOQUEAR</Text>
                <Text style={styles.actionSubtext}>Comando 0x02</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* ================================================================= */}
        {/* PROXIMITY CALIBRATION (RSSI SLIDER & PRESETS)                     */}
        {/* ================================================================= */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Sensibilidad de Proximidad</Text>
            <View style={styles.rssiBadge}>
              <Text style={styles.rssiBadgeText}>{rssiThreshold} dBm</Text>
            </View>
          </View>

          <Text style={styles.cardDescription}>
            Filtro de potencia de señal para apertura. Valores más altos (cerca de -50 dBm) exigen estar más pegado al auto.
          </Text>

          {/* Preset Buttons */}
          <View style={styles.presetRow}>
            {[
              { label: 'Cerca (-55 dBm)', val: -55 },
              { label: 'Óptimo (-65 dBm)', val: -65 },
              { label: 'Medio (-75 dBm)', val: -75 },
              { label: 'Lejos (-82 dBm)', val: -82 },
            ].map((p) => {
              const active = rssiThreshold === p.val;
              return (
                <TouchableOpacity
                  key={p.val}
                  style={[styles.presetPill, active && styles.presetPillActive]}
                  onPress={() => handleChangeThreshold(p.val)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.presetPillText,
                      active && styles.presetPillTextActive,
                    ]}
                  >
                    {p.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Steppers for precise adjustment */}
          <View style={styles.stepperRow}>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => handleChangeThreshold(Math.max(-85, rssiThreshold - 1))}
              activeOpacity={0.6}
            >
              <Text style={styles.stepperText}>- 1 dBm (Mayor alcance)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => handleChangeThreshold(Math.min(-50, rssiThreshold + 1))}
              activeOpacity={0.6}
            >
              <Text style={styles.stepperText}>+ 1 dBm (Más cerca)</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ================================================================= */}
        {/* REAL-TIME EVENT FEED & DIAGNOSTICS                                */}
        {/* ================================================================= */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Registro de Eventos en Vivo</Text>
            {events.length > 0 && (
              <TouchableOpacity
                onPress={() => setEvents([])}
                activeOpacity={0.6}
              >
                <Text style={styles.clearLogsText}>Limpiar</Text>
              </TouchableOpacity>
            )}
          </View>

          {events.length === 0 ? (
            <View style={styles.emptyFeed}>
              <Text style={styles.emptyFeedText}>
                Esperando eventos de proximidad o comandos...
              </Text>
            </View>
          ) : (
            <View style={styles.eventList}>
              {events.map((ev) => {
                let badgeColor = '#00E5FF';
                if (ev.level === 'success') badgeColor = '#00E676';
                if (ev.level === 'warn') badgeColor = '#FFAB00';
                if (ev.level === 'error') badgeColor = '#FF1744';

                return (
                  <View key={ev.id} style={styles.eventItem}>
                    <View style={styles.eventTimeCol}>
                      <Text style={styles.eventTimeText}>
                        {formatTime(ev.timestamp)}
                      </Text>
                      <View
                        style={[
                          styles.eventDot,
                          { backgroundColor: badgeColor },
                        ]}
                      />
                    </View>
                    <Text style={styles.eventMessageText}>{ev.message}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0B0E14',
  },
  container: {
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 8,
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
  brandSubtitle: {
    fontSize: 11,
    color: '#00E5FF',
    fontWeight: '600',
    letterSpacing: 1,
    marginTop: 2,
  },
  lockStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  badgeLocked: {
    backgroundColor: 'rgba(255, 171, 0, 0.15)',
    borderColor: '#FFAB00',
  },
  badgeUnlocked: {
    backgroundColor: 'rgba(0, 230, 118, 0.15)',
    borderColor: '#00E676',
  },
  lockBadgeIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  lockBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  dismissBtn: {
    color: '#8B98A5',
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 8,
  },
  expoGoBanner: {
    backgroundColor: 'rgba(0, 229, 255, 0.08)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#00E5FF',
    marginBottom: 16,
  },
  expoBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#00E5FF',
  },
  expoBannerText: {
    fontSize: 13,
    color: '#B0BEC5',
    lineHeight: 18,
    marginBottom: 12,
  },
  simulationBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  simBtnUnlock: {
    flex: 1,
    backgroundColor: 'rgba(0, 230, 118, 0.15)',
    borderWidth: 1,
    borderColor: '#00E676',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  simBtnLock: {
    flex: 1,
    backgroundColor: 'rgba(255, 171, 0, 0.15)',
    borderWidth: 1,
    borderColor: '#FFAB00',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  simBtnTextUnlock: {
    color: '#00E676',
    fontWeight: '700',
    fontSize: 12,
  },
  simBtnTextLock: {
    color: '#FFAB00',
    fontWeight: '700',
    fontSize: 12,
  },
  permissionBanner: {
    backgroundColor: 'rgba(255, 171, 0, 0.12)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FFAB00',
    marginBottom: 16,
  },
  bannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  bannerIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  bannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFAB00',
  },
  bannerText: {
    fontSize: 13,
    color: '#B0BEC5',
    lineHeight: 18,
    marginBottom: 12,
  },
  bannerButton: {
    backgroundColor: '#FFAB00',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  bannerButtonText: {
    color: '#0B0E14',
    fontWeight: '700',
    fontSize: 13,
  },
  radarCard: {
    backgroundColor: '#111722',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#00E5FF',
    marginBottom: 16,
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  liveTag: {
    backgroundColor: 'rgba(0, 230, 118, 0.2)',
    borderColor: '#00E676',
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 6,
  },
  liveTagText: {
    color: '#00E676',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  radarToggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  radarToggleBtnStart: {
    backgroundColor: 'rgba(0, 229, 255, 0.15)',
    borderColor: '#00E5FF',
  },
  radarToggleBtnStop: {
    backgroundColor: 'rgba(255, 23, 68, 0.15)',
    borderColor: '#FF1744',
  },
  radarToggleText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  meterContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 12,
    backgroundColor: '#161E2E',
    padding: 14,
    borderRadius: 12,
  },
  meterValueBlock: {
    flex: 1,
  },
  meterRssiNumber: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  meterUnit: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8B98A5',
  },
  meterDistanceText: {
    fontSize: 13,
    color: '#B0BEC5',
    marginTop: 4,
  },
  signalBarsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 5,
    paddingBottom: 4,
  },
  signalBar: {
    width: 8,
    borderRadius: 4,
  },
  zonePill: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
    marginBottom: 12,
  },
  zonePillText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  stepperRow: {
    flexDirection: 'row',
    gap: 10,
  },
  stepperBtn: {
    flex: 1,
    backgroundColor: '#1E2532',
    borderWidth: 1,
    borderColor: '#2A3344',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  stepperBtnCloser: {
    borderColor: '#00E5FF',
    backgroundColor: 'rgba(0, 229, 255, 0.1)',
  },
  stepperBtnText: {
    color: '#B0BEC5',
    fontWeight: '700',
    fontSize: 12,
  },
  stepperBtnTextCloser: {
    color: '#00E5FF',
    fontWeight: '700',
    fontSize: 12,
  },
  card: {
    backgroundColor: '#151A23',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A3344',
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cardDescription: {
    fontSize: 13,
    color: '#8B98A5',
    lineHeight: 19,
    marginBottom: 12,
  },
  divider: {
    height: 1,
    backgroundColor: '#2A3344',
    marginVertical: 10,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  chip: {
    flex: 1,
    alignItems: 'center',
  },
  chipLabel: {
    fontSize: 10,
    color: '#52606D',
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  chipValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  manualControlsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 20,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  unlockButton: {
    backgroundColor: '#00E5FF',
    shadowColor: '#00E5FF',
  },
  lockButton: {
    backgroundColor: '#1E2532',
    borderWidth: 1,
    borderColor: '#FF1744',
    shadowColor: '#FF1744',
  },
  actionButtonDisabled: {
    opacity: 0.6,
  },
  actionInner: {
    alignItems: 'center',
  },
  actionIcon: {
    fontSize: 22,
    marginBottom: 6,
  },
  actionTextUnlock: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0B0E14',
    letterSpacing: 0.8,
  },
  actionTextLock: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.8,
  },
  actionSubtext: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },
  rssiBadge: {
    backgroundColor: 'rgba(0, 229, 255, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#00E5FF',
  },
  rssiBadgeText: {
    fontSize: 11,
    fontFamily: 'Courier',
    fontWeight: '700',
    color: '#00E5FF',
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  presetPill: {
    backgroundColor: '#1E2532',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A3344',
  },
  presetPillActive: {
    backgroundColor: 'rgba(0, 229, 255, 0.15)',
    borderColor: '#00E5FF',
  },
  presetPillText: {
    fontSize: 12,
    color: '#8B98A5',
  },
  presetPillTextActive: {
    color: '#00E5FF',
    fontWeight: '700',
  },
  stepperRow: {
    flexDirection: 'row',
    gap: 8,
  },
  stepperBtn: {
    flex: 1,
    backgroundColor: '#1E2532',
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A3344',
  },
  stepperText: {
    fontSize: 12,
    color: '#FFFFFF',
  },
  clearLogsText: {
    fontSize: 12,
    color: '#52606D',
  },
  emptyFeed: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyFeedText: {
    fontSize: 13,
    color: '#52606D',
  },
  eventList: {
    marginTop: 4,
  },
  eventItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1E2532',
  },
  eventTimeCol: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 10,
    width: 75,
  },
  eventTimeText: {
    fontSize: 11,
    color: '#52606D',
    fontFamily: 'Courier',
    marginRight: 6,
  },
  eventDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  eventMessageText: {
    flex: 1,
    fontSize: 12,
    color: '#ECEFF1',
    lineHeight: 16,
  },
});
