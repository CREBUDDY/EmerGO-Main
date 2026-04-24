import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';

export interface NotificationItem {
  id: string;
  userId: string;
  type: 'SOS_ALERT' | 'SYSTEM' | 'ACK';
  message: string;
  timestamp: number;
  read: boolean;
}

export const useNotifications = () => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', auth.currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let notifs: NotificationItem[] = [];
      let unread = 0;
      
      snapshot.forEach((document) => {
        const data = document.data();
        
        // Auto-delete if older than 7 days
        const age = Date.now() - (data.timestamp || Date.now());
        if (age > 7 * 24 * 60 * 60 * 1000) {
          deleteDoc(document.ref).catch(e => console.warn("Failed to auto-delete old notification", e));
          return;
        }

        notifs.push({
          id: document.id,
          userId: data.userId,
          type: data.type,
          message: data.message,
          timestamp: data.timestamp,
          read: data.read
        });

        if (!data.read) {
          unread++;
        }
      });

      // Sort locally
      notifs.sort((a, b) => b.timestamp - a.timestamp);

      setNotifications(notifs);
      setUnreadCount(unread);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'notifications');
    });

    return () => unsubscribe();
  }, []);

  const markAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `notifications/${id}`);
    }
  };

  const markAllAsRead = async () => {
    const unreadNotifs = notifications.filter(n => !n.read);
    for (const notif of unreadNotifs) {
      await markAsRead(notif.id);
    }
  };

  const deleteNotification = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'notifications', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `notifications/${id}`);
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
