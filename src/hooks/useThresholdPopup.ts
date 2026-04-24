import { useState, useEffect, useRef } from "react";
import { toast } from "sonner"; // sonner is used for toasts
import { useSOS } from "./useSOS";

interface ThresholdPopupProps {
  riskScore: number;
  threshold: number;
  onConfirm: () => void;
  enabled: boolean;
  scores: any;
}

export const useThresholdPopup = ({ riskScore, threshold, onConfirm, enabled, scores }: ThresholdPopupProps) => {
  const [showPopup, setShowPopup] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [timer, setTimer] = useState(5);
  const { broadcastSOS } = useSOS();
  
  const lastTriggerTime = useRef<number>(0);
  const COOLDOWN_MS = 2 * 60 * 1000;

  useEffect(() => {
    if (riskScore < threshold) {
      setIsConfirmed(false);
    }
  }, [riskScore, threshold]);

  useEffect(() => {
    if (!enabled) {
      setShowPopup(false);
      return;
    }

    if (Date.now() - lastTriggerTime.current < COOLDOWN_MS) {
      return;
    }

    if (riskScore >= threshold && !showPopup && !isConfirmed) {
      setShowPopup(true);
      setTimer(5);
      setIsConfirmed(false);
    }
  }, [riskScore, threshold, showPopup, isConfirmed, enabled]);

  useEffect(() => {
    if (!showPopup) return;

    if (timer > 0) {
      const countdown = setTimeout(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
      return () => clearTimeout(countdown);
    } else if (timer === 0) {
       // Time ran out, trigger SOS!
       setShowPopup(false);
       lastTriggerTime.current = Date.now();
       
       const payloadDescription = `AUTO TRIGGERED (Score: ${riskScore}). Fall: ${scores.fallScore}, Movement: ${scores.movementScore}, Inactivity: ${scores.inactivityScore}`;
       
       const triggerBroadcast = async (lat: number, lng: number) => {
         try {
           await broadcastSOS('text', payloadDescription, lat, lng, undefined, [], {}, {
             triggerType: "AUTO",
             score: riskScore,
             breakdown: { voice: 0, motion: scores.movementScore, context: 0, behavior: 0 },
             reasons: [`Fall: ${scores.fallScore}`, `Impact: ${scores.impactScore}`, `Inactivity: ${scores.inactivityScore}`]
           });
         } catch (e) {
           console.error("Auto SOS broadcast failed", e);
         }
       };
       
       if ("geolocation" in navigator) {
         navigator.geolocation.getCurrentPosition(
           (pos) => triggerBroadcast(pos.coords.latitude, pos.coords.longitude),
           () => triggerBroadcast(0, 0),
           { timeout: 5000 }
         );
       } else {
         triggerBroadcast(0, 0);
       }
       onConfirm(); // clear triggers
    }
  }, [showPopup, timer, riskScore, scores, broadcastSOS, onConfirm]);

  const handleConfirmOk = () => {
    setIsConfirmed(true);
    setShowPopup(false);
    toast.success("Ok, stay safe.");
    lastTriggerTime.current = Date.now() - COOLDOWN_MS + 10000; // Reset some cooldown
    onConfirm(); // Callback to reset scores or state in parent
  };

  return { showPopup, timer, handleConfirmOk };
};
