import { useState, useEffect, useRef, useCallback } from 'react';

export type RiskScore = {
  fallScore: Int;        // 0-40
  movementScore: Int;    // 0-20
  inactivityScore: Int;  // 0-25
  orientationScore: Int; // 0-15
  impactScore: Int;      // 0-15
  voiceScore: Int;       // 0-30
};

export type Int = number;

export const useAutoSOS = (enabled: boolean = true, threshold: number = 70) => {
  const [scores, setScores] = useState<RiskScore>({
    fallScore: 0,
    movementScore: 0,
    inactivityScore: 0,
    orientationScore: 0,
    impactScore: 0,
    voiceScore: 0
  });

  const totalScore = scores.fallScore + scores.movementScore + scores.inactivityScore + scores.orientationScore + scores.impactScore + scores.voiceScore;

  const [triggerStatus, setTriggerStatus] = useState<"Monitoring..." | "Triggering SOS in 5s..." | "SOS TRIGGERED">("Monitoring...");
  const lastTriggerTime = useRef<number>(0);
  const COOLDOWN_MS = 2 * 60 * 1000;

  // Sensor state refs for detectors
  const fallState = useRef({
    inFreefall: false,
    freefallStartTime: 0,
    hasFallen: false,
    lastFallTime: 0
  });

  const impactState = useRef({
    lastMag: 9.8,
    lastTime: 0,
    hasImpact: false,
    lastImpactTime: 0
  });

  const inactivityState = useRef({
    lastMovementTime: 0
  });

  const orientState = useRef({
    wasUpright: false,
    uprightTime: 0
  });

  const maxScores = useRef<RiskScore>({
    fallScore: 0,
    movementScore: 0,
    inactivityScore: 0,
    orientationScore: 0,
    impactScore: 0,
    voiceScore: 0
  });

  useEffect(() => {
    if (!enabled) {
      setScores({
        fallScore: 0,
        movementScore: 0,
        inactivityScore: 0,
        orientationScore: 0,
        impactScore: 0,
        voiceScore: 0
      });
      maxScores.current = {
        fallScore: 0,
        movementScore: 0,
        inactivityScore: 0,
        orientationScore: 0,
        impactScore: 0,
        voiceScore: 0
      };
      setTriggerStatus("Monitoring...");
      return;
    }

    // --- VOICE ANALYSIS (Web Speech API + Audio Context) ---
    // Try to get audio independently
    let audioCtx: AudioContext;
    let analyser: AnalyserNode;
    let source: MediaStreamAudioSourceNode;
    let stream: MediaStream;
    let dataArray: Uint8Array;
    let volumePoller: NodeJS.Timeout;

    const KEYWORDS = ["help", "emergency", "stop", "please", "aah", "ambulance", "danger", "robber"];

    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      .then(s => {
        stream = s;
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);
        dataArray = new Uint8Array(analyser.frequencyBinCount);

        volumePoller = setInterval(() => {
           if (!stream.active) return;
           analyser.getByteFrequencyData(dataArray);
           let sum = 0;
           for(let i=0; i<dataArray.length;i++) sum+=dataArray[i];
           const vol = sum / dataArray.length;
           
           if (vol > 80) { // loud noise detected
              let currentScores = { ...maxScores.current };
              const vScore = Math.min(30, Math.floor(vol / 4));
              if (vScore > currentScores.voiceScore) {
                 currentScores.voiceScore = vScore;
                 maxScores.current = currentScores;
                 setScores(currentScores);
              }
           }
        }, 100);
      }).catch(()=>console.warn("AutoSOS: Audio level permission denied."));

    let recognition: any = null;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = (event: any) => {
        let text = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          text += event.results[i][0].transcript + " ";
        }
        const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 0);
        
        let matchCount = 0;
        words.forEach(w => {
           if (KEYWORDS.includes(w)) matchCount++;
        });

        if (matchCount > 0) {
           let currentScores = { ...maxScores.current };
           const vScore = Math.min(30, currentScores.voiceScore + (matchCount * 10));
           if (vScore > currentScores.voiceScore) {
              currentScores.voiceScore = vScore;
              maxScores.current = currentScores;
              setScores(currentScores);
           }
        }
      };
      recognition.onend = () => {
        if (enabled) {
          try { recognition.start(); } catch (e) {}
        }
      };
      recognition.onerror = () => {};
      try { recognition.start(); } catch (e) {}
    }

    const handleMotion = (event: DeviceMotionEvent) => {
      const now = Date.now();
      const accel = event.accelerationIncludingGravity;
      const rot = event.rotationRate;

      let currentScores = { ...maxScores.current };
      let changed = false;

      // 1. Fall & Impact Detection
      if (accel && accel.x !== null && accel.y !== null && accel.z !== null) {
        const mag = Math.sqrt(accel.x * accel.x + accel.y * accel.y + accel.z * accel.z);
        
        // Impact detector (jerk)
        const dt = now - impactState.current.lastTime;
        if (dt > 0 && impactState.current.lastTime > 0) {
          const jerk = Math.abs(mag - impactState.current.lastMag) / (dt / 1000);
          if (jerk > 50) { // arbitrary jerk threshold
            const iScore = Math.min(15, Math.floor(jerk / 10));
            if (iScore > currentScores.impactScore) {
              currentScores.impactScore = iScore;
              impactState.current.hasImpact = true;
              impactState.current.lastImpactTime = now;
              changed = true;
            }
          }
        }
        impactState.current.lastMag = mag;
        impactState.current.lastTime = now;

        // Fall detector (freefall -> impact)
        if (mag < 3) {
          if (!fallState.current.inFreefall) {
            fallState.current.inFreefall = true;
            fallState.current.freefallStartTime = now;
          }
        } else {
          if (fallState.current.inFreefall) {
            const freefallDuration = now - fallState.current.freefallStartTime;
            if (freefallDuration > 200 && mag > 25) { // Impact after freefall
              const fScore = Math.min(40, 20 + Math.floor((mag - 25) * 1));
              if (fScore > currentScores.fallScore) {
                 currentScores.fallScore = fScore;
                 fallState.current.hasFallen = true;
                 fallState.current.lastFallTime = now;
                 changed = true;
              }
            }
            fallState.current.inFreefall = false;
          }
        }

        // Movement Tracker for Inactivity
        if (Math.abs(mag - 9.8) > 2) {
          inactivityState.current.lastMovementTime = now;
        }

        // Orientation
        // Rough estimate of upright if y is near 9.8 or -9.8
        const isUpright = Math.abs(accel.y) > 7 && Math.abs(accel.x) < 4 && Math.abs(accel.z) < 4;
        const isHorizontal = Math.abs(accel.z) > 7 || Math.abs(accel.x) > 7;

        if (isUpright) {
          orientState.current.wasUpright = true;
          orientState.current.uprightTime = now;
        } else if (isHorizontal && orientState.current.wasUpright) {
          const timeSinceUpright = now - orientState.current.uprightTime;
          if (timeSinceUpright < 1000) { // sudden change
            if (currentScores.orientationScore < 15) {
              currentScores.orientationScore = 15;
              changed = true;
            }
          }
        }
      }

      // 2. Movement (Gyro)
      if (rot && rot.alpha !== null && rot.beta !== null && rot.gamma !== null) {
        const rotMag = Math.sqrt(rot.alpha*rot.alpha + rot.beta*rot.beta + rot.gamma*rot.gamma);
        if (rotMag > 300) {
          const mScore = Math.min(20, Math.floor(rotMag / 20));
          if (mScore > currentScores.movementScore) {
            currentScores.movementScore = mScore;
            changed = true;
          }
        }
      }

      // 3. Inactivity (Requires prior fall or impact)
      if (fallState.current.hasFallen || impactState.current.hasImpact) {
         const timeSinceMoved = now - inactivityState.current.lastMovementTime;
         if (timeSinceMoved > 5000) { // 5+ seconds of inactivity
            const inactScore = Math.min(25, Math.floor((timeSinceMoved - 5000) / 1000 * 5));
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

       decayField('fallScore', 2);
       decayField('movementScore', 3);
       decayField('impactScore', 2);
       decayField('orientationScore', 1);
       decayField('voiceScore', 2);

       // Reset inactivity state if movement happened
       if (now - inactivityState.current.lastMovementTime < 2000) {
         if (decayed.inactivityScore > 0) {
            decayed.inactivityScore = 0;
            changed = true;
         }
         // Also reset fall/impact state if user recovered (moved a lot)
         if (now - Math.max(fallState.current.lastFallTime, impactState.current.lastImpactTime) > 10000) {
            fallState.current.hasFallen = false;
            impactState.current.hasImpact = false;
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
      if (volumePoller) clearInterval(volumePoller);
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (audioCtx) audioCtx.close().catch(()=>{});
      
      if (recognition) {
        recognition.onend = null;
        recognition.stop();
      }
    };
  }, [enabled]);

  const cancelTrigger = useCallback(() => {
    setTriggerStatus("Monitoring...");
    lastTriggerTime.current = Date.now() - COOLDOWN_MS + 10000;
    maxScores.current = {
      fallScore: 0,
      movementScore: 0,
      inactivityScore: 0,
      orientationScore: 0,
      impactScore: 0,
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

