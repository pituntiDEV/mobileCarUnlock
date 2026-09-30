import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StatusBar,
} from 'react-native';
import { theme } from '../styles/theme';
import { CarUnlockNative } from '../native/CarUnlockNative';
import { UnlockEvent, MonitoringStatus } from '../types';
import { StatusCard } from '../components/StatusCard';
import { SensitivitySlider } from '../components/SensitivitySlider';
import { EventLogList } from '../components/EventLogList';
import { PermissionModal } from '../components/PermissionModal';
import { SecretKeyModal } from '../components/SecretKeyModal';

export const HomeScreen: React.FC = () => {
  // State
  const [monitoringStatus, setMonitoringStatus] = useState<MonitoringStatus>({
    isMonitoring: false,
    handsFreeEnabled: true,
    authorizationStatus: 'notDetermined',
    bluetoothState: 'unknown',
    rssiThreshold: -65,
  });

  const [currentRssi, setCurrentRssi] = useState<number>(-100);
  const [unlockEvents, setUnlockEvents] = useState<UnlockEvent[]>([]);
  const [isUnlocking, setIsUnlocking] = useState<boolean>(false);
  const [permissionModalVisible, setPermissionModalVisible] = useState<boolean>(false);
  const [secretKeyModalVisible, setSecretKeyModalVisible] = useState<boolean>(false);
  const [maskedKey, setMaskedKey] = useState<string>('');

  // Initial load
  useEffect(() => {
    loadInitialData();

    // Event Subscriptions
    const subUnlock = CarUnlockNative.onUnlockEvent((event) => {
      setUnlockEvents((prev) => [event, ...prev.slice(0, 49)]); // Keep last 50
    });

    const subRssi = CarUnlockNative.onRssiUpdate((data) => {
      setCurrentRssi(data.rssi);
    });

    const subStatus = CarUnlockNative.onStatusChange(() => {
      refreshStatus();
    });

    return () => {
      subUnlock?.remove();
      subRssi?.remove();
      subStatus?.remove();
    };
  }, []);

  const loadInitialData = async () => {
    await refreshStatus();
    const keyInfo = await CarUnlockNative.getSecretKey();
    setMaskedKey(keyInfo.maskedKey);

    // If permissions not yet full 'Always', show modal on first launch
    const status = await CarUnlockNative.getMonitoringStatus();
    if (status.authorizationStatus !== 'authorizedAlways') {
      setPermissionModalVisible(true);
    }
  };

  const refreshStatus = async () => {
    const status = await CarUnlockNative.getMonitoringStatus();
    setMonitoringStatus(status);
  };

  const handleToggleHandsFree = async (value: boolean) => {
    await CarUnlockNative.setHandsFreeEnabled(value);
    await refreshStatus();
  };

  const handleChangeThreshold = async (val: number) => {
    setMonitoringStatus((prev) => ({ ...prev, rssiThreshold: val }));
    const currentConfig = await CarUnlockNative.getProximityConfig();
    await CarUnlockNative.setProximityConfig(
      currentConfig.beaconUUID,
      currentConfig.major,
      currentConfig.minor,
      val
    );
  };

  const handleManualUnlock = async () => {
    if (isUnlocking) return;
    setIsUnlocking(true);
    try {
      const response = await CarUnlockNative.triggerManualUnlock();
      if (response.success) {
        Alert.alert('¡Desbloqueado!', 'El pulso de apertura se envió exitosamente al vehículo.');
      }
    } catch (err: any) {
      Alert.alert('Fallo de Desbloqueo', err.message || 'No se pudo conectar con el ESP32');
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleRequestPermissions = async () => {
    await CarUnlockNative.requestPermissions();
    setPermissionModalVisible(false);
    setTimeout(refreshStatus, 1500);
  };

  const handleSaveSecretKey = async (key: string): Promise<boolean> => {
    const res = await CarUnlockNative.setSecretKey(key);
    if (res.success) {
      const keyInfo = await CarUnlockNative.getSecretKey();
      setMaskedKey(keyInfo.maskedKey);
      return true;
    }
    return false;
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      <ScrollView contentContainerStyle={styles.container}>
        
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.brandTitle}>CAR UNLOCK</Text>
            <Text style={styles.brandSubtitle}>ACCESO PASIVO POR PROXIMIDAD</Text>
          </View>
          <View style={styles.securityTag}>
            <Text style={styles.securityTagText}>HMAC-SHA256</Text>
          </View>
        </View>

        {/* Status Card */}
        <StatusCard
          isHandsFreeEnabled={monitoringStatus.handsFreeEnabled}
          onToggleHandsFree={handleToggleHandsFree}
          isMonitoring={monitoringStatus.isMonitoring}
          bluetoothState={monitoringStatus.bluetoothState}
          authorizationStatus={monitoringStatus.authorizationStatus}
          currentRssi={currentRssi}
        />

        {/* Big Manual Unlock Action Button */}
        <TouchableOpacity
          style={[styles.manualButton, isUnlocking && styles.manualButtonActive]}
          onPress={handleManualUnlock}
          disabled={isUnlocking}
          activeOpacity={0.8}
        >
          {isUnlocking ? (
            <ActivityIndicator size="small" color="#0B0E14" />
          ) : (
            <View style={styles.manualButtonInner}>
              <Text style={styles.manualButtonIcon}>🔓</Text>
              <Text style={styles.manualButtonText}>DESBLOQUEAR AHORA</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Proximity Sensitivity Calibration */}
        <SensitivitySlider
          rssiThreshold={monitoringStatus.rssiThreshold}
          onChangeThreshold={handleChangeThreshold}
        />

        {/* Management & Configuration Buttons */}
        <View style={styles.toolsRow}>
          <TouchableOpacity
            style={styles.toolButton}
            onPress={() => setSecretKeyModalVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.toolButtonText}>🔑 Configurar PSK</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.toolButton}
            onPress={() => setPermissionModalVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.toolButtonText}>⚙️ Permisos de iOS</Text>
          </TouchableOpacity>
        </View>

        {/* Event Logs History */}
        <EventLogList
          events={unlockEvents}
          onClear={() => setUnlockEvents([])}
        />

      </ScrollView>

      {/* Modals */}
      <PermissionModal
        visible={permissionModalVisible}
        onGrant={handleRequestPermissions}
        onClose={() => setPermissionModalVisible(false)}
      />

      <SecretKeyModal
        visible={secretKeyModalVisible}
        currentMaskedKey={maskedKey}
        onSaveKey={handleSaveSecretKey}
        onClose={() => setSecretKeyModalVisible(false)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
    marginTop: theme.spacing.xs,
  },
  brandTitle: {
    ...theme.typography.title,
    color: theme.colors.textPrimary,
    letterSpacing: 1.5,
  },
  brandSubtitle: {
    ...theme.typography.caption,
    color: theme.colors.primary,
    letterSpacing: 1,
    marginTop: 2,
  },
  securityTag: {
    backgroundColor: theme.colors.primaryGlow,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  securityTagText: {
    ...theme.typography.mono,
    fontSize: 10,
    color: theme.colors.primary,
  },
  manualButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 18,
    borderRadius: theme.borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.md,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  manualButtonActive: {
    opacity: 0.7,
  },
  manualButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  manualButtonIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  manualButtonText: {
    ...theme.typography.subtitle,
    color: '#0B0E14',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },
  toolsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: theme.spacing.md,
  },
  toolButton: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    paddingVertical: 12,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  toolButtonText: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    fontSize: 13,
  },
});
