import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { theme } from '../styles/theme';

interface PermissionModalProps {
  visible: boolean;
  onGrant: () => void;
  onClose: () => void;
}

export const PermissionModal: React.FC<PermissionModalProps> = ({
  visible,
  onGrant,
  onClose,
}) => {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Permisos Críticos de iOS</Text>

          <Text style={styles.modalBody}>
            Para que el auto se desbloquee de forma automática cuando te aproximes con el{' '}
            <Text style={{ fontWeight: '700', color: theme.colors.textPrimary }}>
              iPhone bloqueado o en tu bolsillo
            </Text>
            , iOS exige dos permisos esenciales:
          </Text>

          <View style={styles.itemRow}>
            <Text style={styles.itemIcon}>📍</Text>
            <View style={styles.itemTextContainer}>
              <Text style={styles.itemTitle}>Ubicación: "Cambiar a Siempre"</Text>
              <Text style={styles.itemDesc}>
                Apple asocia la tecnología iBeacon al framework de Ubicación. Solo con "Siempre", iOS tiene autorización para despertar la app en segundo plano con la pantalla apagada.
              </Text>
            </View>
          </View>

          <View style={styles.itemRow}>
            <Text style={styles.itemIcon}>📶</Text>
            <View style={styles.itemTextContainer}>
              <Text style={styles.itemTitle}>Bluetooth: "Siempre Activo"</Text>
              <Text style={styles.itemDesc}>
                Permite conectar con el ESP32, verificar que estás a menos de 2 metros mediante la señal RSSI y enviar la firma criptográfica HMAC-SHA256.
              </Text>
            </View>
          </View>

          <TouchableOpacity style={styles.grantButton} onPress={onGrant} activeOpacity={0.8}>
            <Text style={styles.grantButtonText}>Conceder Permisos</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelButton} onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.cancelButtonText}>Más tarde</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.md,
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  modalTitle: {
    ...theme.typography.title,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  modalBody: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
    lineHeight: 20,
    textAlign: 'center',
  },
  itemRow: {
    flexDirection: 'row',
    marginBottom: theme.spacing.md,
    alignItems: 'flex-start',
  },
  itemIcon: {
    fontSize: 24,
    marginRight: 12,
    marginTop: 2,
  },
  itemTextContainer: {
    flex: 1,
  },
  itemTitle: {
    ...theme.typography.subtitle,
    color: theme.colors.primary,
    fontSize: 14,
    marginBottom: 2,
  },
  itemDesc: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    lineHeight: 16,
  },
  grantButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  grantButtonText: {
    ...theme.typography.subtitle,
    color: '#0B0E14',
    fontWeight: '700',
  },
  cancelButton: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  cancelButtonText: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
  },
});
