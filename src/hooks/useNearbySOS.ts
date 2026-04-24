import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { getDeviceId } from '@/src/lib/device';
import { SOSEvent } from '@/src/types/sos';

import { calculateDistance } from '@/src/lib/geo';

export const useNearbySOS = (userLocation: { lat: number, lng: number } | null, maxDistanceKm: number = 20000) => {
  const [nearbyRequests, setNearbyRequests] = useState<(SOSEvent & { distance: number })[]>([]);

  // Memoize location primitive dependencies to avoid infinite recreation of snapshot listener
  const locLat = userLocation?.lat;
  const locLng = userLocation?.lng;

  useEffect(() => {
    if (!auth.currentUser) return;
    
    // Commented out currentDeviceId for demo purposes so users can see their own SOS broadcasts
    // const currentDeviceId = getDeviceId();

    // Query active SOS events
    // We do NOT filter by userId client-side exclusions because it's better to get all 
    // active and then filter out own device locally (due to Firestore inequality limits).
    const q = query(collection(db, 'sos_events'), where('isResolved', '==', false));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const activeEvents = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as SOSEvent));
      const now = Date.now();
      const MAX_AGE_MS = 24 * 60 * 60 * 1000; // Ignore SOS older than 24 hours

      const nearby = activeEvents
        // 1. Exclude own device (Disabled for Demo so single-user testing works)
        // .filter(req => req.deviceId !== currentDeviceId)
        // 2. Ignore expired
        .filter(req => {
          let eventTime = req.timestamp as any;
          if (eventTime && typeof eventTime === 'object' && 'toMillis' in eventTime) {
            eventTime = eventTime.toMillis();
          } else if (eventTime && typeof eventTime === 'object' && 'seconds' in eventTime) {
            eventTime = eventTime.seconds * 1000;
          }
          
          if (!eventTime) return true; // If timestamp is pending/null from serverTimestamp, it's new
          
          return now - Number(eventTime) < MAX_AGE_MS;
        })
        // 3. Map distance
        .map(req => {
          const distance = (locLat !== undefined && locLng !== undefined) ? calculateDistance(locLat, locLng, req.latitude, req.longitude) : 0;
          return { ...req, distance };
        })
        // 4. Filter by radius
        .filter(req => req.distance <= maxDistanceKm)
        // 5. Sort by distance
        .sort((a, b) => a.distance - b.distance);

      setNearbyRequests(nearby);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'sos_events');
    });

    return () => unsubscribe();
  }, [locLat, locLng, maxDistanceKm]);

  return nearbyRequests;
};
