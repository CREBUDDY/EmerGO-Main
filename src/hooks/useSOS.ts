import { useEffect, useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { SOSEvent } from '../types/sos';
import { getDeviceId } from '../lib/device';
import { auth, db as firestore, handleFirestoreError, OperationType } from '../lib/firebase';
import { onSnapshot, query, collection, where, deleteDoc, doc, getDocs, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

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
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        events.push({ 
          id: docSnap.id, 
          ...data,
          timestamp: data.timestamp?.toMillis ? data.timestamp.toMillis() : (data.timestamp || Date.now())
        } as unknown as SOSEvent);
      });
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
      timestamp: serverTimestamp(),
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

    console.log("Broadcasting SOS structure:", JSON.stringify(firestoreEvent));
    console.log("uid matches auth:", auth.currentUser.uid === firestoreEvent.userId);

    setIsSyncing(true);
    try {
      await setDoc(doc(firestore, 'sos_events', newEvent.id), firestoreEvent);

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
