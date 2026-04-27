import React, { useState, useEffect } from 'react';
import { fetchRealHotspots, Hotspot, HotspotType } from '../services/hotspotService';
import { Hospital, ShieldAlert, Fuel, Search, MapPin, Navigation } from 'lucide-react';

interface HotspotsPanelProps {
  userLatitude: number | null;
  userLongitude: number | null;
}

export const HotspotsPanel: React.FC<HotspotsPanelProps> = ({ userLatitude, userLongitude }) => {
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [filter, setFilter] = useState<HotspotType | "all">("all");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userLatitude || !userLongitude) return;

    let isMounted = true;
    setLoading(true);
    
    fetchRealHotspots(userLatitude, userLongitude, 2, filter)
      .then(data => {
        if (isMounted) {
           setHotspots(data);
           setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error(err);
          setLoading(false);
        }
      });

    return () => { isMounted = false; };
  }, [userLatitude, userLongitude, filter]);

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
    <div className="bg-card/90 dark:bg-black/60 backdrop-blur-md rounded-xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.4)] relative border border-black/10 dark:border-white/10 mt-4">
      {/* Decorative Top Edge */}
      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
      
      <div className="p-4 border-b border-black/10 dark:border-white/10 flex justify-between items-center bg-transparent">
         <div>
            <h1 className="text-sm font-bold text-foreground tracking-tight uppercase flex items-center gap-2">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              NEARBY HOTSPOTS
            </h1>
            <span className="status-label block !text-[10px] mt-1">
               WITHIN 2KM RADIUS • LIVE: {userLatitude.toFixed(4)}, {userLongitude.toFixed(4)}
            </span>
         </div>
      </div>

      <div className="p-4 bg-transparent">
        {/* Filters */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-none">
          {["all", "hospital", "police", "petrol pump"].map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t as any)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase transition-colors whitespace-nowrap ${
                filter === t 
                  ? "bg-foreground text-background" 
                  : "bg-muted dark:bg-muted/80 text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex flex-col gap-3 max-h-[300px] overflow-y-auto pr-1">
          {loading ? (
            <div className="text-center py-6 text-xs text-muted-foreground flex flex-col items-center">
              <Search className="w-5 h-5 mb-2 animate-spin opacity-50" />
              SCANNING AREA...
            </div>
          ) : hotspots.length === 0 ? (
            <div className="text-center py-6 text-xs text-muted-foreground">
              NO HOTSPOTS DETECTED IN RANGE
            </div>
          ) : (
            hotspots.map(h => (
              <div key={h.id} className={`p-3 rounded-lg border ${getBg(h.type)} flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-card rounded-lg shrink-0">
                    {getIcon(h.type)}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-foreground uppercase">{h.name}</div>
                    <div className="text-[10px] text-muted-foreground uppercase">{h.address}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between sm:flex-col sm:items-end sm:justify-center shrink-0">
                  <div className="text-right flex-1 sm:flex-none">
                    <div className="text-[10px] font-mono text-foreground tracking-wider">
                      {h.distance ? h.distance.toFixed(2) : "0.00"} KM
                    </div>
                    <div className="text-[8px] text-muted-foreground uppercase mt-0.5 tracking-widest">AWAY</div>
                  </div>
                  <a 
                    href={`https://www.google.com/maps/dir/?api=1&origin=${userLatitude},${userLongitude}&destination=${h.latitude},${h.longitude}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="ml-3 sm:ml-0 sm:mt-2 p-1.5 sm:px-3 sm:py-1.5 bg-muted dark:bg-muted/80 hover:bg-foreground hover:text-primary-foreground hover:border-primary shrink-0 transition-colors border border-border rounded-md flex items-center justify-center gap-2 group"
                  >
                     <Navigation className="w-3 h-3 group-hover:text-primary-foreground text-foreground" />
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

