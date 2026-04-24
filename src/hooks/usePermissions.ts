import { useState, useEffect } from 'react';

export interface PermissionStatus {
  microphone: 'granted' | 'denied' | 'prompt' | 'unknown';
  geolocation: 'granted' | 'denied' | 'prompt' | 'unknown';
  notifications: 'granted' | 'denied' | 'prompt' | 'unknown';
}

export const usePermissions = () => {
  const [permissions, setPermissions] = useState<PermissionStatus>({
    microphone: 'unknown',
    geolocation: 'unknown',
    notifications: 'unknown',
  });

  const checkPermissions = async () => {
    try {
      const perms: PermissionStatus = { ...permissions };
      
      // Check Geolocation
      if ('permissions' in navigator) {
        try {
          const geoStatus = await navigator.permissions.query({ name: 'geolocation' });
          perms.geolocation = geoStatus.state;
          geoStatus.onchange = () => {
            setPermissions(prev => ({ ...prev, geolocation: geoStatus.state }));
          };
        } catch (e) { console.warn("Geolocation permission query failed", e); }
        
        try {
          const micStatus = await navigator.permissions.query({ name: 'microphone' as any });
          perms.microphone = micStatus.state;
          micStatus.onchange = () => {
            setPermissions(prev => ({ ...prev, microphone: micStatus.state }));
          };
        } catch (e) { console.warn("Microphone permission query failed", e); }
        
        try {
          // Push notifications
          const notifStatus = await navigator.permissions.query({ name: 'notifications' });
          perms.notifications = notifStatus.state;
          notifStatus.onchange = () => {
            setPermissions(prev => ({ ...prev, notifications: notifStatus.state }));
          };
        } catch (e) {
          if ('Notification' in window) {
            perms.notifications = Notification.permission === 'default' ? 'prompt' : Notification.permission;
          }
        }
      }
      
      setPermissions(perms);
    } catch (e) {
      console.warn('Permissions API not fully supported');
    }
  };

  useEffect(() => {
    checkPermissions();
  }, []);

  const requestMicrophone = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      checkPermissions();
      return true;
    } catch {
      checkPermissions();
      return false;
    }
  };

  const requestGeolocation = () => {
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => { checkPermissions(); resolve(true); },
        () => { checkPermissions(); resolve(false); }
      );
    });
  };

  const requestNotifications = async () => {
    if ('Notification' in window) {
      await Notification.requestPermission();
      checkPermissions();
    }
  };

  return { permissions, checkPermissions, requestMicrophone, requestGeolocation, requestNotifications };
};
