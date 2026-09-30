import React from 'react';
import { View, Text, StyleSheet, Switch } from 'react-native';
import { theme } from '../styles/theme';

interface StatusCardProps {
  isHandsFreeEnabled: boolean;
  onToggleHandsFree: (value: boolean) => void;
  isMonitoring: boolean;
  bluetoothState: string;
  authorizationStatus: string;
  currentRssi: number;
}

export const StatusCard: React.FC<StatusCardProps> = ({
  isHandsFreeEnabled,
  onToggleHandsFree,
  isMonitoring,
  bluetoothState,
  authorizationStatus,
  currentRssi,
}) => {
  const isReady = isHandsFreeEnabled && isMonitoring && bluetoothState === 'poweredOn';

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.titleContainer}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: isReady ? theme.colors.success : theme.colors.warning },
            ]}
          />
          <Text style={styles.title}>Modo Manos Libres</Text>
        </View>
        <Switch
          value={isHandsFreeEnabled}
          onValueChange={onToggleHandsFree}
          trackColor={{ false: theme.colors.surfaceElevated, true: theme.colors.primary }}
          thumbColor={isHandsFreeEnabled ? '#FFFFFF' : '#757575'}
        />
      </View>

      <Text style={styles.description}>
        {isReady
          ? 'Listo. El vehículo se desbloqueará automáticamente al acercarte con la pantalla bloqueada.'
          : 'Monitoreo pausado o permisos pendientes.'}
      </Text>

      <View style={styles.separator} />

      <View style={styles.statsGrid}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>BLUETOOTH</Text>
          <Text
            style={[
              styles.statValue,
              { color: bluetoothState === 'poweredOn' ? theme.colors.success : theme.colors.error },
            ]}
          >
            {bluetoothState === 'poweredOn' ? 'Activo' : 'Inactivo'}
          </Text>
        </View>

        <View style={styles.statItem}>
          <Text style={styles.statLabel}>UBICACIÓN</Text>
          <Text
            style={[
              styles.statValue,
              {
                color:
                  authorizationStatus === 'authorizedAlways'
                    ? theme.colors.success
                    : theme.colors.warning,
              },
            ]}
          >
            {authorizationStatus === 'authorizedAlways' ? 'Siempre (OK)' : 'Limitada'}
          </Text>
        </View>

        <View style={styles.statItem}>
          <Text style={styles.statLabel}>SEÑAL RSSI</Text>
          <Text style={[styles.statValue, { color: theme.colors.primary }]}>
            {currentRssi !== -100 ? `${currentRssi} dBm` : '--'}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: theme.spacing.sm,
  },
  title: {
    ...theme.typography.title,
    fontSize: 18,
    color: theme.colors.textPrimary,
  },
  description: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    marginTop: 4,
    marginBottom: theme.spacing.sm,
  },
  separator: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing.sm,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statLabel: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
    marginBottom: 2,
    letterSpacing: 0.5,
  },
  statValue: {
    ...theme.typography.subtitle,
    fontWeight: '700',
  },
});
