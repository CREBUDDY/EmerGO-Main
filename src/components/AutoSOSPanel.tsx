import React, { useState } from 'react';
import { useAutoSOS } from '../hooks/useAutoSOS';
import { useThresholdPopup } from '../hooks/useThresholdPopup';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';

export const AutoSOSPanel = React.memo(() => {
  const [enabled, setEnabled] = useState(false);

  const { scores, totalScore, cancelTrigger, enabled: autoEnabled, threshold } = useAutoSOS(enabled, 50);

  const { showPopup, timer, handleConfirmOk } = useThresholdPopup({
    riskScore: totalScore,
    threshold: 50,
    onConfirm: cancelTrigger,
    enabled: autoEnabled,
    scores: scores
  });

  let statusText = autoEnabled ? "MONITORING" : "STANDBY";
  let statusColor = autoEnabled ? "text-green-500" : "text-[#8E9299]";
  let statusBg = autoEnabled ? "bg-green-500/10 border-green-500/30" : "bg-[#2A2C32] border-[#3A3C42]";

  if (showPopup) {
    statusText = "TRIGGERING SOS in " + timer + "s";
    statusColor = "text-red-500";
    statusBg = "bg-red-500/10 border-red-500/30 animate-pulse";
  } else if (totalScore >= threshold && autoEnabled) {
    statusText = "ALERT";
    statusColor = "text-red-500";
    statusBg = "bg-red-500/10 border-red-500/30";
  }

  let gaugeText = enabled ? totalScore.toString() : "0";
  let gaugeSubText = "NONE";
  let gaugeColor = "#8E9299"; // default
  let gaugeLevel = enabled ? totalScore : 0;

  if (enabled) {
    if (totalScore >= threshold) {
      gaugeSubText = "HIGH";
      gaugeColor = "#EF4444";
    } else if (totalScore >= threshold * 0.5) {
      gaugeSubText = "MEDIUM";
      gaugeColor = "#F59E0B";
    } else if (totalScore > 0) {
      gaugeSubText = "LOW";
      gaugeColor = "#22C55E";
    }
  }

  const renderProgressBar = (label: string, value: number, max: number) => {
    const segments = 10;
    const filledSegments = Math.round((value / max) * segments);
    
    return (
      <div className="flex items-center justify-between py-1.5">
        <span className="text-[10px] font-bold tracking-widest text-[#8E9299] w-28 uppercase">{label}</span>
        <div className="flex gap-[3px] flex-1 mr-4">
          {Array.from({ length: segments }).map((_, i) => (
            <div 
              key={i} 
              className={cn(
                "h-1.5 flex-1 rounded-[1px]",
                enabled && i < filledSegments ? "bg-opacity-100" : "bg-[#2A2C32]",
                enabled && label === "IMPACT" && i < filledSegments ? "bg-[#EF4444]" : "",
                enabled && label === "VOICE" && i < filledSegments ? "bg-[#EF4444]" : "",
                enabled && label === "ORIENTATION" && i < filledSegments ? "bg-[#F59E0B]" : "",
                enabled && (label === "MOVEMENT" || label === "INACTIVITY" || label === "FALL") && i < filledSegments ? "bg-[#F59E0B]" : ""
              )}
            />
          ))}
        </div>
        <span className="text-white font-mono text-sm w-4 text-right">{enabled ? value : 0}</span>
      </div>
    );
  };

  // Circular gauge calculations
  const radius = 56;
  const circumference = Math.PI * radius; // Semi-circle
  const strokeDashoffset = Math.max(0, circumference - (gaugeLevel / 100) * circumference);

  return (
    <div className="bg-[#0A0A0B] border border-[#2A2C32] rounded-2xl flex flex-col h-full overflow-hidden w-full relative hardware-card min-h-[500px]">
      
      {/* Header section inside panel - similar to image */}
      <div className="p-4 flex justify-between items-start z-10 border-b border-[#2A2C32]/50">
         <div>
            <h1 className="text-2xl font-bold text-white tracking-tight uppercase leading-none mb-1">
              AUTO SOS
            </h1>
            <span className="text-[9px] font-bold text-[#8E9299] tracking-widest uppercase">
              AI EMERGENCY DETECTION
            </span>
         </div>
         <div className={cn("px-2.5 py-1.5 rounded border text-[10px] font-bold tracking-widest flex items-center gap-1.5", statusColor, statusBg)}>
            <div className={cn("w-1.5 h-1.5 rounded-full", enabled ? (totalScore >= threshold ? "bg-red-500 animate-pulse" : "bg-green-500") : "bg-[#8E9299]")} />
            {statusText}
         </div>
      </div>

      {/* Main Content Area */}
      <div className="p-4 flex flex-col gap-4 overflow-y-auto custom-scrollbar flex-1 z-10 w-full">
         
         {/* Gauge Container */}
         <div className="flex justify-center items-center py-6 relative">
            <div className="relative w-[180px] h-[90px] overflow-hidden">
               {/* Background Track Arc */}
               <svg className="absolute top-0 left-0" width="180" height="90" viewBox="0 0 160 80">
                  <path 
                     d="M 24 76 A 56 56 0 0 1 136 76" 
                     fill="none" 
                     stroke="#2A2C32" 
                     strokeWidth="12" 
                     strokeLinecap="butt" 
                     strokeDasharray="4 6"
                  />
               </svg>
               {/* Foreground Arc */}
               <svg className="absolute top-0 left-0" width="180" height="90" viewBox="0 0 160 80" style={{ transform: 'scale(1)' }}>
                  <path 
                     d="M 24 76 A 56 56 0 0 1 136 76" 
                     fill="none" 
                     stroke={gaugeColor} 
                     strokeWidth="12" 
                     strokeLinecap="butt"
                     strokeDasharray={`${circumference} ${circumference}`}
                     strokeDashoffset={enabled ? strokeDashoffset : circumference}
                     style={{ transition: 'stroke-dashoffset 0.5s ease-out, stroke 0.5s ease-out' }}
                  />
               </svg>
               
               <div className="absolute top-[25px] left-0 w-full flex flex-col items-center justify-center">
                  <span className="text-[40px] text-white font-bold leading-none" style={{ color: gaugeColor }}>
                    {gaugeText}
                  </span>
                  <span className="text-[10px] font-bold tracking-widest mt-1 uppercase" style={{ color: gaugeColor }}>
                    {gaugeSubText}
                  </span>
               </div>
            </div>
         </div>

         {/* Protection Switcher */}
         <div className="bg-[#151619] border border-[#2A2C32] rounded-xl p-4 flex justify-between items-center">
            <div className="flex flex-col gap-1">
               <span className="text-[10px] font-bold text-[#8E9299] tracking-widest uppercase leading-none">PROTECTION</span>
               <span className="text-white text-sm leading-none">{enabled ? 'Monitoring Active' : 'Monitoring Off'}</span>
            </div>
            <Switch 
               checked={enabled} 
               onCheckedChange={setEnabled}
               className="data-[state=checked]:bg-[#22C55E]"
            />
         </div>

         {showPopup && (
           <div className="bg-red-500/20 border border-red-500 rounded-xl p-6 flex flex-col items-center justify-center gap-4 text-center mt-2 mb-2">
              <h2 className="text-xl font-bold text-white uppercase tracking-wider">Are you ok?</h2>
              <p className="text-white text-sm">Emergency trigger detected (Score: {totalScore}). SOS will be sent in <span className="font-bold text-red-400">{timer}</span> seconds.</p>
              <Button onClick={handleConfirmOk} className="w-full bg-green-600 hover:bg-green-500 text-white font-bold tracking-widest mt-2 uppercase">
                 Yes, I am ok
              </Button>
           </div>
         )}

         {/* Risk Analysis Card */}
         <div className="bg-[#151619] border border-[#2A2C32] rounded-xl p-4 flex flex-col">
            <span className="text-[10px] font-bold text-[#8E9299] tracking-widest uppercase mb-4 leading-none">RISK ANALYSIS</span>
            
            <div className="flex flex-col gap-1.5">
               {renderProgressBar('VOICE', scores.voiceScore, 30)}
               {renderProgressBar('FALL', scores.fallScore, 40)}
               {renderProgressBar('MOVEMENT', scores.movementScore, 20)}
               {renderProgressBar('INACTIVITY', scores.inactivityScore, 25)}
               {renderProgressBar('ORIENTATION', scores.orientationScore, 15)}
               {renderProgressBar('IMPACT', scores.impactScore, 15)}
            </div>

            <div className="w-full h-px bg-[#2A2C32] my-4"></div>
            
            <div className="flex justify-between items-center">
               <span className="text-[10px] font-bold text-[#8E9299] tracking-widest uppercase">TOTAL</span>
               <span className="text-white font-mono text-sm">{enabled ? totalScore : 0}/100</span>
            </div>
         </div>

      </div>
    </div>
  );
});
