import { useEffect } from 'react';
import { Geolocation } from '@capacitor/geolocation';
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';

export function useCapacitorSetup() {
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      const requestPermissions = async () => {
        try {
          // Request Location
          const geoStatus = await Geolocation.checkPermissions();
          if (geoStatus.location !== 'granted') {
            await Geolocation.requestPermissions();
          }

          // Request Notifications
          const pushStatus = await PushNotifications.checkPermissions();
          if (pushStatus.receive !== 'granted') {
            await PushNotifications.requestPermissions();
          }

          // In Android, audio recording permission is typically handled by cordova-plugin-audio 
          // or prompted automatically by navigator.mediaDevices.getUserMedia in WebView
          // If we had the Capacitor Mic plugin we would request it, but browser API falls back to native prompt
          
        } catch (error) {
          console.error('Error requesting native permissions:', error);
          toast.error('Could not request native permissions.');
        }
      };

      requestPermissions();
    }
  }, []);
}
