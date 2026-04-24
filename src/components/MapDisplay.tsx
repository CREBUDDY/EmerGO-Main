import React, { useEffect, useState, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { collection, onSnapshot, query, where, getDocs } from 'firebase/firestore';
import { db as firestore, auth, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { cn } from '@/lib/utils';
import { Map, Globe, Layers, AlertTriangle, User, ExternalLink, LocateFixed, EyeOff, Radio } from 'lucide-react';
import { calculateDistance } from '@/src/lib/geo';
import MarkerClusterGroup from 'react-leaflet-cluster';
import { formatDistanceToNow } from 'date-fns';
import { LiveCompass } from './LiveCompass';

// Fix Leaflet Default Icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom Icons
const createCustomIcon = (color: string, size: number = 12, isOffline: boolean = false, isSos: boolean = false) => {
  const pulseAnim = isSos ? 'animation: pulse 2s infinite;' : '';
  const opacity = isOffline ? 'opacity: 0.5;' : '';
  const shadow = isSos ? `box-shadow: 0 0 10px ${color};` : `box-shadow: 0 0 4px rgba(0,0,0,0.5);`;
  return L.divIcon({
    className: 'custom-leaflet-marker',
    html: `<div style="width: ${size}px; height: ${size}px; background-color: ${color}; border-radius: 50%; border: 2px solid white; ${shadow} ${opacity} ${pulseAnim} display: flex; align-items: center; justify-content: center;">${isSos ? '<div style="width: 8px; height: 8px; background-color: white; border-radius: 50%;"></div>' : ''}</div>`,
    iconSize: [size, size],
    iconAnchor: [size/2, size/2],
  });
};

const userIcon = createCustomIcon('#3b82f6', 16);
const nodeIcon = createCustomIcon('#3b82f6', 14);
const offlineNodeIcon = createCustomIcon('#8E9299', 14, true);
const relayIcon = createCustomIcon('#a855f7', 16); // Purple for relay
const sosIcon = createCustomIcon('#ef4444', 24, false, true);
const offlineSosIcon = createCustomIcon('#ef4444', 24, true, true);

const DEFAULT_CENTER: [number, number] = [28.6139, 77.2090];
const SOS_EXPIRY_MS = 15 * 60 * 1000; // 15 mins

// Interfaces
interface MapNode {
  id: string;
  latitude: number;
  longitude: number;
  type: 'SOS' | 'USER' | 'RELAY';
  status: 'ACTIVE' | 'OFFLINE';
  timestamp: number;
  message?: string;
  distance?: number;
}

// Map Controls Component
const MapControls = ({ center, onMove, userLocation }: { center: [number, number], onMove?: (lat: number, lng: number) => void, userLocation: [number, number] | null }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);

  useEffect(() => {
    const handleMove = () => {
      const { lat, lng } = map.getCenter();
      onMove?.(lat, lng);
    };
    map.on('moveend', handleMove);
    return () => { map.off('moveend', handleMove); };
  }, [map, onMove]);

  // Center button handler attached to window for easy access from parent
  useEffect(() => {
    const handleRecenter = () => {
      if (userLocation) map.flyTo(userLocation, 14, { duration: 1.5 });
    };
    window.addEventListener('RECENTER_MAP', handleRecenter);
    return () => window.removeEventListener('RECENTER_MAP', handleRecenter);
  }, [map, userLocation]);

  return null;
};

export const MapDisplay = React.memo(() => {
  const [nodes, setNodes] = useState<MapNode[]>([]);
  const [sosRequests, setSosRequests] = useState<MapNode[]>([]);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [currentViewCenter, setCurrentViewCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [mapType, setMapType] = useState<'default' | 'satellite'>('default');
  
  // Filters
  const [filterMode, setFilterMode] = useState<'all' | 'sos' | 'user' | 'nearby'>('all');
  const [connectionFilter, setConnectionFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [showRelays, setShowRelays] = useState(true);
  const [maxDistanceKm, setMaxDistanceKm] = useState<number>(10);
  const [isOfflineMode, setIsOfflineMode] = useState(!navigator.onLine);

  useEffect(() => {
    const handleRangeSync = (e: any) => {
      if (e.detail && typeof e.detail === 'number') {
        setMaxDistanceKm(e.detail);
      }
    };
    window.addEventListener('RADAR_RANGE_CHANGED', handleRangeSync);
    return () => window.removeEventListener('RADAR_RANGE_CHANGED', handleRangeSync);
  }, []);

  const handleRangeChange = (val: number) => {
    setMaxDistanceKm(val);
    window.dispatchEvent(new CustomEvent('RADAR_RANGE_CHANGED', { detail: val }));
  };

  useEffect(() => {
    const handleOnline = () => setIsOfflineMode(false);
    const handleOffline = () => setIsOfflineMode(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Live Location tracking
  useEffect(() => {
    if ("geolocation" in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setUserLocation([pos.coords.latitude, pos.coords.longitude]);
          // Center on first load
          if (!userLocation) setCurrentViewCenter([pos.coords.latitude, pos.coords.longitude]);
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, []);

  // Real-time Data Engine
  useEffect(() => {
    // Nodes Listener
    const unsubscribeNodes = onSnapshot(collection(firestore, 'nodes'), (snapshot) => {
      const detectedNodes: MapNode[] = snapshot.docs.map(doc => {
        const data = doc.data() as any;
        return {
          id: doc.id,
          latitude: data.latitude,
          longitude: data.longitude,
          type: data.isRelay ? 'RELAY' : 'USER',
          status: data.isOnline === false ? 'OFFLINE' : 'ACTIVE',
          timestamp: data.lastUpdated || Date.now()
        };
      }).filter(n => n.id !== auth.currentUser?.uid && n.latitude && n.longitude);
      setNodes(detectedNodes);
    });

    // SOS Listener
    const qSos = query(collection(firestore, 'sos_events'), where('isResolved', '==', false));
    const unsubscribeSos = onSnapshot(qSos, (snapshot) => {
      const requests: MapNode[] = snapshot.docs.map(doc => {
        const data = doc.data() as any;
        return {
          id: doc.id,
          latitude: data.latitude,
          longitude: data.longitude,
          type: 'SOS',
          status: 'ACTIVE',
          timestamp: data.timestamp?.toMillis ? data.timestamp.toMillis() : (data.timestamp || Date.now()),
          message: data.message || data.transcript
        };
      }).filter(n => n.latitude && n.longitude);
      setSosRequests(requests);
    });

    return () => {
      unsubscribeNodes();
      unsubscribeSos();
    };
  }, []);

  useEffect(() => {
    const handleFocusMap = (event: Event | MessageEvent) => {
      let lat, lng;
      if ('detail' in event && event.type === 'FOCUS_MAP') {
         lat = (event as CustomEvent).detail.lat;
         lng = (event as CustomEvent).detail.lng;
      } else if ('data' in event && event.type === 'message' && (event as MessageEvent).data?.type === 'FOCUS_MAP') {
         lat = (event as MessageEvent).data.payload.lat;
         lng = (event as MessageEvent).data.payload.lng;
      }
      if (lat && lng) {
        setCurrentViewCenter([lat, lng]);
        window.dispatchEvent(new Event('RECENTER_MAP'));
        setFilterMode('sos');
      }
    };

    window.addEventListener('FOCUS_MAP', handleFocusMap);
    navigator.serviceWorker?.addEventListener('message', handleFocusMap);
    return () => {
      window.removeEventListener('FOCUS_MAP', handleFocusMap);
      navigator.serviceWorker?.removeEventListener('message', handleFocusMap);
    };
  }, []);

  // Filter & Process Data
  const processedMarkers = useMemo(() => {
    const now = Date.now();
    let allMarkers = [...nodes, ...sosRequests];

    return allMarkers.filter(marker => {
      // Time Filter for SOS
      if (marker.type === 'SOS' && (now - marker.timestamp > SOS_EXPIRY_MS)) return false;
      
      // Connection Filter
      if (connectionFilter === 'online' && marker.status === 'OFFLINE') return false;
      if (connectionFilter === 'offline' && marker.status !== 'OFFLINE') return false;

      // Type filters
      if (filterMode === 'sos' && marker.type !== 'SOS') return false;
      if (filterMode === 'user' && marker.type !== 'USER') return false;
      if (!showRelays && marker.type === 'RELAY') return false;

      // Distance calculate
      const centerPos = userLocation || DEFAULT_CENTER;
      marker.distance = calculateDistance(centerPos[0], centerPos[1], marker.latitude, marker.longitude);
      
      // Distance filter
      if (filterMode === 'nearby' && marker.distance > maxDistanceKm) return false;

      return true;
    });
  }, [nodes, sosRequests, filterMode, connectionFilter, showRelays, maxDistanceKm, userLocation]);

  const openGoogleMaps = (lat: number, lng: number) => {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
  };

  return (
    <div className="hardware-card w-full h-full relative overflow-hidden group flex flex-col">
      {/* Top Filter Bar */}
      <div className="bg-[#111214] border-b border-[#2A2C32] p-3 flex flex-wrap gap-4 items-center justify-between z-[10] relative shrink-0">
        <div className="flex gap-2 text-xs">
           <button onClick={() => setFilterMode('all')} className={cn("px-3 py-1.5 rounded font-bold transition-colors", filterMode === 'all' ? "bg-white text-black" : "bg-[#1A1C20] text-gray-400 hover:text-white")}>ALL</button>
           <button onClick={() => setFilterMode('sos')} className={cn("px-3 py-1.5 rounded font-bold transition-colors flex items-center gap-1", filterMode === 'sos' ? "bg-red-500 text-white" : "bg-[#1A1C20] text-gray-400 hover:text-red-400")}><AlertTriangle className="w-3.5 h-3.5"/> SOS</button>
           <button onClick={() => setFilterMode('user')} className={cn("px-3 py-1.5 rounded font-bold transition-colors flex items-center gap-1", filterMode === 'user' ? "bg-blue-500 text-white" : "bg-[#1A1C20] text-gray-400 hover:text-blue-400")}><User className="w-3.5 h-3.5"/> USERS</button>
           <button onClick={() => setFilterMode('nearby')} className={cn("px-3 py-1.5 rounded font-bold transition-colors flex items-center gap-1", filterMode === 'nearby' ? "bg-yellow-500 text-black" : "bg-[#1A1C20] text-gray-400 hover:text-yellow-400")}><Radio className="w-3.5 h-3.5"/> NEARBY</button>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
           <div className="flex items-center gap-2">
             <span className="text-[#8E9299]">RADAR RANGE:</span>
             <input type="range" min="1" max="50" value={maxDistanceKm} onChange={(e) => handleRangeChange(Number(e.target.value))} className="w-24 accent-red-500" />
             <span className="text-white w-8">{maxDistanceKm}km</span>
           </div>
           
           <div className="flex gap-3 items-center">
             <button onClick={() => setShowRelays(!showRelays)} className={cn("flex items-center gap-1", showRelays ? "text-blue-400" : "text-[#5A5C62]")} title="Toggle Relays"><Radio className="w-4 h-4"/> RLY</button>
             <select 
               value={connectionFilter}
               onChange={(e) => setConnectionFilter(e.target.value as any)}
               className="bg-[#1A1C20] text-gray-300 border border-[#2A2C32] rounded px-2 py-1 outline-none text-[10px] font-bold tracking-widest uppercase cursor-pointer hover:border-gray-500 transition-colors h-[26px]"
               title="Connection Filter"
             >
               <option value="all">ALL NODES</option>
               <option value="online">ONLINE</option>
               <option value="offline">OFFLINE</option>
             </select>
           </div>
        </div>
      </div>

      <div className="flex-1 w-full min-h-0 relative z-[1]">
        <div className="absolute inset-0">
        {/* Map Type & Locate Controls overlay */}
        <div className="absolute top-4 right-4 z-[9999] flex flex-col gap-2 relative pointer-events-none">
          <div className="absolute top-0 right-0 flex flex-col gap-2 pointer-events-auto">
            <LiveCompass className="mb-2" />
            <div className="flex flex-col bg-[#151619]/90 backdrop-blur-sm border border-[#2A2C32] rounded-md overflow-hidden shadow-2xl">
              <button onClick={() => setMapType('default')} className={cn("p-2 transition-all hover:bg-[#2A2C32] flex items-center justify-center", mapType === 'default' ? "bg-red-500/20 text-red-500" : "text-[#8E9299]")} title="Vector Map"><Map className="w-4 h-4" /></button>
              <button onClick={() => setMapType('satellite')} className={cn("p-2 transition-all hover:bg-[#2A2C32] border-t border-[#2A2C32] flex items-center justify-center", mapType === 'satellite' ? "bg-red-500/20 text-red-500" : "text-[#8E9299]")} title="Satellite Imagery"><Globe className="w-4 h-4" /></button>
            </div>
            <button onClick={() => window.dispatchEvent(new Event('RECENTER_MAP'))} className="bg-[#151619]/90 border border-[#2A2C32] p-2 rounded-md shadow-2xl hover:bg-[#2A2C32] text-white transition-colors" title="Locate Me">
              <LocateFixed className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Status Corner */}
        <div className="absolute top-4 left-4 z-[9999] pointer-events-none flex flex-col gap-1">
          {isOfflineMode ? (
            <div className="flex items-center gap-2 bg-yellow-500/20 text-yellow-500 px-2 py-1 rounded border border-yellow-500/50">
              <AlertTriangle className="w-3 h-3" />
              <span className="text-[10px] font-bold tracking-widest">OFFLINE MODE (CACHE)</span>
            </div>
          ) : (
             <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-[pulse_3s_ease-in-out_infinite]" />
                <span className="text-[10px] font-mono text-white/90">LIVE_TRACKING.OS</span>
             </div>
          )}
          <div className="font-mono text-[9px] text-[#8E9299]/80 ml-4 mt-1">
             MARKERS: {processedMarkers.length}<br/>
             LAT: {currentViewCenter[0].toFixed(5)}<br/>
             LNG: {currentViewCenter[1].toFixed(5)}
          </div>
        </div>

        <MapContainer center={currentViewCenter} zoom={13} style={{ height: '100%', width: '100%' }} zoomControl={false} maxZoom={18}>
          <TileLayer
            key={mapType} 
            attribution=""
            url={mapType === 'satellite' 
              ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' 
              : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'}
          />
          
          <MapControls 
            center={currentViewCenter} 
            onMove={(lat, lng) => setCurrentViewCenter([lat, lng])} 
            userLocation={userLocation}
          />

          {userLocation && (
            <>
              <Circle center={userLocation} radius={maxDistanceKm * 1000} pathOptions={{ color: '#8E9299', fillColor: '#8E9299', fillOpacity: 0.05, weight: 1, dashArray: '5, 10' }} />
              <Marker position={userLocation} icon={userIcon}>
                <Popup className="custom-popup">
                   <div className="font-bold text-green-600">You Are Here</div>
                </Popup>
              </Marker>
            </>
          )}

          <MarkerClusterGroup chunkedLoading maxClusterRadius={40}>
            {processedMarkers.map(marker => {
              let iconType = nodeIcon;
              if (marker.type === 'SOS') iconType = marker.status === 'OFFLINE' ? offlineSosIcon : sosIcon;
              else if (marker.type === 'RELAY') iconType = relayIcon;
              else if (marker.status === 'OFFLINE') iconType = offlineNodeIcon;

              return (
                <Marker key={marker.id} position={[marker.latitude, marker.longitude]} icon={iconType}>
                  <Popup className="custom-popup">
                    <div className="p-2 w-[220px]">
                      <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-200">
                        <h3 className={cn("font-bold text-sm", marker.type === 'SOS' ? "text-red-600" : marker.type === 'RELAY' ? "text-blue-600" : "text-green-600")}>
                          {marker.type === 'SOS' ? 'EMERGENCY' : marker.type} NODE
                        </h3>
                        {marker.status === 'OFFLINE' && <span className="bg-gray-200 text-gray-600 text-[9px] px-1.5 pt-0.5 rounded uppercase font-bold">Offline</span>}
                      </div>
                      
                      {marker.message && <p className="text-sm mb-3 italic">"{marker.message}"</p>}
                      
                      <div className="flex flex-col gap-1 text-[11px] text-gray-600 font-mono mb-3">
                        <div className="flex justify-between">
                          <span>DISTANCE:</span>
                          <span className="font-bold text-black">{marker.distance?.toFixed(2) || '?'} km</span>
                        </div>
                        <div className="flex justify-between">
                          <span>UPDATED:</span>
                          <span>{formatDistanceToNow(marker.timestamp, { addSuffix: true })}</span>
                        </div>
                      </div>

                      <button 
                        onClick={() => openGoogleMaps(marker.latitude, marker.longitude)}
                        className="w-full bg-black text-white hover:bg-gray-800 transition-colors py-1.5 rounded flex items-center justify-center gap-2 text-xs font-bold"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> NAVIGATE
                      </button>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MarkerClusterGroup>
        </MapContainer>
        </div>
      </div>
      
      {/* Legend Footer */}
      <div className="bg-[#0A0A0B] border-t border-[#2A2C32] p-2 flex flex-wrap gap-4 items-center justify-center text-[10px] font-mono tracking-widest text-[#8E9299]">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_5px_#ef4444]" /> SOS
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-blue-500" /> USER
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-[#a855f7]" /> RELAY
        </div>
        <div className="flex items-center gap-1.5 opacity-50">
          <div className="w-2 h-2 rounded-full bg-[#8E9299]" /> OFFLINE
        </div>
      </div>
    </div>
  );
});
