import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { db, auth } from '@/src/lib/firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { BatteryFull, BatteryMedium, BatteryLow, BatteryWarning, BatteryCharging, Network, Wifi, MapPin } from 'lucide-react';

export const SystemStatus = React.memo(() => {
  const [batteryLevel, setBatteryLevel] = useState<string>("UNKNOWN");
  const [batteryPercent, setBatteryPercent] = useState<number | null>(null);
  const [batteryStatus, setBatteryStatus] = useState<string>("CHECKING...");
  const [networkStatus, setNetworkStatus] = useState<string>("CHECKING...");
  const [networkType, setNetworkType] = useState<string>("UNKNOWN");
  const [locationStatus, setLocationStatus] = useState<string>("SEARCHING...");
  const [locationSub, setLocationSub] = useState<string>("AWAITING LOCK");
  const [activeUsers, setActiveUsers] = useState<number>(0);

  useEffect(() => {
    // 1. Battery Status
    const updateBattery = async () => {
      if ('getBattery' in navigator) {
        try {
          const battery: any = await (navigator as any).getBattery();
          
          const updateLevel = () => {
            const percent = Math.round(battery.level * 100);
            setBatteryPercent(percent);
            setBatteryLevel(`${percent}%`);
            
            if (battery.charging) {
              setBatteryStatus("CHARGING");
            } else if (percent <= 15) {
              setBatteryStatus("CRITICAL");
            } else if (percent <= 30) {
              setBatteryStatus("LOW");
            } else if (percent <= 80) {
              setBatteryStatus("GOOD");
            } else {
              setBatteryStatus("OPTIMIZED");
            }
          };
          
          updateLevel();
          battery.addEventListener('levelchange', updateLevel);
          battery.addEventListener('chargingchange', updateLevel);
        } catch (e) {
          setBatteryLevel("N/A");
          setBatteryStatus("UNSUPPORTED");
        }
      } else {
        setBatteryLevel("N/A");
        setBatteryStatus("UNSUPPORTED");
      }
    };
    updateBattery();

    // 2. Network Status (GSM/Wifi)
    const updateNetwork = () => {
      if (navigator.onLine) {
        setNetworkStatus("ONLINE");
        const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
        if (conn) {
          setNetworkType(conn.effectiveType ? conn.effectiveType.toUpperCase() : "WIFI/CELL");
        } else {
          setNetworkType("CONNECTED");
        }
      } else {
        setNetworkStatus("OFFLINE");
        setNetworkType("NO LINK");
      }
    };
    updateNetwork();
    window.addEventListener('online', updateNetwork);
    window.addEventListener('offline', updateNetwork);

    // 3. Location Status
    let watchId: number;
    if ("geolocation" in navigator) {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          setLocationStatus("LOCKED");
          setLocationSub(`${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`);
        },
        () => {
          setLocationStatus("DENIED/ERROR");
          setLocationSub("CHECK PERMISSIONS");
        },
        { enableHighAccuracy: true }
      );
    } else {
      setLocationStatus("UNAVAILABLE");
      setLocationSub("NO GPS MODULE");
    }

    let unsubscribeNodes: () => void = () => {};
    // 4. Online Users
    if (auth.currentUser) {
       const fiveMinsAgo = Date.now() - 5 * 60 * 1000;
        const q = query(collection(db, 'nodes'), where('lastSeen', '>=', new Date(fiveMinsAgo)));
       unsubscribeNodes = onSnapshot(q, (snap) => {
          setActiveUsers(snap.size > 0 ? snap.size - 1 : 0); // exclude self
       });
    }

    return () => {
      window.removeEventListener('online', updateNetwork);
      window.removeEventListener('offline', updateNetwork);
      if (watchId) navigator.geolocation.clearWatch(watchId);
      unsubscribeNodes();
    };
  }, []);

  const getBatteryIcon = () => {
    if (batteryStatus === "CHARGING") return <BatteryCharging className="w-[18px] h-[18px] text-blue-500" />;
    if (batteryPercent === null) return <BatteryFull className="w-[18px] h-[18px] text-gray-500" />;
    if (batteryPercent <= 15) return <BatteryWarning className="w-[18px] h-[18px] text-red-500 animate-pulse" />;
    if (batteryPercent <= 30) return <BatteryLow className="w-[18px] h-[18px] text-yellow-500" />;
    if (batteryPercent <= 80) return <BatteryMedium className="w-[18px] h-[18px] text-green-400" />;
    return <BatteryFull className="w-[18px] h-[18px] text-green-500" />;
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatusItem 
        icon={getBatteryIcon()} 
        label="BATTERY" 
        value={batteryLevel} 
        sub={batteryStatus}
      />
      <StatusItem 
        icon={<Network className={cn("w-[18px] h-[18px]", activeUsers > 0 ? "text-blue-500" : "text-gray-500")} />} 
        label="NEARBY NODES" 
        value={activeUsers > 0 ? "DETECTED" : "SEARCHING"} 
        sub={`${activeUsers} DEVICES`}
      />
      <StatusItem 
        icon={<Wifi className={cn("w-[18px] h-[18px]", networkStatus === "ONLINE" ? "text-green-500" : "text-orange-500")} />} 
        label="NETWORK" 
        value={networkStatus} 
        sub={networkType}
      />
      <StatusItem 
        icon={<MapPin className={cn("w-[18px] h-[18px]", locationStatus === "LOCKED" ? "text-red-500" : "text-gray-500")} />} 
        label="LOCATION" 
        value={locationStatus} 
        sub={locationSub}
      />
    </div>
  );
});

const StatusItem = ({ icon, label, value, sub }: { icon: React.ReactNode, label: string, value: string, sub: string }) => (
  <div className="hardware-card p-4 flex flex-col gap-2">
    <div className="flex items-center justify-between">
      {icon}
      <span className="status-label">{label}</span>
    </div>
    <div className="flex flex-col">
      <span className="text-xl font-heading text-foreground leading-tight uppercase tracking-wide">{value}</span>
      <span className="text-[10px] font-sans text-muted-foreground/60 truncate tracking-wide" title={sub}>{sub}</span>
    </div>
  </div>
);
