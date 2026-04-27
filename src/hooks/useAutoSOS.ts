import { useState, useEffect, useRef, useCallback } from 'react';
import { useVoiceStressAnalysis } from './useVoiceStressAnalysis';
import { useOfflineVoiceCommands } from './useOfflineVoiceCommands';

export type RiskScore = {
  dropScore: Int;        // 0-10
  accelerationScore: Int;// 0-10
  inactivityScore: Int;  // 0-10
  orientationScore: Int; // 0-10
  voiceScore: Int;       // 0-60
};

export type Int = number;

export const useAutoSOS = (enabled: boolean = true, threshold: number = 50) => {
  useVoiceStressAnalysis(enabled);
  
  const [scores, setScores] = useState<RiskScore>({
    dropScore: 0,
    accelerationScore: 0,
    inactivityScore: 0,
    orientationScore: 0,
    voiceScore: 0
  });

  const maxScores = useRef<RiskScore>({
    dropScore: 0,
    accelerationScore: 0,
    inactivityScore: 0,
    orientationScore: 0,
    voiceScore: 0
  });

  // Call the new offline voice commands hook
  const handleVoiceSOS = useCallback(() => {
     let currentScores = { ...maxScores.current };
     currentScores.voiceScore = 60;
     currentScores.dropScore = 10;
     currentScores.accelerationScore = 10;
     currentScores.inactivityScore = 10;
     currentScores.orientationScore = 10;
     maxScores.current = currentScores;
     setScores(currentScores);
  }, []);

  useOfflineVoiceCommands(enabled, handleVoiceSOS);

  const [triggerStatus, setTriggerStatus] = useState<"Monitoring..." | "Triggering SOS in 5s..." | "SOS TRIGGERED">("Monitoring...");
  const lastTriggerTime = useRef<number>(0);
  const COOLDOWN_MS = 2 * 60 * 1000;

  // Total score calculation based on strict weightages
  const totalScore = Math.min(100, scores.voiceScore + scores.dropScore + scores.accelerationScore + scores.inactivityScore + scores.orientationScore);

  // Sensor state refs for detectors
  const dropState = useRef({
    inFreefall: false,
    freefallStartTime: 0,
    hasDropped: false,
    lastDropTime: 0
  });

  const accelState = useRef({
    lastMag: 9.8,
    lastTime: 0,
    hasHighAccel: false,
    lastAccelTime: 0
  });

  const inactivityState = useRef({
    lastMovementTime: 0
  });

  const orientState = useRef({
    wasUpright: false,
    uprightTime: 0
  });

  useEffect(() => {
    if (!enabled) {
      setScores({
        dropScore: 0,
        accelerationScore: 0,
        inactivityScore: 0,
        orientationScore: 0,
        voiceScore: 0
      });
      maxScores.current = {
        dropScore: 0,
        accelerationScore: 0,
        inactivityScore: 0,
        orientationScore: 0,
        voiceScore: 0
      };
      setTriggerStatus("Monitoring...");
      return;
    }

    // --- SENSOR ANALYSIS ---
    const handleMotion = (event: DeviceMotionEvent) => {

      const now = Date.now();
      const accel = event.accelerationIncludingGravity;

      let currentScores = { ...maxScores.current };
      let changed = false;

      // 1. Drop & Acceleration Detection
      if (accel && accel.x !== null && accel.y !== null && accel.z !== null) {
        const mag = Math.sqrt(accel.x * accel.x + accel.y * accel.y + accel.z * accel.z);
        
        // Acceleration / Jerk detector (max 10)
        const dt = now - accelState.current.lastTime;
        if (dt > 0 && accelState.current.lastTime > 0) {
          const jerk = Math.abs(mag - accelState.current.lastMag) / (dt / 1000);
          if (jerk > 50) { 
            const aScore = Math.min(10, Math.floor(jerk / 20));
            if (aScore > currentScores.accelerationScore) {
              currentScores.accelerationScore = aScore;
              accelState.current.hasHighAccel = true;
              accelState.current.lastAccelTime = now;
              changed = true;
            }
          }
        }
        accelState.current.lastMag = mag;
        accelState.current.lastTime = now;

        // Drop detector (freefall -> impact) (max 10)
        if (mag < 3) {
          if (!dropState.current.inFreefall) {
            dropState.current.inFreefall = true;
            dropState.current.freefallStartTime = now;
          }
        } else {
          if (dropState.current.inFreefall) {
            const freefallDuration = now - dropState.current.freefallStartTime;
            if (freefallDuration > 200 && mag > 20) { 
              const dScore = Math.min(10, 5 + Math.floor((mag - 20) / 2));
              if (dScore > currentScores.dropScore) {
                 currentScores.dropScore = dScore;
                 dropState.current.hasDropped = true;
                 dropState.current.lastDropTime = now;
                 changed = true;
              }
            }
            dropState.current.inFreefall = false;
          }
        }

        // Movement Tracker for Inactivity
        if (Math.abs(mag - 9.8) > 2) {
          inactivityState.current.lastMovementTime = now;
        }

        // Orientation (max 10)
        const isUpright = Math.abs(accel.y) > 7 && Math.abs(accel.x) < 4 && Math.abs(accel.z) < 4;
        const isHorizontal = Math.abs(accel.z) > 7 || Math.abs(accel.x) > 7;

        if (isUpright) {
          orientState.current.wasUpright = true;
          orientState.current.uprightTime = now;
        } else if (isHorizontal && orientState.current.wasUpright) {
          const timeSinceUpright = now - orientState.current.uprightTime;
          if (timeSinceUpright < 1000) { 
            if (currentScores.orientationScore < 10) {
              currentScores.orientationScore = 10;
              changed = true;
            }
          }
        }
      }

      // 3. Inactivity (Requires prior drop or acceleration) (max 10)
      if (dropState.current.hasDropped || accelState.current.hasHighAccel) {
         const timeSinceMoved = now - inactivityState.current.lastMovementTime;
         if (timeSinceMoved > 5000) { 
            const inactScore = Math.min(10, Math.floor((timeSinceMoved - 5000) / 1000 * 2));
            if (inactScore > currentScores.inactivityScore) {
               currentScores.inactivityScore = inactScore;
               changed = true;
            }
         }
      }

      if (changed) {
         maxScores.current = currentScores;
         setScores(currentScores);
      }
    };

    window.addEventListener('devicemotion', handleMotion);

    // Decay scores slowly so it's a live dashboard
    const decayInterval = setInterval(() => {
       const now = Date.now();
       let decayed = { ...maxScores.current };
       let changed = false;

       const decayField = (field: keyof RiskScore, amt: number) => {
         if (decayed[field] > 0) {
           decayed[field] = Math.max(0, decayed[field] - amt);
           changed = true;
         }
       };

       decayField('dropScore', 1);
       decayField('accelerationScore', 1);
       decayField('orientationScore', 1);
       decayField('voiceScore', 2);

       // Reset inactivity state if movement happened
       if (now - inactivityState.current.lastMovementTime < 2000) {
         if (decayed.inactivityScore > 0) {
            decayed.inactivityScore = 0;
            changed = true;
         }
         // Also reset drop/accel state if user recovered (moved a lot)
         if (now - Math.max(dropState.current.lastDropTime, accelState.current.lastAccelTime) > 10000) {
            dropState.current.hasDropped = false;
            accelState.current.hasHighAccel = false;
         }
       }

       if (changed) {
         maxScores.current = decayed;
         setScores(decayed);
       }
    }, 1000);

    return () => {
      window.removeEventListener('devicemotion', handleMotion);
      clearInterval(decayInterval);
    };
  }, [enabled]);

  const cancelTrigger = useCallback(() => {
    setTriggerStatus("Monitoring...");
    lastTriggerTime.current = Date.now() - COOLDOWN_MS + 10000;
    maxScores.current = {
      dropScore: 0,
      accelerationScore: 0,
      inactivityScore: 0,
      orientationScore: 0,
      voiceScore: 0
    };
    setScores(maxScores.current);
  }, [COOLDOWN_MS]);

  return {
    scores,
    totalScore,
    triggerStatus,
    setTriggerStatus,
    cancelTrigger,
    enabled,
    threshold
  };
};

