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
  const [angle, setAngle] = useState(0);
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
          const { x, y, distance, isOutOfRange } = mapCoordsToRadar(data.latitude, data.longitude, centerLat, centerLng);
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

    const interval = setInterval(() => {
      setAngle((prev) => (prev + 10) % 360);
    }, 100);

    return () => {
      unsubscribeNodes();
      unsubscribeSos();
      clearInterval(interval);
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
      case 'low-battery': return <BatteryWarning className="w-2.5 h-2.5 text-white" />;
      case 'relaying': return <Radio className="w-2.5 h-2.5 text-white" />;
      case 'emergency': return <AlertTriangle className="w-2.5 h-2.5 text-white" />;
      case 'offline':
      case 'out-of-range': return <WifiOff className="w-2.5 h-2.5 text-white" />;
      default: return null;
    }
  };

  return (
    <div className="relative w-full aspect-square hardware-card p-4 flex flex-col items-center justify-center">
      <div className="absolute top-4 left-4 z-10 text-left">
        <span className="status-label">Nearby Nodes</span>
        <div className="data-value">{nodes.length} Detected</div>
      </div>

      <div className="absolute top-4 right-4 z-10">
        <LiveCompass />
      </div>

      <div className="relative w-full h-full border border-[#2A2C32] rounded-full flex items-center justify-center overflow-hidden">
        {/* Radar Rings */}
        <div className="absolute w-3/4 h-3/4 border border-[#2A2C32] rounded-full" />
        <div className="absolute w-1/2 h-1/2 border border-[#2A2C32] rounded-full" />
        <div className="absolute w-1/4 h-1/4 border border-[#2A2C32] rounded-full" />
        
        {/* Crosshair */}
        <div className="absolute w-full h-[1px] bg-[#2A2C32]" />
        <div className="absolute h-full w-[1px] bg-[#2A2C32]" />

        {/* Direction Guides on Radar Edge */}
        <div className="absolute w-full h-full flex flex-col justify-between items-center py-1.5 opacity-60 pointer-events-none text-[10px] font-bold font-mono tracking-widest text-[#8E9299]">
          <span className="text-red-500/90 z-20">N</span>
          <span className="z-20">S</span>
        </div>
        <div className="absolute w-full h-full flex justify-between items-center px-2 opacity-60 pointer-events-none text-[10px] font-bold font-mono tracking-widest text-[#8E9299]">
          <span className="z-20">W</span>
          <span className="z-20">E</span>
        </div>

        {/* Sweep */}
        <motion.div
          className="absolute w-1/2 h-1/2 origin-bottom-right"
          style={{
            top: 0,
            left: 0,
            background: 'linear-gradient(45deg, rgba(255, 68, 68, 0.1) 0%, transparent 100%)',
            rotate: angle,
          }}
        />

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
                left: `${50 + node.x * 40}%`,
                top: `${50 + node.y * 40}%`,
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
      <div className="absolute bottom-4 left-4 flex flex-col gap-1">
        <button 
          onClick={() => toggleFilter('active')}
          className={cn("flex items-center gap-2 transition-opacity hover:opacity-80 disabled:cursor-not-allowed", !activeFilters.active && "opacity-30")}
        >
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="status-label text-[8px] uppercase">Active</span>
        </button>
        <button 
          onClick={() => toggleFilter('relaying')}
          className={cn("flex items-center gap-2 transition-opacity hover:opacity-80 disabled:cursor-not-allowed", !activeFilters.relaying && "opacity-30")}
        >
          <div className="w-2 h-2 rounded-full bg-purple-500" />
          <span className="status-label text-[8px] uppercase">Relaying</span>
        </button>
        <button 
          onClick={() => toggleFilter('low-battery')}
          className={cn("flex items-center gap-2 transition-opacity hover:opacity-80 disabled:cursor-not-allowed", !activeFilters['low-battery'] && "opacity-30")}
        >
          <div className="w-2 h-2 rounded-full bg-yellow-500" />
          <span className="status-label text-[8px] uppercase">Low Bat</span>
        </button>
        <button 
          onClick={() => toggleFilter('offline')}
          className={cn("flex items-center gap-2 transition-opacity hover:opacity-80 disabled:cursor-not-allowed", !activeFilters.offline && "opacity-30")}
        >
          <div className="w-2 h-2 rounded-full bg-zinc-600 opacity-60" />
          <span className="status-label text-[8px] uppercase">Offline</span>
        </button>
      </div>

      <div className="absolute bottom-4 right-4 text-right">
        <span className="status-label">Mesh Status</span>
        <div className="data-value text-green-500">ENCRYPTED</div>
      </div>
    </div>
  );
});
