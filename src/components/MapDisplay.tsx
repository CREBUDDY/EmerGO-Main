import React, { useEffect, useState, useMemo } from 'react';
import { useTheme } from 'next-themes';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db as firestore, auth } from '@/src/lib/firebase';
import { cn } from '@/lib/utils';
import { Map, Globe, AlertTriangle, User, ExternalLink, LocateFixed, Radio } from 'lucide-react';
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
const createCustomIcon = (color: string, size: number = 14, isOffline: boolean = false, isSos: boolean = false) => {
  const opacityClass = isOffline ? 'opacity-40' : 'opacity-100';
  const glow = isOffline ? 'none' : `0 0 15px ${color}, inset 0 0 8px rgba(0,0,0,0.6)`;
  const sosCoreScale = 0.4;
  
  return L.divIcon({
    className: 'bg-transparent border-0',
    html: `
      <div class="relative flex items-center justify-center ${opacityClass}" style="width: ${size*2.5}px; height: ${size*2.5}px;">
        <!-- Radar Ping -->
        ${isSos ? `<div class="absolute inset-0 rounded-full animate-ping" style="background-color: ${color}; opacity: 0.4;"></div>` : ''}
        
        <!-- Rotating dashed ring -->
        <div class="absolute rounded-full border border-dashed animate-[spin_6s_linear_infinite]" style="width: ${size*1.8}px; height: ${size*1.8}px; border-color: ${color}; opacity: ${isOffline ? 0.3 : 0.6};"></div>
        
        <!-- Core Node -->
        <div class="absolute rounded-full flex items-center justify-center" style="width: ${size}px; height: ${size}px; background-color: ${color}; border: ${isOffline ? '1px' : '2px'} solid rgba(255,255,255,${isOffline ? 0.5 : 0.9}); box-shadow: ${glow}; z-index: 10;">
            ${isSos ? `<div class="bg-foreground rounded-full animate-[pulse_1s_ease-in-out_infinite]" style="width: ${size * sosCoreScale}px; height: ${size * sosCoreScale}px; box-shadow: 0 0 5px white;"></div>` : ''}
        </div>
      </div>
    `,
    iconSize: [size*2.5, size*2.5],
    iconAnchor: [size*1.25, size*1.25],
  });
};

const createClusterCustomIcon = function (cluster: any) {
  return L.divIcon({
    html: `<div class="relative flex items-center justify-center w-12 h-12">
             <div class="absolute inset-0 bg-card dark:bg-black/80 backdrop-blur-xl rounded-full border border-black/20 dark:border-white/20 shadow-[0_0_20px_rgba(0,0,0,0.6)]"></div>
             <div class="absolute inset-1 rounded-full border border-dashed border-cyan-500/30 animate-[spin_8s_linear_infinite]"></div>
             <span class="relative text-foreground font-mono text-[13px] font-bold z-10">${cluster.getChildCount()}</span>
           </div>`,
    className: 'bg-transparent border-0',
    iconSize: L.point(48, 48, true),
  });
};

const userIcon = createCustomIcon('#0ea5e9', 14); // Cyan-blue
const nodeIcon = createCustomIcon('#0ea5e9', 12);
const offlineNodeIcon = createCustomIcon('#52525b', 12, true); // Zinc
const relayIcon = createCustomIcon('#a855f7', 14); // Purple
const sosIcon = createCustomIcon('#ef4444', 18, false, true); // Red
const offlineSosIcon = createCustomIcon('#ef4444', 18, true, true);

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
  const { theme, resolvedTheme } = useTheme();
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
        } as MapNode;
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
        } as MapNode;
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
      <style>{`
        .leaflet-popup-content-wrapper {
          background: #0A0A0B !important;
          border: 1px solid #2A2C32 !important;
          color: white !important;
          border-radius: 8px !important;
          box-shadow: 0 4px 20px rgba(0,0,0,0.8) !important;
          padding: 0 !important;
        }
        .leaflet-popup-content {
          margin: 0 !important;
        }
        .leaflet-popup-tip {
          background: #0A0A0B !important;
          border: 1px solid #2A2C32 !important;
          border-top: none !important;
          border-left: none !important;
        }
        .leaflet-popup-close-button {
          color: #8E9299 !important;
          padding: 4px !important;
        }
        .leaflet-popup-close-button:hover {
          color: white !important;
          background: transparent !important;
        }
        .leaflet-container {
          background: #0A0A0B;
        }
      `}</style>
      {/* Top Filter Bar */}
      <div className="bg-transparent p-4 z-[10] relative shrink-0">
         <div className="bg-card/90 dark:bg-black/60 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-2xl p-3 shadow-2xl flex flex-col xl:flex-row xl:items-center justify-between gap-4 w-full">
            
            {/* Map Header */}
            <div className="flex items-center gap-3 text-foreground shrink-0 px-2">
               <div className="w-10 h-10 rounded-xl bg-black/5 dark:bg-white/5 flex items-center justify-center border border-black/10 dark:border-white/10 shrink-0 shadow-inner">
                  <Map className="w-5 h-5 text-foreground/70" />
               </div>
               <div className="flex flex-col shrink-0">
                  <span className="text-[13px] font-black tracking-[0.15em] uppercase leading-none text-foreground">Global Map</span>
                  <span className="text-[9px] text-[#22C55E] tracking-[0.2em] font-mono mt-1.5 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse"></span>
                    LIVE_FEED
                  </span>
               </div>
            </div>

            {/* Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full xl:w-auto">
               
               {/* View Filters */}
               <div className="flex bg-background/50 p-1.5 rounded-xl border border-black/5 dark:border-white/5 text-[11px] sm:text-xs overflow-x-auto scrollbar-none flex-nowrap w-full sm:w-auto">
                  <button onClick={() => setFilterMode('all')} className={cn("px-4 py-2 rounded-lg font-bold transition-all whitespace-nowrap outline-none", filterMode === 'all' ? "bg-foreground text-background shadow-md" : "text-muted-foreground hover:text-foreground hover:bg-black/10 dark:hover:bg-white/10")}>ALL</button>
                  <button onClick={() => setFilterMode('sos')} className={cn("px-4 py-2 rounded-lg font-bold transition-all flex items-center gap-1.5 whitespace-nowrap outline-none", filterMode === 'sos' ? "bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.4)]" : "text-muted-foreground hover:text-red-400 hover:bg-black/5 dark:bg-white/5")}><AlertTriangle className="w-3.5 h-3.5"/> SOS</button>
                  <button onClick={() => setFilterMode('user')} className={cn("px-4 py-2 rounded-lg font-bold transition-all flex items-center gap-1.5 whitespace-nowrap outline-none", filterMode === 'user' ? "bg-[#0ea5e9] text-white shadow-[0_0_15px_rgba(14,165,233,0.4)]" : "text-muted-foreground hover:text-[#0ea5e9] hover:bg-black/5 dark:bg-white/5")}><User className="w-3.5 h-3.5"/> USERS</button>
                  <button onClick={() => setFilterMode('nearby')} className={cn("px-4 py-2 rounded-lg font-bold transition-all flex items-center gap-1.5 whitespace-nowrap outline-none", filterMode === 'nearby' ? "bg-yellow-500 text-black shadow-[0_0_15px_rgba(234,179,8,0.4)]" : "text-muted-foreground hover:text-yellow-400 hover:bg-black/5 dark:bg-white/5")}><Radio className="w-3.5 h-3.5"/> NEARBY</button>
               </div>
               
               {/* Technical Filters */}
               <div className="flex items-center gap-3 shrink-0 ml-auto xl:ml-0 overflow-x-auto scrollbar-none pb-1 sm:pb-0">
                  <button onClick={() => setShowRelays(!showRelays)} className={cn("flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl font-bold transition-all text-[11px] sm:text-xs border tracking-wide whitespace-nowrap", showRelays ? "bg-purple-500/20 text-purple-400 border-purple-500/30" : "bg-black/10 dark:bg-black/50 text-muted-foreground border-black/5 dark:border-white/5 hover:text-foreground")} title="Toggle Mesh Relays">
                    <Radio className="w-3.5 h-3.5"/> 
                    <span className="hidden sm:inline">MESH RELAYS</span>
                    <span className="sm:hidden">RLY</span>
                  </button>
                  <select 
                    value={connectionFilter}
                    onChange={(e) => setConnectionFilter(e.target.value as any)}
                    className="bg-black/10 dark:bg-black/50 text-muted-foreground border border-black/5 dark:border-white/5 rounded-xl px-3 py-2 outline-none text-[10px] sm:text-[11px] font-bold tracking-[0.15em] uppercase cursor-pointer hover:text-foreground transition-all appearance-none text-center"
                    title="Connection Filter"
                  >
                    <option value="all">ALL NODES</option>
                    <option value="online">ONLINE</option>
                    <option value="offline">OFFLINE</option>
                  </select>
               </div>
            </div>

         </div>
      </div>

      <div className="flex-1 w-full min-h-0 relative z-[1]">
        <div className="absolute inset-0">
        {/* Map Type & Locate Controls overlay */}
        <div className="absolute top-4 right-4 z-[9999] flex flex-col gap-2 relative pointer-events-none">
          <div className="absolute top-0 right-0 flex flex-col gap-2 pointer-events-auto">
            <LiveCompass className="mb-2" />
            <div className="flex flex-col bg-card/90 backdrop-blur-sm border border-border rounded-md overflow-hidden shadow-2xl">
              <button onClick={() => setMapType('default')} className={cn("p-2 transition-all hover:bg-muted dark:bg-muted/80 flex items-center justify-center", mapType === 'default' ? "bg-red-500/20 text-red-500" : "text-muted-foreground")} title="Vector Map"><Map className="w-4 h-4" /></button>
              <button onClick={() => setMapType('satellite')} className={cn("p-2 transition-all hover:bg-muted dark:bg-muted/80 border-t border-border flex items-center justify-center", mapType === 'satellite' ? "bg-red-500/20 text-red-500" : "text-muted-foreground")} title="Satellite Imagery"><Globe className="w-4 h-4" /></button>
            </div>
            <button onClick={() => window.dispatchEvent(new Event('RECENTER_MAP'))} className="bg-card/90 border border-border p-2 rounded-md shadow-2xl hover:bg-muted dark:bg-muted/80 text-foreground transition-colors" title="Locate Me">
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
                <span className="text-[10px] font-mono text-foreground/90">LIVE_TRACKING.OS</span>
             </div>
          )}
          <div className="font-mono text-[9px] text-muted-foreground/80 ml-4 mt-1">
             MARKERS: {processedMarkers.length}<br/>
             LAT: {currentViewCenter[0].toFixed(5)}<br/>
             LNG: {currentViewCenter[1].toFixed(5)}
          </div>
        </div>

        <MapContainer center={currentViewCenter} zoom={13} style={{ height: '100%', width: '100%' }} zoomControl={false} maxZoom={18}>
          <TileLayer
            key={mapType + theme} 
            attribution=""
            url={mapType === 'satellite' 
              ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' 
              : ((resolvedTheme || theme) === 'light' ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png' : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png')}
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

          <MarkerClusterGroup chunkedLoading maxClusterRadius={40} iconCreateFunction={createClusterCustomIcon}>
            {processedMarkers.map(marker => {
              let iconType = nodeIcon;
              if (marker.type === 'SOS') iconType = marker.status === 'OFFLINE' ? offlineSosIcon : sosIcon;
              else if (marker.type === 'RELAY') iconType = relayIcon;
              else if (marker.status === 'OFFLINE') iconType = offlineNodeIcon;

              return (
                <Marker key={marker.id} position={[marker.latitude, marker.longitude]} icon={iconType}>
                  <Popup className="custom-popup">
                    <div className="p-3 w-[220px]">
                      <div className="flex items-center justify-between mb-2 pb-2 border-b border-border">
                        <h3 className={cn("font-bold text-sm tracking-wide", marker.type === 'SOS' ? "text-red-500" : marker.type === 'RELAY' ? "text-purple-500" : "text-blue-500")}>
                          {marker.type === 'SOS' ? 'EMERGENCY' : marker.type} NODE
                        </h3>
                        {marker.status === 'OFFLINE' && <span className="bg-muted dark:bg-muted/80 text-muted-foreground text-[9px] px-1.5 pt-0.5 rounded uppercase font-bold tracking-widest border border-[#444]">Offline</span>}
                      </div>
                      
                      {marker.message && <p className="text-[13px] mb-3 italic text-muted-foreground bg-card py-2 px-3 rounded-md border border-black/5 dark:border-white/5">"{marker.message}"</p>}
                      
                      <div className="flex flex-col gap-1 text-[11px] text-muted-foreground font-mono mb-3 bg-[#111214] p-2 rounded-md border border-border">
                        <div className="flex justify-between">
                          <span>DISTANCE:</span>
                          <span className="font-bold text-foreground">{marker.distance?.toFixed(2) || '?'} km</span>
                        </div>
                        <div className="flex justify-between">
                          <span>UPDATED:</span>
                          <span className="text-foreground">{formatDistanceToNow(marker.timestamp, { addSuffix: true })}</span>
                        </div>
                      </div>

                      <button 
                        onClick={() => openGoogleMaps(marker.latitude, marker.longitude)}
                        className="w-full bg-foreground text-background hover:bg-foreground/80 transition-colors py-2 rounded flex items-center justify-center gap-2 text-xs font-bold tracking-wide mt-1"
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
      <div className="bg-transparent p-4 flex flex-wrap gap-4 items-center justify-center text-[10px] font-mono tracking-widest text-muted-foreground z-[10] relative shrink-0">
         <div className="bg-card/90 dark:bg-black/60 backdrop-blur-md px-5 py-3 rounded-2xl border border-black/10 dark:border-white/10 flex flex-wrap justify-center gap-6 shadow-2xl">
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_10px_#ef4444]" /> 
            <span className="text-foreground font-bold">EMERGENCY</span>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-[#0ea5e9] shadow-[0_0_10px_#0ea5e9]" /> 
            <span className="text-foreground font-bold">USER</span>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-[#a855f7] shadow-[0_0_10px_#a855f7]" /> 
            <span className="text-foreground font-bold">MESH RELAY</span>
          </div>
          <div className="flex items-center gap-2.5 opacity-60">
            <div className="w-2.5 h-2.5 rounded-full border border-white/30 bg-[#3f3f46]" /> 
            <span className="text-muted-foreground font-bold">OFFLINE</span>
          </div>
        </div>
      </div>
    </div>
  );
});
