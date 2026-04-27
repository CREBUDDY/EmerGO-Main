import { useState, useEffect, useRef, useCallback } from "react";
import { SOS_KEYWORDS, KEYWORD_STORE_KEY } from "../constants/voiceCommands";

export const useOfflineVoiceCommands = (enabled: boolean, onSOSDetected: () => void) => {
  const [isListening, setIsListening] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioDataRef = useRef<Float32Array | null>(null);
  const recognitionRef = useRef<any>(null);
  const animationFrameRef = useRef<number | null>(null);

  const [keywords, setKeywords] = useState<string[]>(SOS_KEYWORDS);

  // Load keywords locally
  useEffect(() => {
    try {
      const stored = localStorage.getItem(KEYWORD_STORE_KEY);
      if (stored) {
        setKeywords(JSON.parse(stored));
      } else {
        localStorage.setItem(KEYWORD_STORE_KEY, JSON.stringify(SOS_KEYWORDS));
      }
    } catch (e) {
      console.error("Local storage error:", e);
    }
  }, []);

  const startListening = useCallback(() => {
    if (isListening) return;

    // Web Audio API approach for offline detection (loudness peaks)
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        setIsListening(true);
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        audioContextRef.current = new AudioContext();
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 256;

        const mediaStreamSource = audioContextRef.current.createMediaStreamSource(stream);
        mediaStreamSource.connect(analyserRef.current);

        audioDataRef.current = new Float32Array(analyserRef.current.frequencyBinCount);
        
        let peakThresholdCount = 0;
        
        const startAudioAnalysis = () => {
          if (!isListening || !analyserRef.current || !audioDataRef.current) return;
          
          analyserRef.current.getFloatFrequencyData(audioDataRef.current);
          
          let sum = 0;
          for(let i=0; i<audioDataRef.current.length; i++) {
             sum += audioDataRef.current[i];
          }
          const avg = sum / audioDataRef.current.length;
          
          // Fallback offline detection (e.g. shouting detection)
          if (avg > -40) { 
             peakThresholdCount++;
             if (peakThresholdCount > 20) {
                 // Might be SOS shouting detected offline
                 onSOSDetected();
                 peakThresholdCount = 0; // reset
             }
          } else {
             peakThresholdCount = Math.max(0, peakThresholdCount - 1);
          }
          
          animationFrameRef.current = requestAnimationFrame(startAudioAnalysis);
        };
        startAudioAnalysis();

        // Integrate standard offline-capable speech recognition for word detection
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
           const recognition = new SpeechRecognition();
           recognition.continuous = true;
           recognition.interimResults = true;
           recognition.lang = "en-US";
           
           recognition.onresult = (event: any) => {
             let text = "";
             for (let i = event.resultIndex; i < event.results.length; ++i) {
               text += event.results[i][0].transcript + " ";
             }
             text = text.toLowerCase();
             const shouldTriggerSOS = keywords.some((keyword) => text.includes(keyword.toLowerCase()));
             if (shouldTriggerSOS) {
                onSOSDetected();
             }
           };
           
           recognition.onend = () => {
             if (enabled && isListening) {
               try { recognition.start(); } catch (e) {}
             }
           };

           recognition.start();
           recognitionRef.current = recognition;
        }

      })
      .catch((err) => {
        console.error("Error accessing microphone:", err);
      });
  }, [isListening, keywords, onSOSDetected, enabled]);

  const stopListening = useCallback(() => {
    if (!isListening) return;
    setIsListening(false);

    if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
    }

    if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (e) {}
        recognitionRef.current = null;
    }

    if (mediaRecorderRef.current?.stream) {
      mediaRecorderRef.current.stream.getTracks().forEach((track) => {
        track.stop();
      });
    }

    if (audioContextRef.current?.state !== "closed") {
      audioContextRef.current?.close().catch(() => {});
    }

    mediaRecorderRef.current = null;
    audioContextRef.current = null;
    analyserRef.current = null;
    audioDataRef.current = null;
  }, [isListening]);

  useEffect(() => {
    if (enabled) {
       startListening();
    } else {
       stopListening();
    }
    return () => {
       stopListening();
    };
  }, [enabled, startListening, stopListening]);

  return { isListening };
};
