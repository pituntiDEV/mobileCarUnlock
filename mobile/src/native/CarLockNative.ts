import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

export interface LockStateChangeEvent {
  isLocked: boolean;
  action: 'lock' | 'unlock';
  reason: string;
  rssi?: number;
  timestamp: number;
}

export interface LogUpdateEvent {
  message: string;
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'success';
}

export interface StatusChangeEvent {
  isMonitoring: boolean;
  authorizationStatus: 
    | 'authorizedAlways' 
    | 'authorizedWhenInUse' 
    | 'denied' 
    | 'restricted' 
    | 'notDetermined' 
    | 'unknown';
  bluetoothState: 'poweredOn' | 'poweredOff' | 'other' | 'unknown';
  rssiThreshold: number;
  isLocked: boolean;
}

export interface ProximitySettings extends StatusChangeEvent {
  beaconUUID: string;
  major: number;
  minor: number;
}

const { CarLockBridge } = NativeModules;

export const isNativeAvailable = !!CarLockBridge;

if (Platform.OS === 'ios' && !CarLockBridge) {
  console.warn(
    '[CarLockNative] CarLockBridge no está vinculado. Se requiere compilar el binario nativo (EAS Build / IPA).'
  );
}

const eventEmitter = Platform.OS === 'ios' && CarLockBridge 
  ? new NativeEventEmitter(CarLockBridge) 
  : null;

export const CarLockNative = {
  startProximityService: async (): Promise<{ success: boolean; monitoring: boolean }> => {
    if (!CarLockBridge) {
      throw new Error('Servicio de proximidad BLE requiere el módulo nativo iOS (EAS Build).');
    }
    return CarLockBridge.startProximityService();
  },

  stopProximityService: async (): Promise<{ success: boolean; monitoring: boolean }> => {
    if (!CarLockBridge) return { success: false, monitoring: false };
    return CarLockBridge.stopProximityService();
  },

  manualTrigger: async (action: 'lock' | 'unlock'): Promise<{ success: boolean; action: string; rssi?: number }> => {
    if (!CarLockBridge) {
      throw new Error(
        'Módulo Bluetooth no vinculado. Debes instalar el build nativo de producción (EAS Build) para comunicarte con el ESP32 real.'
      );
    }
    return CarLockBridge.manualTrigger(action);
  },

  setRssiThreshold: async (threshold: number): Promise<{ success: boolean; threshold: number }> => {
    if (!CarLockBridge) return { success: false, threshold };
    return CarLockBridge.setRssiThreshold(threshold);
  },

  getProximitySettings: async (): Promise<ProximitySettings> => {
    if (!CarLockBridge) {
      return {
        isMonitoring: false,
        rssiThreshold: -65,
        beaconUUID: 'e2c56db5-dffb-48d2-b060-d0f5a71096e0',
        major: 1,
        minor: 1,
        authorizationStatus: 'unknown',
        bluetoothState: 'unknown',
        isLocked: true,
      };
    }
    return CarLockBridge.getProximitySettings();
  },

  checkPermissions: async (): Promise<{ locationAlways: boolean; bluetoothReady: boolean }> => {
    if (!CarLockBridge) return { locationAlways: false, bluetoothReady: false };
    return CarLockBridge.checkPermissions();
  },

  setSecretKey: async (key: string): Promise<{ success: boolean }> => {
    if (!CarLockBridge) return { success: false };
    return CarLockBridge.setSecretKey(key);
  },

  getSecretKey: async (): Promise<{ hasKey: boolean; maskedKey: string }> => {
    if (!CarLockBridge) return { hasKey: false, maskedKey: 'No disponible' };
    return CarLockBridge.getSecretKey();
  },

  // Event Listeners
  onStatusChange: (callback: (data: StatusChangeEvent) => void) => {
    return eventEmitter?.addListener('onStatusChange', callback);
  },

  onLogUpdate: (callback: (data: LogUpdateEvent) => void) => {
    return eventEmitter?.addListener('onLogUpdate', callback);
  },

  onLockStateChange: (callback: (data: LockStateChangeEvent) => void) => {
    return eventEmitter?.addListener('onLockStateChange', callback);
  },

  onRssiUpdate: (callback: (data: { rssi: number }) => void) => {
    return eventEmitter?.addListener('onRssiUpdate', callback);
  },
};
