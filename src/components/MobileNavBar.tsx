import React, { useState, useEffect } from 'react';
import { NetworkModeIndicator } from './NetworkModeIndicator';

export const MobileNavBar: React.FC = () => {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="sm:hidden fixed bottom-5 left-1/2 -translate-x-1/2 z-50 bg-[#151619] border border-[#2A2C32] rounded-full px-4 py-2 flex items-center gap-4 shadow-xl hardware-card backdrop-blur-md bg-opacity-90">
       <NetworkModeIndicator />
       <div className="w-[1px] h-4 bg-[#2A2C32]"></div>
       <span className="font-mono text-[10px] text-[#8E9299] tracking-wider whitespace-nowrap">
         {currentTime.toLocaleString('en-US', {
           hour: '2-digit', minute: '2-digit',
           hour12: true
         }).toUpperCase()}
       </span>
    </div>
  );
};
