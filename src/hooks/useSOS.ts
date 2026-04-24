import { useEffect, useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { SOSEvent } from '../types/sos';
import { getDeviceId } from '../lib/device';
import { auth, db as firestore, handleFirestoreError, OperationType } from '../lib/firebase';
import { onSnapshot, query, collection, where, deleteDoc, doc, getDocs, setDoc, updateDoc } from 'firebase/firestore';

export const useSOS = () => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [localEvents, setLocalEvents] = useState<SOSEvent[]>([]);

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(firestore, 'sos_events'),
      where('userId', '==', auth.currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const events: SOSEvent[] = [];
      snapshot.forEach(docSnap => events.push({ id: docSnap.id, ...docSnap.data() } as SOSEvent));
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
  }, []);

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

    const newEvent: SOSEvent = {
      id: uuidv4(),
      userId: auth.currentUser.uid,
      deviceId: getDeviceId(),
      timestamp: Date.now(),
      latitude,
      longitude,
      transcript: message,
      type,
      status: 'PENDING',
      retryCount: 0,
      isResolved: false,
      audioBlob: undefined, // Will be replaced by dataUrl later if applicable
      emergencyContacts,
      medicalInfo,
      deliveredTo: [],
      acknowledgedBy: [],
      autoTriggerInfo
    };

    setIsSyncing(true);
    try {
      await setDoc(doc(firestore, 'sos_events', newEvent.id), newEvent);

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
               message: message || "Emergency Help Needed!" // simplified
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
      console.error("Failed to broadcast SOS", e);
    }
    setIsSyncing(false);

    return newEvent.id;
  }, []);

  const resolveSOS = useCallback(async (eventId: string) => {
    await updateDoc(doc(firestore, 'sos_events', eventId), { isResolved: true, status: 'PENDING' });
  }, []);

  const deleteSOS = useCallback(async (eventId: string) => {
    try {
      await deleteDoc(doc(firestore, 'sos_events', eventId));
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
