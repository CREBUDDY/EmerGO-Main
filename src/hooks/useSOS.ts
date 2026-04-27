import { useEffect, useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { SOSEvent } from '../types/sos';
import { getDeviceId } from '../lib/device';
import { auth, db as firestore, handleFirestoreError, OperationType } from '../lib/firebase';
import { onSnapshot, query, collection, where, deleteDoc, doc, getDocs, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

const OFFLINE_QUEUE_KEY = 'offline_sos_queue';

export const useSOS = () => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [localEvents, setLocalEvents] = useState<SOSEvent[]>([]);

  const syncOfflineQueue = useCallback(async () => {
    if (!navigator.onLine || !auth.currentUser) return;
    
    const queueData = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!queueData) return;

    let queue: any[] = [];
    try {
      queue = JSON.parse(queueData);
    } catch (e) {
      console.error("Failed to parse offline SOS queue", e);
      return;
    }

    if (queue.length === 0) return;
    
    setIsSyncing(true);
    let remainingQueue = [];
    
    for (const event of queue) {
      try {
        await setDoc(doc(firestore, 'sos_events', event.id), {
          ...event,
          // Update timestamp to server timestamp when finally synchronised
          timestamp: serverTimestamp() 
        });

        if (event.emergencyContacts && event.emergencyContacts.length > 0) {
           try {
             const response = await fetch('/api/send-sms', {
               method: 'POST',
               headers: {
                 'Content-Type': 'application/json'
               },
               body: JSON.stringify({
                 contacts: event.emergencyContacts,
                 message: `${event.transcript || "Emergency Help Needed!"}\nTrack my live location: ${window.location.origin}/?track=${event.id}`
               })
             });
             if (!response.ok) {
               console.error("Twilio SMS HTTP Error", response.status);
             }
           } catch (smsError) {
             console.error("Backend SMS Fetch failed", smsError);
           }
        }
      } catch (e) {
        console.error("Failed to sync queued SOS", e);
        remainingQueue.push(event);
      }
    }
    
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remainingQueue));
    setIsSyncing(false);
  }, []);

  useEffect(() => {
    window.addEventListener('online', syncOfflineQueue);
    return () => window.removeEventListener('online', syncOfflineQueue);
  }, [syncOfflineQueue]);

  useEffect(() => {
    if (!auth.currentUser) return;

    // Try to sync any pending items directly on mount (if online)
    syncOfflineQueue();

    const q = query(
      collection(firestore, 'sos_events'),
      where('userId', '==', auth.currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const events: SOSEvent[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        events.push({ 
          id: docSnap.id, 
          ...data,
          timestamp: data.timestamp?.toMillis ? data.timestamp.toMillis() : (data.timestamp || Date.now())
        } as unknown as SOSEvent);
      });
      
      // Also grab offline ones and inject them so they show instantly
      const queueData = localStorage.getItem(OFFLINE_QUEUE_KEY);
      if (queueData) {
        try {
          const offlineQueue = JSON.parse(queueData);
          for (const offlineEvent of offlineQueue) {
            if (!events.find(e => e.id === offlineEvent.id)) {
              events.push({
                ...offlineEvent,
                status: 'OFFLINE_QUEUED',
              });
            }
          }
        } catch (e) {}
      }

      // sort reverse chronological
      events.sort((a, b) => b.timestamp - a.timestamp);
      setLocalEvents(events);
      
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      
      // Cleanup Remote Firestore for this user
      try {
        const fetchOldQ = query(
          collection(firestore, 'sos_events'),
          where('userId', '==', auth.currentUser!.uid),
          where('timestamp', '<', oneDayAgo)
        );
        const expiredSnap = await getDocs(fetchOldQ);
        for (const docSnap of expiredSnap.docs) {
          try {
            await deleteDoc(docSnap.ref);
          } catch (err) {
            handleFirestoreError(err, OperationType.DELETE, docSnap.ref.path);
          }
        }
      } catch (e) {
        console.error("Remote cleanup error", e);
      }
    });
    
    return () => unsubscribe();
  }, [syncOfflineQueue]);

  const broadcastSOS = useCallback(async (
    type: 'voice' | 'silent' | 'text',
    message: string,
    latitude: number,
    longitude: number,
    audioBlob?: Blob,
    emergencyContacts: string[] = [],
    medicalInfo: { bloodType?: string; conditions?: string } = {},
    autoTriggerInfo?: SOSEvent['autoTriggerInfo']
  ) => {
    if (!auth.currentUser) throw new Error("Must be logged in to broadcast SOS");

    let base64Audio: string | undefined = undefined;
    if (audioBlob) {
      try {
        const reader = new FileReader();
        base64Audio = await new Promise((resolve) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(audioBlob);
        });
      } catch (err) {
        console.error("Failed to convert audioBlob to Base64", err);
      }
    }

    const newEvent: any = {
      id: uuidv4(),
      userId: auth.currentUser.uid,
      deviceId: getDeviceId(),
      latitude,
      longitude,
      transcript: message || "Help me!",
      type,
      status: 'PENDING',
      retryCount: 0,
      isResolved: false,
      emergencyContacts,
      medicalInfo,
      deliveredTo: [],
      acknowledgedBy: [],
      autoTriggerInfo,
      audioDataUrl: base64Audio
    };

    const firestoreEvent = Object.fromEntries(
      Object.entries(newEvent).filter(([_, v]) => v !== undefined)
    );

    setIsSyncing(true);
    try {
      if (!navigator.onLine) {
        throw new Error("Device is offline");
      }
      
      const eventToSave = {
        ...firestoreEvent,
        timestamp: serverTimestamp()
      };
      
      await setDoc(doc(firestore, 'sos_events', newEvent.id), eventToSave);

      // Broadcast SMS via Backend if emergency contacts exist
      if (emergencyContacts.length > 0) {
         try {
           const response = await fetch('/api/send-sms', {
             method: 'POST',
             headers: {
               'Content-Type': 'application/json'
             },
             body: JSON.stringify({
               contacts: emergencyContacts,
               message: `${message || "Emergency Help Needed!"}\nTrack my live location: ${window.location.origin}/?track=${newEvent.id}`
             })
           });
           if (!response.ok) {
             console.error("Twilio SMS HTTP Error", response.status);
           }
         } catch (smsError) {
           console.error("Backend SMS Fetch failed", smsError);
         }
      }
    } catch (e) {
      console.error("Failed to broadcast SOS, queuing to offline storage", e);
      const queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
      queue.push({
        ...firestoreEvent,
        timestamp: Date.now() // Use local time for offline queue
      });
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    }
    setIsSyncing(false);

    // After updating local storage, trigger re-render if possible (events listener might not catch this trivially if no change in remote DB, but it's okay)
    const queueData = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (queueData) {
      try {
        const offlineQueue = JSON.parse(queueData);
        setLocalEvents(prev => {
           let updated = [...prev];
           for (const offlineEvent of offlineQueue) {
             if (!updated.find(e => e.id === offlineEvent.id)) {
               updated.push({
                 ...offlineEvent,
                 status: 'OFFLINE_QUEUED',
               } as SOSEvent);
             }
           }
           return updated.sort((a, b) => b.timestamp - a.timestamp);
        });
      } catch (err) {}
    }

    return newEvent.id;
  }, []);

  const resolveSOS = useCallback(async (eventId: string) => {
    try {
      if (!navigator.onLine) {
        throw new Error("Cannot resolve while offline"); // or we can handle offline resolve
      }
      await updateDoc(doc(firestore, 'sos_events', eventId), { isResolved: true, status: 'PENDING' });
      
      // Remove from queue if it's there
      let queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
      queue = queue.filter((e: any) => e.id !== eventId);
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    } catch(e) {
      console.error(e);
    }
  }, []);

  const deleteSOS = useCallback(async (eventId: string) => {
    try {
      await deleteDoc(doc(firestore, 'sos_events', eventId));
      
      // Remove from queue if it's there
      let queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
      queue = queue.filter((e: any) => e.id !== eventId);
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `sos_events/${eventId}`);
    }
  }, []);

  return {
    localEvents,
    broadcastSOS,
    resolveSOS,
    deleteSOS,
    isSyncing
  };
};
