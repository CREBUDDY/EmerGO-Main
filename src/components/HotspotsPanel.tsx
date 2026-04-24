import React, { useState, useEffect } from 'react';
import { subscribeNearbyHotspots, Hotspot, HotspotType } from '../services/hotspotService';
import { Hospital, ShieldAlert, Fuel, Search, MapPin, Beaker, Navigation } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

interface HotspotsPanelProps {
  userLatitude: number | null;
  userLongitude: number | null;
}

export const HotspotsPanel: React.FC<HotspotsPanelProps> = ({ userLatitude, userLongitude }) => {
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [filter, setFilter] = useState<HotspotType | "all">("all");
  const [loading, setLoading] = useState(false);
  const [demoMode, setDemoMode] = useState(true); // Default to demo mode for presentation

  useEffect(() => {
    if (!userLatitude || !userLongitude) return;

    if (demoMode) {
      setLoading(true);
      
      const mocks: Hotspot[] = [
        { id: "demo-1", name: "City Care Hospital", type: "hospital", latitude: userLatitude + 0.005, longitude: userLongitude + 0.005, address: "123 Health Ave" },
        { id: "demo-2", name: "Central Police Station", type: "police", latitude: userLatitude - 0.006, longitude: userLongitude + 0.004, address: "45 Law St" },
        { id: "demo-3", name: "Highway Fuel Station", type: "petrol pump", latitude: userLatitude + 0.008, longitude: userLongitude - 0.005, address: "99 Transit Rd" },
        { id: "demo-4", name: "General Hospital", type: "hospital", latitude: userLatitude - 0.010, longitude: userLongitude - 0.010, address: "100 Medical Blvd" },
      ];
      
      const calculatedMocks = mocks.map(m => {
        const distance = Math.sqrt(
          Math.pow(m.latitude - userLatitude, 2) + Math.pow(m.longitude - userLongitude, 2)
        ) * 111;
        return { ...m, distance };
      }).filter(m => {
         const matchesFilter = filter === 'all' || m.type === filter;
         const inRange = m.distance <= 2;
         return matchesFilter && inRange;
      }).sort((a, b) => (a.distance || 0) - (b.distance || 0));

      setTimeout(() => {
         setHotspots(calculatedMocks);
         setLoading(false);
      }, 500);

      return;
    }

    setLoading(true);
    const unsubscribe = subscribeNearbyHotspots(userLatitude, userLongitude, 2, filter, (data) => {
      setHotspots(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userLatitude, userLongitude, filter, demoMode]);

  const getIcon = (type: HotspotType) => {
    switch (type) {
      case 'hospital': return <Hospital className="w-5 h-5 text-red-400" />;
      case 'police': return <ShieldAlert className="w-5 h-5 text-blue-400" />;
      case 'petrol pump': return <Fuel className="w-5 h-5 text-yellow-400" />;
    }
  };

  const getBg = (type: HotspotType) => {
    switch (type) {
      case 'hospital': return "bg-red-500/10 border-red-500/20";
      case 'police': return "bg-blue-500/10 border-blue-500/20";
      case 'petrol pump': return "bg-yellow-500/10 border-yellow-500/20";
    }
  };

  if (!userLatitude || !userLongitude) {
    return null;
  }

  return (
    <div className="bg-[#1C1DF] rounded-xl overflow-hidden shadow-2xl relative border border-[#2A2C32] mt-4">
      {/* Decorative Top Edge */}
      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[#8E9299]/30 to-transparent"></div>
      
      <div className="p-4 border-b border-[#2A2C32]/50 flex justify-between items-center bg-[#151619]">
         <div>
            <h1 className="text-sm font-bold text-white tracking-tight uppercase flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#8E9299]" />
              NEARBY HOTSPOTS
            </h1>
            <span className="status-label block !text-[10px] mt-1">
               WITHIN 2KM RADIUS • LIVE: {userLatitude.toFixed(4)}, {userLongitude.toFixed(4)}
            </span>
         </div>
         <div className="flex items-center gap-2">
             <Beaker className={`w-4 h-4 ${demoMode ? 'text-green-500' : 'text-[#8E9299]'}`} />
             <span className="text-[10px] font-bold text-[#8E9299] tracking-widest uppercase">DEMO</span>
             <Switch checked={demoMode} onCheckedChange={setDemoMode} className="scale-75" />
         </div>
      </div>

      <div className="p-4 bg-[#1C1D1F]">
        {/* Filters */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-none">
          {["all", "hospital", "police", "petrol pump"].map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t as any)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase transition-colors whitespace-nowrap ${
                filter === t 
                  ? "bg-white text-black" 
                  : "bg-[#2A2C32] text-[#8E9299] hover:text-white"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex flex-col gap-3 max-h-[300px] overflow-y-auto pr-1">
          {loading ? (
            <div className="text-center py-6 text-xs text-[#8E9299] flex flex-col items-center">
              <Search className="w-5 h-5 mb-2 animate-spin opacity-50" />
              SCANNING AREA...
            </div>
          ) : hotspots.length === 0 ? (
            <div className="text-center py-6 text-xs text-[#8E9299]">
              NO HOTSPOTS DETECTED IN RANGE
            </div>
          ) : (
            hotspots.map(h => (
              <div key={h.id} className={`p-3 rounded-lg border ${getBg(h.type)} flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[#151619] rounded-lg shrink-0">
                    {getIcon(h.type)}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white uppercase">{h.name}</div>
                    <div className="text-[10px] text-[#8E9299] uppercase">{h.address}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between sm:flex-col sm:items-end sm:justify-center shrink-0">
                  <div className="text-right flex-1 sm:flex-none">
                    <div className="text-[10px] font-mono text-white tracking-wider">
                      {h.distance ? h.distance.toFixed(2) : "0.00"} KM
                    </div>
                    <div className="text-[8px] text-[#8E9299] uppercase mt-0.5 tracking-widest">AWAY</div>
                  </div>
                  <a 
                    href={`https://www.google.com/maps/dir/?api=1&origin=${userLatitude},${userLongitude}&destination=${h.latitude},${h.longitude}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="ml-3 sm:ml-0 sm:mt-2 p-1.5 sm:px-3 sm:py-1.5 bg-[#2A2C32] hover:bg-white hover:text-black hover:border-white transition-colors border border-[#3A3C42] rounded-md flex items-center justify-center gap-2 group"
                  >
                     <Navigation className="w-3 h-3 group-hover:text-black text-white" />
                     <span className="text-[9px] font-bold uppercase hidden sm:block">Track</span>
                  </a>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
