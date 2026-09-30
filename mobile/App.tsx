import React, { useState, useEffect } from 'react';
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
} from './src/native/CarLockNative';

export default function App() {
  // Service State
  const [isMonitoring, setIsMonitoring] = useState<boolean>(true);
  const [isLocked, setIsLocked] = useState<boolean>(true);
  const [authorizationStatus, setAuthorizationStatus] = useState<string>('unknown');
  const [bluetoothState, setBluetoothState] = useState<string>('unknown');
  const [rssiThreshold, setRssiThreshold] = useState<number>(-65);
  const [currentRssi, setCurrentRssi] = useState<number>(-100);

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

  // 4. RSSI Threshold Calibration
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
        {/* PERMISSION WARNING BANNER (Apple iOS Always Required)            */}
        {/* ================================================================= */}
        {!isAlwaysAuthorized && (
          <View style={styles.permissionBanner}>
            <View style={styles.bannerHeader}>
              <Text style={styles.bannerIcon}>⚠️</Text>
              <Text style={styles.bannerTitle}>
                Permiso "Siempre" Requerido en iOS
              </Text>
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
