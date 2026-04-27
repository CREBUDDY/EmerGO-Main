import { useState, useEffect } from "react";

export const useVoiceStressAnalysis = (enabled: boolean = true) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [stressLevel, setStressLevel] = useState(0);
  const [isShouting, setIsShouting] = useState(false);
  const [context, setContext] = useState<"home" | "work" | "pub" | "outdoors">("home");
  
  // Real implementation of behavior based on external factors
  // This helps avoid false positives in loud environments like pubs
  useEffect(() => {
    if (!enabled) return;
    
    // In a real app we would check places API or our hotspots for distance to clubs
    // Here we'll simulate dynamically based on time/mock data if needed
    // Let's assume it's outdoors for default, and potentially pub if night/weekend
    const hour = new Date().getHours();
    if (hour > 20 || hour < 4) {
      setContext("pub"); // Simple heuristic for demonstration of contextual thresholds
    } else {
      setContext("outdoors");
    }
  }, [enabled]);


  useEffect(() => {
    if (!enabled) {
      setIsAnalyzing(false);
      setStressLevel(0);
      setIsShouting(false);
      return;
    }

    let isMounted = true;
    let audioCtx: AudioContext;
    let analyser: AnalyserNode;
    let stream: MediaStream;
    let poller: NodeJS.Timeout;

    const startAudio = async () => {
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (!isMounted) {
          audioStream.getTracks().forEach(t => t.stop());
          return;
        }
        stream = audioStream;
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        setIsAnalyzing(true);

        poller = setInterval(() => {
          if (!isMounted) return;
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for(let i=0; i<dataArray.length;i++) sum+=dataArray[i];
          const averageVolume = sum / dataArray.length;
          
          let adjustedStress = Math.min(100, averageVolume * 1.5);
          
          // Contextual sensitivity adjustment
          if (context === "pub") {
            adjustedStress *= 0.3; // Much lower sensitivity in loud environments
          } else if (context === "outdoors") {
            adjustedStress *= 0.8;
          }

          setIsShouting(averageVolume > 85);
          setStressLevel(adjustedStress);
        }, 500);

      } catch (err) {
         console.warn("Could not start voice stress analysis", err);
      }
    };

    startAudio();

    return () => {
       isMounted = false;
       clearInterval(poller);
       if (stream) {
         stream.getTracks().forEach(t => t.stop());
       }
       if (audioCtx && audioCtx.state !== 'closed') {
         audioCtx.close().catch(() => {});
       }
    };
  }, [context, enabled]);

  return { isAnalyzing, stressLevel, isShouting, context };
};
