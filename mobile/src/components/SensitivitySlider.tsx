import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { theme } from '../styles/theme';

interface SensitivitySliderProps {
  rssiThreshold: number;
  onChangeThreshold: (val: number) => void;
}

export const SensitivitySlider: React.FC<SensitivitySliderProps> = ({
  rssiThreshold,
  onChangeThreshold,
}) => {
  // Pre-configured calibration presets
  const presets = [
    { label: 'Muy Cerca (~1m)', value: -58 },
    { label: 'Óptimo (~1.5m)', value: -65 },
    { label: 'Lejano (~3m)', value: -75 },
    { label: 'Máximo (~5m)', value: -82 },
  ];

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Sensibilidad de Proximidad</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{rssiThreshold} dBm</Text>
        </View>
      </View>

      <Text style={styles.subtitle}>
        Calibra el umbral de potencia de señal para evitar que el auto se abra si estás lejos.
      </Text>

      {/* Preset selector pills */}
      <View style={styles.presetContainer}>
        {presets.map((preset) => {
          const isSelected = rssiThreshold === preset.value;
          return (
            <TouchableOpacity
              key={preset.value}
              style={[
                styles.presetPill,
                isSelected && styles.presetPillActive,
              ]}
              onPress={() => onChangeThreshold(preset.value)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.presetText,
                  isSelected && styles.presetTextActive,
                ]}
              >
                {preset.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Fine-tuning Stepper Controls */}
      <View style={styles.stepperContainer}>
        <TouchableOpacity
          style={styles.stepButton}
          onPress={() => onChangeThreshold(Math.max(-90, rssiThreshold - 1))}
          activeOpacity={0.6}
        >
          <Text style={styles.stepButtonText}>- 1 dBm (Más lejos)</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.stepButton}
          onPress={() => onChangeThreshold(Math.min(-45, rssiThreshold + 1))}
          activeOpacity={0.6}
        >
          <Text style={styles.stepButtonText}>+ 1 dBm (Más cerca)</Text>
        </TouchableOpacity>
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
    marginBottom: 4,
  },
  title: {
    ...theme.typography.title,
    fontSize: 16,
    color: theme.colors.textPrimary,
  },
  badge: {
    backgroundColor: theme.colors.primaryGlow,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.round,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  badgeText: {
    ...theme.typography.mono,
    color: theme.colors.primary,
  },
  subtitle: {
    ...theme.typography.body,
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  presetContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: theme.spacing.md,
  },
  presetPill: {
    backgroundColor: theme.colors.surfaceElevated,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  presetPillActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryGlow,
  },
  presetText: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },
  presetTextActive: {
    color: theme.colors.primary,
    fontWeight: '700',
  },
  stepperContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  stepButton: {
    flex: 1,
    backgroundColor: theme.colors.surfaceElevated,
    paddingVertical: 10,
    borderRadius: theme.borderRadius.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  stepButtonText: {
    ...theme.typography.caption,
    color: theme.colors.textPrimary,
  },
});
