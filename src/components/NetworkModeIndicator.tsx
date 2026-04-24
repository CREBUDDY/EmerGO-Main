import React from 'react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { Wifi, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';

export const NetworkModeIndicator: React.FC = () => {
  const { isOnline } = useNetworkStatus();

  return (
    <div 
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase transition-all duration-300 whitespace-nowrap",
        isOnline 
          ? "bg-green-500/10 text-green-500 border border-green-500/30" 
          : "bg-yellow-500/10 text-yellow-500 border border-yellow-500/50 cursor-pointer animate-pulse"
      )}
      title={isOnline ? "System Online" : "System Offline"}
    >
      {isOnline ? (
        <>
          <Wifi className="w-3 h-3" />
          <span>AUTO: ONLINE</span>
        </>
      ) : (
        <>
          <WifiOff className="w-3 h-3" />
          <span>AUTO: OFFLINE</span>
        </>
      )}
    </div>
  );
};
