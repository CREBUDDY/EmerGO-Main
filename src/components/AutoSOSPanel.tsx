import React, { useState, useEffect } from 'react';
import { useAutoSOS } from '../hooks/useAutoSOS';
import { useThresholdPopup } from '../hooks/useThresholdPopup';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Settings2 } from 'lucide-react';

export const AutoSOSPanel = React.memo(() => {
  const [enabled, setEnabled] = useState(false);
  const [userThreshold, setUserThreshold] = useState<number>(() => {
    const saved = localStorage.getItem('auto_sos_threshold');
    return saved ? parseInt(saved, 10) : 50;
  });
  const [showThresholdSettings, setShowThresholdSettings] = useState(false);

  useEffect(() => {
    localStorage.setItem('auto_sos_threshold', userThreshold.toString());
  }, [userThreshold]);

  const { scores, totalScore, cancelTrigger, enabled: autoEnabled, threshold } = useAutoSOS(enabled, userThreshold);

  const { showPopup, timer, handleConfirmOk } = useThresholdPopup({
    riskScore: totalScore,
    threshold: userThreshold,
    onConfirm: cancelTrigger,
    enabled: autoEnabled,
    scores: scores
  });

  let statusText = autoEnabled ? "MONITORING" : "STANDBY";
  let statusColor = autoEnabled ? "text-green-500" : "text-muted-foreground";
  let statusBg = autoEnabled ? "bg-green-500/10 border-green-500/30" : "bg-muted dark:bg-muted/80 border-border";

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
  
  // Create animated gradient string
  const activeGradient = "url(#gaugeGradient)";

  if (enabled) {
    if (totalScore >= threshold) {
      gaugeSubText = "CRITICAL";
      gaugeColor = "#EF4444";
    } else if (totalScore >= threshold * 0.7) {
      gaugeSubText = "HIGH";
      gaugeColor = "#F97316";
    } else if (totalScore >= threshold * 0.4) {
      gaugeSubText = "MEDIUM";
      gaugeColor = "#F59E0B";
    } else if (totalScore > 0) {
      gaugeSubText = "LOW";
      gaugeColor = "#22C55E";
    }
  }

  const renderProgressBar = (label: string, value: number, max: number) => {
    const segments = 12;
    const filledSegments = Math.round((value / max) * segments);
    
    let activeColorClass = "bg-[#22C55E] shadow-[0_0_8px_rgba(34,197,94,0.6)]";
    if (value > max * 0.7) {
        activeColorClass = "bg-[#EF4444] shadow-[0_0_8px_rgba(239,68,68,0.6)]";
    } else if (value > max * 0.3) {
        activeColorClass = "bg-[#F59E0B] shadow-[0_0_8px_rgba(245,158,11,0.6)]";
    }

    return (
      <div className="flex items-center justify-between py-2 group">
        <span className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground group-hover:text-muted-foreground transition-colors w-32 uppercase">{label}</span>
        <div className="flex gap-1 flex-1 mx-4">
          {Array.from({ length: segments }).map((_, i) => (
            <div 
              key={i} 
              className={cn(
                "h-1.5 flex-1 rounded-full transition-all duration-300",
                enabled && i < filledSegments 
                  ? activeColorClass 
                  : "bg-muted dark:bg-muted/80/40"
              )}
            />
          ))}
        </div>
        <span className="text-foreground font-mono text-xs w-6 text-right opacity-90">{enabled ? value.toString().padStart(2, '0') : '00'}</span>
      </div>
    );
  };

  // Circular gauge calculations
  const radius = 70;
  const circumference = Math.PI * radius; // Semi-circle
  const strokeDashoffset = Math.max(0, circumference - (gaugeLevel / 100) * circumference);

  return (
    <div className="bg-card/90 dark:bg-black/60 backdrop-blur-md border border-black/10 dark:border-white/10 rounded-2xl flex flex-col h-full overflow-hidden w-full relative shadow-[0_8px_30px_rgb(0,0,0,0.4)] min-h-[500px]">
      
      {/* Premium subtle background glow */}
      {enabled && (
        <div 
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[300px] h-[300px] rounded-full blur-[80px] opacity-20 pointer-events-none transition-colors duration-700"
          style={{ backgroundColor: gaugeColor }}
        />
      )}
      {/* Header section inside panel - similar to image */}
      <div className="p-4 flex justify-between items-start z-10 border-b border-black/5 dark:border-white/5">
         <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight uppercase leading-none mb-1">
              AUTO SOS
            </h1>
            <span className="text-[9px] font-bold text-muted-foreground tracking-widest uppercase">
              AI EMERGENCY DETECTION
            </span>
         </div>
         <div className="flex gap-2">
           <button 
             onClick={() => setShowThresholdSettings(!showThresholdSettings)}
             className={cn("p-1.5 rounded-lg border flex items-center justify-center transition-colors shadow-inner", showThresholdSettings ? "bg-black/5 dark:bg-white/10 border-black/20 dark:border-white/20 text-foreground" : "bg-black/10 dark:bg-black/40 border-black/5 dark:border-white/5 text-muted-foreground hover:text-foreground")}
             title="Adjust Threshold Sensitivity"
           >
             <Settings2 className="w-4 h-4" />
           </button>
           <div className={cn("px-2.5 py-1.5 rounded border text-[10px] font-bold tracking-widest flex items-center gap-1.5", statusColor, statusBg)}>
              <div className={cn("w-1.5 h-1.5 rounded-full", enabled ? (totalScore >= threshold ? "bg-red-500 animate-pulse" : "bg-green-500") : "bg-[#8E9299]")} />
              {statusText}
           </div>
         </div>
      </div>

      {showThresholdSettings && (
        <div className="bg-background/80 border-b border-black/5 dark:border-white/5 p-4 z-10 flex flex-col gap-3 shadow-inner">
          <div className="flex justify-between items-center text-xs">
             <span className="text-muted-foreground font-bold uppercase tracking-widest">Sensitivity Threshold</span>
             <span className="text-foreground font-mono">{userThreshold}/100</span>
          </div>
          <input 
            type="range" 
            min="10" 
            max="100" 
            value={userThreshold} 
            onChange={(e) => setUserThreshold(Number(e.target.value))} 
            className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-muted dark:bg-muted/80 accent-red-500 hover:accent-red-400 focus:outline-none"
          />
          <div className="flex gap-2 mt-2">
            <button onClick={() => setUserThreshold(50)} className={cn("flex-1 py-1.5 rounded text-[10px] uppercase font-bold tracking-wider transition-colors border", userThreshold === 50 ? "bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/40" : "bg-black/10 dark:bg-black/40 text-muted-foreground border-black/5 dark:border-white/5 hover:bg-black/5 dark:bg-white/5 hover:text-foreground")}>
              50 Light
            </button>
            <button onClick={() => setUserThreshold(70)} className={cn("flex-1 py-1.5 rounded text-[10px] uppercase font-bold tracking-wider transition-colors border", userThreshold === 70 ? "bg-yellow-500/20 text-yellow-600 dark:text-yellow-500 border-yellow-500/40" : "bg-black/10 dark:bg-black/40 text-muted-foreground border-black/5 dark:border-white/5 hover:bg-black/5 dark:bg-white/5 hover:text-foreground")}>
              70 Medium
            </button>
            <button onClick={() => setUserThreshold(90)} className={cn("flex-1 py-1.5 rounded text-[10px] uppercase font-bold tracking-wider transition-colors border", userThreshold === 90 ? "bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/40" : "bg-black/10 dark:bg-black/40 text-muted-foreground border-black/5 dark:border-white/5 hover:bg-black/5 dark:bg-white/5 hover:text-foreground")}>
              90 High
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="p-4 flex flex-col gap-4 overflow-y-auto custom-scrollbar flex-1 z-10 w-full">
         
         {/* Gauge Container */}
         <div className="flex justify-center items-center py-6 relative">
            <div className="relative w-[200px] h-[100px] overflow-hidden drop-shadow-xl">
               <svg className="absolute top-0 left-0" width="200" height="100" viewBox="0 0 160 80">
                  <defs>
                     <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#22C55E" />
                        <stop offset="50%" stopColor="#F59E0B" />
                        <stop offset="100%" stopColor="#EF4444" />
                     </linearGradient>
                  </defs>
                  
                  {/* Background Track Arc */}
                  <path 
                     d="M 10 76 A 70 70 0 0 1 150 76" 
                     fill="none" 
                     stroke="#2A2C32" 
                     strokeWidth="8" 
                     strokeLinecap="round" 
                     className="opacity-40"
                  />
                  {/* Subtle inner dashed markers */}
                  <path 
                     d="M 16 76 A 64 64 0 0 1 144 76" 
                     fill="none" 
                     stroke="#8E9299" 
                     strokeWidth="1.5" 
                     strokeLinecap="round" 
                     strokeDasharray="2 8"
                     className="opacity-20"
                  />
                  {/* Foreground Arc */}
                  <path 
                     d="M 10 76 A 70 70 0 0 1 150 76" 
                     fill="none" 
                     stroke={enabled ? activeGradient : "transparent"} 
                     strokeWidth="8" 
                     strokeLinecap="round"
                     strokeDasharray={`${circumference} ${circumference}`}
                     strokeDashoffset={enabled ? strokeDashoffset : circumference}
                     style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.5s ease-out' }}
                     className="drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]"
                  />
               </svg>
               
               <div className="absolute top-[35px] left-0 w-full flex flex-col items-center justify-center">
                  <span className="text-[44px] text-foreground font-mono font-semibold tracking-tighter leading-none text-shadow-sm" style={{ color: enabled ? "white" : gaugeColor, textShadow: enabled ? `0 0 20px ${gaugeColor}80` : 'none' }}>
                    {gaugeText}
                  </span>
                  <span className="text-[10px] font-bold tracking-[0.2em] mt-2 uppercase transition-colors" style={{ color: gaugeColor }}>
                    {gaugeSubText}
                  </span>
               </div>
            </div>
         </div>

         {/* Protection Switcher */}
         <div className={cn(
            "rounded-xl p-4 flex justify-between items-center transition-all duration-500",
            enabled 
              ? "bg-gradient-to-r from-[#22C55E]/10 to-transparent border border-[#22C55E]/20 shadow-[0_0_15px_rgba(34,197,94,0.05)]" 
              : "bg-card/60 border border-black/5 dark:border-white/5"
         )}>
            <div className="flex flex-col gap-1">
               <span className="text-[9px] font-bold text-muted-foreground tracking-[0.2em] uppercase leading-none">PROTECTION</span>
               <span className={cn("text-sm font-medium leading-none mt-1", enabled ? "text-[#22C55E]" : "text-foreground")}>
                 {enabled ? 'Monitoring Active' : 'Monitoring Off'}
               </span>
            </div>
            <Switch 
               checked={enabled} 
               onCheckedChange={setEnabled}
               className="data-[state=checked]:bg-[#22C55E] shadow-lg"
            />
         </div>

         {showPopup && (
           <div className="bg-red-500/20 border border-red-500 rounded-xl p-5 flex flex-col items-center justify-center gap-3 text-center">
              <h2 className="text-xl font-bold text-foreground uppercase tracking-wider">Are you ok?</h2>
              <p className="text-foreground text-xs">Emergency trigger detected (Score: {totalScore}). SOS will be sent in <span className="font-bold text-red-400 text-sm">{timer}</span> seconds.</p>
              <Button onClick={handleConfirmOk} className="w-full bg-green-600 hover:bg-green-500 text-foreground font-bold tracking-widest mt-2 uppercase">
                 Yes, I am ok
              </Button>
           </div>
         )}

         {/* Risk Analysis Card */}
         <div className="bg-card/60 border border-black/5 dark:border-white/5 rounded-xl p-5 flex flex-col shadow-inner backdrop-blur-sm relative overflow-hidden">
            <span className="text-[10px] font-bold text-muted-foreground tracking-[0.2em] uppercase mb-4 leading-none relative z-10 w-full flex justify-between">
              <span>TELEMETRY DATA</span>
              <span>WEIGHT</span>
            </span>
            
            <div className="flex flex-col gap-1.5 relative z-10">
               {renderProgressBar('VOICE', scores.voiceScore, 60)}
               {renderProgressBar('DROP', scores.dropScore, 10)}
               {renderProgressBar('ACCELERATION', scores.accelerationScore, 10)}
               {renderProgressBar('INACTIVITY', scores.inactivityScore, 10)}
               {renderProgressBar('ORIENTATION', scores.orientationScore, 10)}
            </div>

            <div className="w-full h-px bg-black/5 dark:bg-white/5 my-5 relative z-10"></div>
            
            <div className="flex justify-between items-center relative z-10 bg-background/50 rounded-lg p-3 border border-black/5 dark:border-white/5 shadow-inner">
               <span className="text-[10px] font-bold text-muted-foreground tracking-[0.2em] uppercase">RISK INDEX</span>
               <div className="flex items-baseline gap-1">
                 <span className={cn("font-mono text-xl leading-none", enabled ? "text-foreground" : "text-muted-foreground")}>
                   {enabled ? totalScore.toString().padStart(2, '0') : '00'}
                 </span>
                 <span className="text-[10px] text-muted-foreground font-mono leading-none">/100</span>
               </div>
            </div>
            
            {/* Subtle card glow overlay */}
            {enabled && <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/40 pointer-events-none" />}
         </div>

      </div>
    </div>
  );
});
