import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { Compass } from 'lucide-react';

export const LiveCompass = ({ className }: { className?: string }) => {
  const [heading, setHeading] = useState<number | null>(null);

  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      let h = null;
      // @ts-ignore
      if (typeof e.webkitCompassHeading !== 'undefined') {
         // @ts-ignore
         h = e.webkitCompassHeading;
      } else if (e.alpha !== null) {
         h = 360 - e.alpha; // Fallback, standard rotation
      }
      if (h !== null) {
         setHeading(h);
      }
    };

    const handleAbsolute = (e: DeviceOrientationEvent) => {
       if (e.alpha !== null) {
          setHeading(360 - e.alpha);
       }
    };

    if ('ondeviceorientationabsolute' in window) {
       window.addEventListener('deviceorientationabsolute', handleAbsolute as any);
    } else {
       window.addEventListener('deviceorientation', handleOrientation as any);
    }

    return () => {
       if ('ondeviceorientationabsolute' in window) {
           window.removeEventListener('deviceorientationabsolute', handleAbsolute as any);
       } else {
           window.removeEventListener('deviceorientation', handleOrientation as any);
       }
    };
  }, []);

  const requestPermission = async () => {
    // @ts-ignore
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
       try {
           // @ts-ignore
           await DeviceOrientationEvent.requestPermission();
       } catch(e) { console.error(e) }
    }
  };

  const rotation = heading !== null ? -heading : 0;

  return (
    <div 
      onClick={requestPermission}
      className={cn(
        "w-12 h-12 rounded-full bg-[#1A1C20]/90 backdrop-blur border border-[#2A2C32] flex items-center justify-center relative shadow-lg cursor-pointer flex-shrink-0 z-[10]",
        className
      )}
      title="Live Compass - Click to enable sensors on iOS"
    >
      {/* Inner ring */}
      <div className="absolute inset-1 rounded-full border border-white/5" />
      
      <motion.div 
        className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
        animate={{ rotate: rotation }}
        transition={{ type: "spring", damping: 30, stiffness: 100 }}
      >
         <div className="absolute top-1 text-[8px] font-bold text-red-500">N</div>
         <div className="absolute right-1 text-[8px] font-bold text-[#5A5C62]">E</div>
         <div className="absolute bottom-1 text-[8px] font-bold text-[#5A5C62]">S</div>
         <div className="absolute left-1 text-[8px] font-bold text-[#5A5C62]">W</div>
         
         {/* Center Needle */}
         <div className="relative flex flex-col items-center justify-center mt-0.5">
           <div className="w-0 h-0 border-l-[3px] border-r-[3px] border-b-[10px] border-l-transparent border-r-transparent border-b-red-500 origin-bottom" />
           <div className="w-0 h-0 border-l-[3px] border-r-[3px] border-t-[10px] border-l-transparent border-r-transparent border-t-[#8E9299] origin-top" />
           <div className="absolute w-[3px] h-[3px] bg-black rounded-full z-10" />
         </div>
      </motion.div>
    </div>
  );
};
