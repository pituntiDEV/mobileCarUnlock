import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import {
  UnlockEvent,
  LogMessageEvent,
  ProximityConfig,
  MonitoringStatus,
  ManualUnlockResponse,
} from '../types';

const { CarUnlockModule } = NativeModules;

if (Platform.OS === 'ios' && !CarUnlockModule) {
  console.warn(
    '[CarUnlockNative] CarUnlockModule is not linked. Make sure Native Module is compiled in Xcode.'
  );
}

const eventEmitter = Platform.OS === 'ios' && CarUnlockModule 
  ? new NativeEventEmitter(CarUnlockModule)
  : null;

export const CarUnlockNative = {
  /**
   * Request Location "Always" and Bluetooth permissions
   */
  requestPermissions: async (): Promise<{ status: string }> => {
    if (!CarUnlockModule) return { status: 'mock_granted' };
    return CarUnlockModule.requestPermissions();
  },

  /**
   * Store pre-shared secret key in secure iOS Keychain
   */
  setSecretKey: async (key: string): Promise<{ success: boolean }> => {
    if (!CarUnlockModule) return { success: true };
    return CarUnlockModule.setSecretKey(key);
  },

  /**
   * Retrieve whether secret key is configured and its masked version
   */
  getSecretKey: async (): Promise<{ hasKey: boolean; maskedKey: string }> => {
    if (!CarUnlockModule) return { hasKey: true, maskedKey: 'c9a7....cdef' };
    return CarUnlockModule.getSecretKey();
  },

  /**
   * Configure iBeacon and RSSI thresholds
   */
  setProximityConfig: async (
    uuid: string,
    major: number,
    minor: number,
    rssiThreshold: number
  ): Promise<{ success: boolean }> => {
    if (!CarUnlockModule) return { success: true };
    return CarUnlockModule.setProximityConfig(uuid, major, minor, rssiThreshold);
  },

  /**
   * Fetch current proximity settings
   */
  getProximityConfig: async (): Promise<ProximityConfig> => {
    if (!CarUnlockModule) {
      return {
        beaconUUID: '74278BDA-B644-4520-8F0C-720EAF059935',
        major: 1,
        minor: 100,
        rssiThreshold: -65,
        handsFreeEnabled: true,
      };
    }
    return CarUnlockModule.getProximityConfig();
  },

  /**
   * Enable or disable automatic handsfree proximity monitoring
   */
  setHandsFreeEnabled: async (enabled: boolean): Promise<{ enabled: boolean }> => {
    if (!CarUnlockModule) return { enabled };
    return CarUnlockModule.setHandsFreeEnabled(enabled);
  },

  /**
   * Trigger immediate BLE scan and challenge-response unlock (Manual override)
   */
  triggerManualUnlock: async (): Promise<ManualUnlockResponse> => {
    if (!CarUnlockModule) {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({ success: true, message: 'Vehículo desbloqueado (Simulación)', rssi: -58 });
        }, 1200);
      });
    }
    return CarUnlockModule.triggerManualUnlock();
  },

  /**
   * Fetch real-time monitoring and authorization status
   */
  getMonitoringStatus: async (): Promise<MonitoringStatus> => {
    if (!CarUnlockModule) {
      return {
        isMonitoring: true,
        handsFreeEnabled: true,
        authorizationStatus: 'authorizedAlways',
        bluetoothState: 'poweredOn',
        rssiThreshold: -65,
      };
    }
    return CarUnlockModule.getMonitoringStatus();
  },

  // ============================================================================
  // EVENT LISTENERS
  // ============================================================================
  
  onUnlockEvent: (callback: (event: UnlockEvent) => void) => {
    return eventEmitter?.addListener('onUnlockEvent', callback);
  },

  onStatusChange: (callback: (status: any) => void) => {
    return eventEmitter?.addListener('onStatusChange', callback);
  },

  onRssiUpdate: (callback: (data: { rssi: number }) => void) => {
    return eventEmitter?.addListener('onRssiUpdate', callback);
  },

  onLogMessage: (callback: (log: LogMessageEvent) => void) => {
    return eventEmitter?.addListener('onLogMessage', callback);
  },
};
