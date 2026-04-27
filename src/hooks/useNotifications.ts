import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';

export interface NotificationItem {
  id: string;
  userId?: string;
  type: 'SOS_ALERT' | 'SYSTEM' | 'ACK';
  message: string;
  timestamp: number;
  read: boolean;
  latitude?: number;
  longitude?: number;
  isGlobalSOS?: boolean;
}

export const useNotifications = () => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!auth.currentUser) return;

    let dbNotifs: NotificationItem[] = [];
    let sosNotifs: NotificationItem[] = [];

    const updateCombined = (dbN: NotificationItem[], sosN: NotificationItem[]) => {
      const dismissedStr = localStorage.getItem('dismissed_notifications');
      const dismissedIds = dismissedStr ? JSON.parse(dismissedStr) : [];
      
      const allNotifs = [...dbN, ...sosN]
        .filter(n => !dismissedIds.includes(n.id))
        .sort((a, b) => b.timestamp - a.timestamp);
        
      setNotifications(allNotifs);
      setUnreadCount(allNotifs.filter(n => !n.read).length);
    };

    // 1. Subscribe to standard notifications
    const qNotif = query(
      collection(db, 'notifications'),
      where('userId', '==', auth.currentUser.uid)
    );

    const unsubNotifs = onSnapshot(qNotif, (snapshot) => {
      let notifs: NotificationItem[] = [];
      const now = Date.now();
      
      snapshot.forEach((document) => {
        const data = document.data();
        
        // Auto-delete if older than 7 days
        const age = now - (data.timestamp || now);
        if (age > 7 * 24 * 60 * 60 * 1000) {
          deleteDoc(document.ref).catch(() => {});
          return;
        }

        notifs.push({
          ...data,
          id: document.id,
          userId: data.userId,
          type: data.type,
          message: data.message,
          timestamp: data.timestamp,
          read: data.read
        });
      });
      
      dbNotifs = notifs;
      updateCombined(dbNotifs, sosNotifs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'notifications');
    });

    // 2. Subscribe to active SOS alerts globally (recent ones)
    const qSOS = query(collection(db, 'sos_events'), where('isResolved', '==', false));
    const unsubSOS = onSnapshot(qSOS, (snapshot) => {
      const now = Date.now();
      const MAX_AGE_MS = 24 * 60 * 60 * 1000;
      
      const activeSOSs = snapshot.docs.map(d => {
        const data = d.data();
        let evTime = data.timestamp;
        if (evTime?.toMillis) evTime = evTime.toMillis();
        else if (evTime?.seconds) evTime = evTime.seconds * 1000;
        else evTime = now;
        
        return {
          id: d.id,
          userId: data.userId,
          type: 'SOS_ALERT' as const,
          message: `Someone needs help! ${data.transcript || 'Emergency triggered.'}`,
          timestamp: evTime,
          read: false, 
          latitude: data.latitude,
          longitude: data.longitude,
          isGlobalSOS: true
        };
      })
      .filter(req => (now - req.timestamp) < MAX_AGE_MS)
      .filter(req => req.userId !== auth.currentUser?.uid);

      // check local storage to figure out read status since SOS events are global
      const readStr = localStorage.getItem('read_sos_notifications');
      const readIds = readStr ? JSON.parse(readStr) : [];
      
      sosNotifs = activeSOSs.map(sos => ({
        ...sos,
        read: readIds.includes(sos.id)
      }));
      
      updateCombined(dbNotifs, sosNotifs);
    });

    // Sync localStorage changes (if any happen in other tabs or same)
    const handleStorage = () => updateCombined(dbNotifs, sosNotifs);
    window.addEventListener('storage', handleStorage);

    return () => {
      unsubNotifs();
      unsubSOS();
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const markAsRead = async (id: string) => {
    // Check if it's an SOS notification vs a DB notification
    const notif = notifications.find(n => n.id === id);
    if (!notif) return;

    if (notif.isGlobalSOS) {
       // it's a global SOS from our mapped set
       const readStr = localStorage.getItem('read_sos_notifications');
       const readIds = readStr ? JSON.parse(readStr) : [];
       if (!readIds.includes(id)) {
         readIds.push(id);
         localStorage.setItem('read_sos_notifications', JSON.stringify(readIds));
         window.dispatchEvent(new Event('storage'));
       }
    } else {
      try {
        await updateDoc(doc(db, 'notifications', id), { read: true });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `notifications/${id}`);
      }
    }
  };

  const markAllAsRead = async () => {
    const unreadNotifs = notifications.filter(n => !n.read);
    const readStr = localStorage.getItem('read_sos_notifications');
    const readIds = readStr ? JSON.parse(readStr) : [];
    
    for (const notif of unreadNotifs) {
      if (notif.isGlobalSOS) {
         if (!readIds.includes(notif.id)) readIds.push(notif.id);
      } else {
        await markAsRead(notif.id);
      }
    }
    
    localStorage.setItem('read_sos_notifications', JSON.stringify(readIds));
    window.dispatchEvent(new Event('storage'));
  };

  const deleteNotification = async (id: string) => {
    const notif = notifications.find(n => n.id === id);
    if (!notif) return;

    if (notif.isGlobalSOS) {
      // It's a mapped SOS. Hide it.
      const dismissedStr = localStorage.getItem('dismissed_notifications');
      const dismissedIds = dismissedStr ? JSON.parse(dismissedStr) : [];
      if (!dismissedIds.includes(id)) {
        dismissedIds.push(id);
        localStorage.setItem('dismissed_notifications', JSON.stringify(dismissedIds));
        window.dispatchEvent(new Event('storage'));
        
        // remove locally to feel instant
        setNotifications(prev => prev.filter(n => n.id !== id));
      }
    } else {
      try {
         const dismissedStr = localStorage.getItem('dismissed_notifications');
         const dismissedIds = dismissedStr ? JSON.parse(dismissedStr) : [];
         dismissedIds.push(id);
         localStorage.setItem('dismissed_notifications', JSON.stringify(dismissedIds));
         
         await deleteDoc(doc(db, 'notifications', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `notifications/${id}`);
      }
    }
  };

  // Helper function to create a notification (e.g., system messages)
  const createNotification = async (type: NotificationItem['type'], message: string) => {
    if (!auth.currentUser) return;
    try {
      await addDoc(collection(db, 'notifications'), {
        userId: auth.currentUser.uid,
        type,
        message,
        timestamp: serverTimestamp(),
        read: false
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'notifications');
    }
  };

  return { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification, createNotification };
};
