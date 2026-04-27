import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { db, auth, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { BatteryWarning, Radio, AlertTriangle, WifiOff } from 'lucide-react';
import { useAppMode } from '../hooks/useAppMode';
import { LiveCompass } from './LiveCompass';

interface Node {
  id: string;
  x: number;
  y: number;
  type: 'user' | 'relay' | 'sos';
  status: 'active' | 'low-battery' | 'relaying' | 'emergency' | 'out-of-range' | 'offline';
  strength: number;
  distance?: number;
}

const DEFAULT_CENTER_LAT = 28.6139;
const DEFAULT_CENTER_LNG = 77.2090;

export const Radar = React.memo(() => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [maxRadarRangeKm, setMaxRadarRangeKm] = useState(10);
  const { isOnline } = useAppMode();

  useEffect(() => {
    const handleRangeSync = (e: any) => {
      if (e.detail && typeof e.detail === 'number') {
        setMaxRadarRangeKm(e.detail);
      }
    };
    window.addEventListener('RADAR_RANGE_CHANGED', handleRangeSync);
    return () => window.removeEventListener('RADAR_RANGE_CHANGED', handleRangeSync);
  }, []);

  // Filters
  const [activeFilters, setActiveFilters] = useState({
    active: true,
    relaying: true,
    'low-battery': true,
    offline: true,
  });

  const toggleFilter = (filterKey: keyof typeof activeFilters) => {
    setActiveFilters((prev) => ({
      ...prev,
      [filterKey]: !prev[filterKey],
    }));
  };

  useEffect(() => {
    if (!isOnline) {
      setNodes([]);
      return;
    }

    let currentNodes: Node[] = [];
    let currentSOS: Node[] = [];

    const mapCoordsToRadar = (lat: number, lng: number, centerLat: number, centerLng: number) => {
      // Flat earth approximation for short distances
      const dx = (lng - centerLng) * 40000 * Math.cos((centerLat + lat) * Math.PI / 360) / 360; // km
      const dy = (lat - centerLat) * 40000 / 360; // km
      
      const distance = Math.sqrt(dx*dx + dy*dy);
      
      let x = dx / maxRadarRangeKm;
      let y = -dy / maxRadarRangeKm; 
      
      let isOutOfRange = false;
      if (distance > maxRadarRangeKm) {
        isOutOfRange = true;
        const angle = Math.atan2(y, x);
        x = Math.cos(angle) * 0.95;
        y = Math.sin(angle) * 0.95;
      }

      x = Math.max(-0.95, Math.min(0.95, x));
      y = Math.max(-0.95, Math.min(0.95, y));

      return { x, y, distance, isOutOfRange };
    };

    // 1. Listen to live nodes
    const qNodes = collection(db, 'nodes');
    const unsubscribeNodes = onSnapshot(qNodes, (snapshot) => {
      const allNodesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      const currentUserNode = allNodesData.find(n => n.id === auth.currentUser?.uid);
      
      const centerLat = currentUserNode?.latitude || DEFAULT_CENTER_LAT;
      const centerLng = currentUserNode?.longitude || DEFAULT_CENTER_LNG;

      currentNodes = allNodesData
        .filter(data => data.id !== auth.currentUser?.uid && data.latitude && data.longitude)
        .map(data => {
          const { x, y, distance, isOutOfRange } = mapCoordsToRadar(data.latitude, data.longitude, centerLat, centerLng);

          let status: Node['status'] = 'active';
          if (data.isOnline === false) status = 'offline';
          else if (isOutOfRange) status = 'out-of-range';
          else if (data.batteryLevel && data.batteryLevel < 20) status = 'low-battery';
          else if (data.isRelay) status = 'relaying';

          return {
            id: data.id,
            x,
            y,
            type: data.isRelay ? 'relay' : 'user',
            status,
            strength: (data.batteryLevel || 100) / 100,
            distance
          };
      });

      setNodes([...currentNodes, ...currentSOS]);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'nodes');
    });

    // 2. Listen to active SOS
    const qSos = query(collection(db, 'sos_events'), where('isResolved', '==', false));
    const unsubscribeSos = onSnapshot(qSos, (snapshot) => {
      // Find center again if we can
      const centerLat = DEFAULT_CENTER_LAT; // It's better to fetch users location but using default or recenter logic
      const centerLng = DEFAULT_CENTER_LNG;

      currentSOS = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() as any }))
        .filter(data => data.latitude && data.longitude)
        .map(data => {
          const { x, y, distance } = mapCoordsToRadar(data.latitude, data.longitude, centerLat, centerLng);
          return {
            id: data.id,
            x,
            y,
            type: 'sos',
            status: 'emergency',
            strength: 1,
            distance
          };
        });

      setNodes([...currentNodes, ...currentSOS]);
    });

    return () => {
      unsubscribeNodes();
      unsubscribeSos();
    };
  }, [isOnline, maxRadarRangeKm]);

  const getStatusColor = (status: Node['status']) => {
    switch (status) {
      case 'active': return 'bg-blue-500';
      case 'low-battery': return 'bg-yellow-500';
      case 'relaying': return 'bg-purple-500';
      case 'emergency': return 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]';
      case 'offline': return 'bg-zinc-600 opacity-60';
      case 'out-of-range': return 'bg-gray-600 opacity-50';
      default: return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status: Node['status']) => {
    switch (status) {
      case 'low-battery': return <BatteryWarning className="w-2.5 h-2.5 text-foreground" />;
      case 'relaying': return <Radio className="w-2.5 h-2.5 text-foreground" />;
      case 'emergency': return <AlertTriangle className="w-2.5 h-2.5 text-foreground" />;
      case 'offline':
      case 'out-of-range': return <WifiOff className="w-2.5 h-2.5 text-foreground" />;
      default: return null;
    }
  };

  return (
    <div className="relative w-full aspect-square bg-card/90 dark:bg-black/60 text-muted-foreground border border-black/10 dark:border-white/10 rounded-2xl p-4 flex flex-col items-center justify-center overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-md">
      <div className="absolute top-5 left-5 z-20 flex flex-col gap-2">
        <div className="text-left bg-background/60 p-2.5 rounded-lg border border-black/5 dark:border-white/5 backdrop-blur-sm pointer-events-none">
          <span className="text-[10px] font-bold text-muted-foreground tracking-[0.2em] uppercase leading-none block mb-1">NEARBY NODES</span>
          <div className="text-foreground font-mono text-xl leading-none flex items-baseline gap-1">
            {nodes.length} <span className="text-[10px] text-[#22C55E]">DETECTED</span>
          </div>
        </div>

        <div className="bg-background/60 p-2.5 rounded-lg border border-black/5 dark:border-white/5 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[9px] font-bold tracking-widest text-muted-foreground uppercase">Range</span>
            <span className="text-[10px] font-mono text-foreground font-bold">{maxRadarRangeKm} km</span>
          </div>
          <input 
            type="range"
            min="1"
            max="100"
            step="1"
            value={maxRadarRangeKm}
            onChange={(e) => {
              const val = Number(e.target.value);
              setMaxRadarRangeKm(val);
              window.dispatchEvent(new CustomEvent('RADAR_RANGE_CHANGED', { detail: val }));
            }}
            className="w-full h-1 bg-muted dark:bg-muted/50 rounded-lg appearance-none cursor-pointer accent-[#22C55E] focus:outline-none"
          />
        </div>
      </div>

      <div className="absolute top-5 right-5 z-20">
        <LiveCompass />
      </div>

      <div className="relative w-full h-full rounded-full flex items-center justify-center overflow-hidden bg-gradient-to-tr from-[#22C55E]/5 to-transparent border border-black/5 dark:border-white/5 shadow-[inset_0_0_40px_rgba(34,197,94,0.05)]">
        {/* Radar Rings */}
        <div className="absolute w-[90%] h-[90%] border border-[#22C55E]/10 rounded-full" />
        <div className="absolute w-[60%] h-[60%] border border-[#22C55E]/10 border-dashed rounded-full" />
        <div className="absolute w-[30%] h-[30%] border border-[#22C55E]/10 rounded-full" />
        
        {/* Center Glow */}
        <div className="absolute w-full h-full bg-[radial-gradient(circle_at_center,rgba(34,197,94,0.08)_0%,transparent_50%)] pointer-events-none" />

        {/* Crosshair */}
        <div className="absolute w-full h-[1px] bg-gradient-to-r from-transparent via-[#22C55E]/10 to-transparent" />
        <div className="absolute h-full w-[1px] bg-gradient-to-b from-transparent via-[#22C55E]/10 to-transparent" />

        {/* Direction Guides on Radar Edge */}
        <div className="absolute inset-2 flex flex-col justify-between items-center opacity-80 pointer-events-none text-[10px] font-bold font-mono tracking-widest text-muted-foreground">
          <span className="text-red-500 z-20 mt-1 drop-shadow-md">N</span>
          <span className="z-20 mb-1">S</span>
        </div>
        <div className="absolute inset-2 flex justify-between items-center opacity-80 pointer-events-none text-[10px] font-bold font-mono tracking-widest text-muted-foreground">
          <span className="z-20 ml-1">W</span>
          <span className="z-20 mr-1">E</span>
        </div>

        {/* Sweep */}
        <motion.div
           className="absolute w-full h-full rounded-full"
           animate={{ rotate: 360 }}
           transition={{ ease: "linear", duration: 4, repeat: Infinity }}
           style={{
             background: 'conic-gradient(from -90deg, rgba(34, 197, 94, 0) 0deg, rgba(34, 197, 94, 0) 260deg, rgba(34, 197, 94, 0.1) 320deg, rgba(34, 197, 94, 0.4) 360deg)',
           }}
        />
        
        {/* Sweep Line */}
        <motion.div
          className="absolute w-1/2 h-[2px] left-1/2 top-1/2 origin-left bg-gradient-to-r from-[#22C55E] to-transparent shadow-[0_0_15px_#22C55E]"
          animate={{ rotate: 360 }}
          transition={{ ease: "linear", duration: 4, repeat: Infinity }}
        />

        {/* Center Node (User) */}
        <div className="absolute z-20 w-3 h-3 rounded-full bg-[#22C55E] shadow-[0_0_15px_#22C55E] flex items-center justify-center">
            <motion.div
               className="absolute inset-0 rounded-full border border-[#22C55E]"
               animate={{ scale: [1, 2.5], opacity: [1, 0] }}
               transition={{ repeat: Infinity, duration: 2 }}
            />
        </div>

        {/* Nodes */}
        <AnimatePresence>
          {nodes
            .filter((node) => {
              if (node.status === 'emergency') return true; // Always show emergency
              // Map 'out-of-range' to 'offline' context for filtering
              if (node.status === 'out-of-range') return activeFilters['offline'];
              return activeFilters[node.status as keyof typeof activeFilters] ?? true;
            })
            .map((node) => (
            <motion.div
              key={node.id}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              className={cn(
                "absolute w-4 h-4 rounded-full flex items-center justify-center transition-all duration-300",
                getStatusColor(node.status)
              )}
              style={{
                left: `${50 + node.x * 45}%`,
                top: `${50 + node.y * 45}%`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              {getStatusIcon(node.status)}
              {node.status === 'emergency' && (
                <motion.div
                  className="absolute inset-0 rounded-full bg-red-500"
                  animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                />
              )}
              {node.status === 'low-battery' && (
                <motion.div
                  className="absolute inset-0 rounded-full bg-yellow-500"
                  animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                />
              )}
              {node.status === 'relaying' && (
                <motion.div
                  className="absolute inset-[-4px] rounded-full border border-dashed border-purple-400"
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
                />
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      
      {/* Legend / Filters */}
      <div className="absolute bottom-5 left-5 flex flex-col gap-1.5 bg-background/60 p-2.5 rounded-lg border border-black/5 dark:border-white/5 backdrop-blur-sm z-20">
        <button 
          onClick={() => toggleFilter('active')}
          className={cn("flex items-center gap-2 transition-opacity hover:opacity-80", !activeFilters.active && "opacity-30")}
        >
          <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_5px_theme(colors.blue.500)]" />
          <span className="text-[9px] font-bold tracking-widest text-muted-foreground uppercase">Active</span>
        </button>
        <button 
          onClick={() => toggleFilter('relaying')}
          className={cn("flex items-center gap-2 transition-opacity hover:opacity-80", !activeFilters.relaying && "opacity-30")}
        >
          <div className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_5px_theme(colors.purple.500)]" />
          <span className="text-[9px] font-bold tracking-widest text-muted-foreground uppercase">Relaying</span>
        </button>
        <button 
          onClick={() => toggleFilter('low-battery')}
          className={cn("flex items-center gap-2 transition-opacity hover:opacity-80", !activeFilters['low-battery'] && "opacity-30")}
        >
          <div className="w-2 h-2 rounded-full bg-yellow-500 shadow-[0_0_5px_theme(colors.yellow.500)]" />
          <span className="text-[9px] font-bold tracking-widest text-muted-foreground uppercase">Low Bat</span>
        </button>
        <button 
          onClick={() => toggleFilter('offline')}
          className={cn("flex items-center gap-2 transition-opacity hover:opacity-80", !activeFilters.offline && "opacity-30")}
        >
          <div className="w-2 h-2 rounded-full bg-zinc-600" />
          <span className="text-[9px] font-bold tracking-widest text-muted-foreground uppercase">Offline</span>
        </button>
      </div>

      <div className="absolute bottom-5 right-5 text-right bg-background/60 p-2.5 rounded-lg border border-black/5 dark:border-white/5 backdrop-blur-sm pointer-events-none z-20">
        <span className="text-[10px] font-bold text-muted-foreground tracking-[0.2em] uppercase leading-none block mb-1">MESH STATUS</span>
        <div className="text-[#22C55E] font-mono text-sm leading-none flex items-center gap-1.5 justify-end mt-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse shadow-[0_0_5px_#22C55E]" />
          ENCRYPTED
        </div>
      </div>
    </div>
  );
});
