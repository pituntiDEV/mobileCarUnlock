import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TextInput, TouchableOpacity, Alert } from 'react-native';
import { theme } from '../styles/theme';

interface SecretKeyModalProps {
  visible: boolean;
  currentMaskedKey: string;
  onSaveKey: (key: string) => Promise<boolean>;
  onClose: () => void;
}

export const SecretKeyModal: React.FC<SecretKeyModalProps> = ({
  visible,
  currentMaskedKey,
  onSaveKey,
  onClose,
}) => {
  const [newKey, setNewKey] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!newKey.trim()) {
      Alert.alert('Error', 'Ingresa una clave secreta válida');
      return;
    }
    setSaving(true);
    const success = await onSaveKey(newKey.trim());
    setSaving(false);
    if (success) {
      Alert.alert('Éxito', 'Clave PSK guardada en el Keychain de iOS de forma segura');
      setNewKey('');
      onClose();
    } else {
      Alert.alert('Error', 'No se pudo guardar la clave en el Keychain');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Configurar Clave Secreta (PSK)</Text>

          <Text style={styles.modalBody}>
            Esta clave se almacena cifrada en el{' '}
            <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>
              Keychain (Secure Enclave)
            </Text>{' '}
            del iPhone y debe coincidir exactamente con el valor configurado en el firmware del ESP32.
          </Text>

          <View style={styles.currentKeyBox}>
            <Text style={styles.currentKeyLabel}>Clave actual en Keychain:</Text>
            <Text style={styles.currentKeyValue}>
              {currentMaskedKey || 'No configurada'}
            </Text>
          </View>

          <TextInput
            style={styles.input}
            placeholder="Introduce clave PSK (Hex 64 caracteres)..."
            placeholderTextColor={theme.colors.textMuted}
            value={newKey}
            onChangeText={setNewKey}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.saveButton, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            <Text style={styles.saveButtonText}>
              {saving ? 'Guardando...' : 'Guardar en Keychain'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelButton} onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.cancelButtonText}>Cerrar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
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
  currentKeyBox: {
    backgroundColor: theme.colors.surfaceElevated,
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  currentKeyLabel: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
    marginBottom: 2,
  },
  currentKeyValue: {
    ...theme.typography.mono,
    color: theme.colors.primary,
  },
  input: {
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    color: theme.colors.textPrimary,
    ...theme.typography.body,
    marginBottom: theme.spacing.md,
  },
  saveButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
  },
  saveButtonText: {
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
