export type UnlockEventType = 'SUCCESS' | 'COOLDOWN' | 'ERROR';

export interface UnlockEvent {
  type: UnlockEventType;
  message: string;
  rssi: number;
  timestamp: number;
}

export interface LogMessageEvent {
  message: string;
  timestamp: number;
}

export interface ProximityConfig {
  beaconUUID: string;
  major: number;
  minor: number;
  rssiThreshold: number;
  handsFreeEnabled: boolean;
}

export interface MonitoringStatus {
  isMonitoring: boolean;
  handsFreeEnabled: boolean;
  authorizationStatus: 
    | 'authorizedAlways' 
    | 'authorizedWhenInUse' 
    | 'denied' 
    | 'restricted' 
    | 'notDetermined' 
    | 'unknown';
  bluetoothState: 
    | 'poweredOn' 
    | 'poweredOff' 
    | 'unauthorized' 
    | 'unsupported' 
    | 'resetting' 
    | 'unknown';
  rssiThreshold: number;
}

export interface ManualUnlockResponse {
  success: boolean;
  message: string;
  rssi?: number;
}
