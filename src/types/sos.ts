export interface SOSEvent {
  id: string; // uuid
  userId: string;
  deviceId: string;
  timestamp: number;
  latitude: number;
  longitude: number;
  audioBlob?: Blob; // Stored locally
  audioDataUrl?: string; // Stored in Firebase
  transcript: string;
  type: 'voice' | 'silent' | 'text';
  status: 'PENDING' | 'SENT' | 'DELIVERED' | 'ACKNOWLEDGED' | 'FAILED';
  retryCount: number;
  isResolved?: boolean;
  emergencyContacts?: string[];
  medicalInfo?: {
    bloodType?: string;
    conditions?: string;
  };
  deliveredTo?: string[];
  acknowledgedBy?: string[];
  autoTriggerInfo?: {
    triggerType: 'AUTO';
    score: number;
    breakdown: {
      voice: number;
      motion: number;
      context: number;
      behavior: number;
    };
    reasons: string[];
  };
}
