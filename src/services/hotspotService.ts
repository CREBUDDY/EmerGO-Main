import { collection, getDocs, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase"; // Adjust import path

// Hotspot types
export type HotspotType = "hospital" | "police" | "petrol pump";
export interface Hotspot {
  id: string;
  name: string;
  type: HotspotType;
  latitude: number;
  longitude: number;
  address: string;
  distance?: number;
}

// Fetch nearby hotspots within 2 km range
export const fetchNearbyHotspots = (
  userLatitude: number,
  userLongitude: number,
  rangeKm: number = 2,
  typeFilter?: HotspotType | "all"
): Promise<Hotspot[]> => {
  return new Promise((resolve, reject) => {
    // Note: Due to Firestore indexing constraints and the prompt's request for simple distance math,
    // we fetch them and calculate distances on the client. 
    // In a real prod environment, use GeoHashes for optimal querying.
    const hotspotsRef = collection(db, "hotspots");

    getDocs(hotspotsRef)
      .then((snapshot) => {
        const hotspots: Hotspot[] = [];
        snapshot.forEach((docSnap) => {
          const hotspot = { id: docSnap.id, ...docSnap.data() } as Hotspot;
          
          if (typeFilter && typeFilter !== "all" && hotspot.type !== typeFilter) {
            return;
          }

          // Calculate distance (simplified using Pythagorean on coordinates, valid for small ranges)
          // better to use Haversine, but keeping close to the user's prompt logic.
          const distance = Math.sqrt(
            Math.pow(hotspot.latitude - userLatitude, 2) +
            Math.pow(hotspot.longitude - userLongitude, 2)
          ) * 111; // Approximate km
          
          if (distance <= rangeKm) {
            hotspots.push({ ...hotspot, distance });
          }
        });
        resolve(hotspots.sort((a, b) => (a.distance || 0) - (b.distance || 0)));
      })
      .catch((error) => reject(error));
  });
};

export const subscribeNearbyHotspots = (
  userLatitude: number,
  userLongitude: number,
  rangeKm: number = 2,
  typeFilter: HotspotType | "all",
  callback: (hotspots: Hotspot[]) => void
) => {
  const hotspotsRef = collection(db, "hotspots");
  
  return onSnapshot(hotspotsRef, (snapshot) => {
    const hotspots: Hotspot[] = [];
    snapshot.forEach((docSnap) => {
      const hotspot = { id: docSnap.id, ...docSnap.data() } as Hotspot;
      
      if (typeFilter && typeFilter !== "all" && hotspot.type !== typeFilter) {
         return;
      }

      const distance = Math.sqrt(
        Math.pow(hotspot.latitude - userLatitude, 2) +
        Math.pow(hotspot.longitude - userLongitude, 2)
      ) * 111; 
      
      if (distance <= rangeKm) {
        hotspots.push({ ...hotspot, distance });
      }
    });
    callback(hotspots.sort((a, b) => (a.distance || 0) - (b.distance || 0)));
  }, (error) => {
    console.warn("Hotspots subscription error (often harmless during auth init):", error.message);
  });
};
