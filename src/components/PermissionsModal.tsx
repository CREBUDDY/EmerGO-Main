import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MapPin, Mic, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export const PermissionsModal: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [locStatus, setLocStatus] = useState<PermissionState | 'unknown'>('unknown');
  const [micStatus, setMicStatus] = useState<PermissionState | 'unknown'>('unknown');
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const checkPermissions = async () => {
      try {
        if (!navigator.permissions) {
           // Fallback for older browsers
           setIsInitializing(false);
           return;
        }

        const locPerm = await navigator.permissions.query({ name: 'geolocation' });
        const micPerm = await navigator.permissions.query({ name: 'microphone' as PermissionName });

        const updateStatuses = () => {
          setLocStatus(locPerm.state);
          setMicStatus(micPerm.state);
          
          if (locPerm.state === 'granted' && micPerm.state === 'granted') {
            setOpen(false);
          } else {
            setOpen(true);
          }
        };

        locPerm.onchange = updateStatuses;
        micPerm.onchange = updateStatuses;
        
        updateStatuses();
      } catch (err) {
        console.error("Permission query failed:", err);
      } finally {
        setIsInitializing(false);
      }
    };

    checkPermissions();
  }, []);

  const requestLocation = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        () => {
          setLocStatus('granted');
          checkClose();
        },
        (err) => {
          console.error("Location request failed:", err);
          if (err.code === err.PERMISSION_DENIED) {
            setLocStatus('denied');
          }
        },
        { enableHighAccuracy: true }
      );
    }
  };

  const requestMicrophone = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stop traces immediately, we just needed the permission
      stream.getTracks().forEach(track => track.stop());
      setMicStatus('granted');
      checkClose();
    } catch (err) {
      console.error("Microphone request failed:", err);
      setMicStatus('denied');
    }
  };

  const checkClose = async () => {
    try {
      const locP = await navigator.permissions.query({ name: 'geolocation' });
      const micP = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      if (locP.state === 'granted' && micP.state === 'granted') {
        setOpen(false);
      }
    } catch(e) {}
  };

  // Do not show modal until initial permission check is done
  if (isInitializing || (!open && locStatus === 'granted' && micStatus === 'granted')) return null;

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
        if (!newOpen && (locStatus !== 'granted' || micStatus !== 'granted')) {
          return;
        }
        setOpen(newOpen);
    }}>
      <DialogContent 
        className="bg-[#151619] text-white border-[#2A2C32] sm:max-w-[450px] hardware-card"
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading text-xl tracking-wide uppercase text-red-500">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            System Permissions Required
          </DialogTitle>
          <DialogDescription className="text-[#8E9299] text-xs">
            EmerGo requires explicit access to your device's hardware to guarantee 
            reliable emergency dispatching and offline fallbacks.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Location Permission */}
          <div className="bg-[#0A0A0B] border border-[#2A2C32] rounded-lg p-4 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className={cn("p-2 rounded mt-0.5", locStatus === 'granted' ? "bg-green-500/20 text-green-500" : "bg-[#2A2C32] text-gray-400")}>
                  <MapPin className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold tracking-tight text-white uppercase">Location Services</h4>
                  <p className="text-[11px] text-[#8E9299] leading-relaxed">
                    Necessary to accurately fetch and broadcast your absolute GPS 
                    coordinates to emergency responders and mesh nodes during an SOS.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between mt-1 pl-11">
              <span className={cn("text-[10px] font-bold tracking-widest uppercase", 
                locStatus === 'granted' ? "text-green-500" : locStatus === 'denied' ? "text-red-500" : "text-yellow-500"
              )}>
                {locStatus === 'granted' ? "AUTHORIZED" : locStatus === 'denied' ? "DENIED IN BROWSER" : "AWAITING PERMISSION"}
              </span>
              {locStatus !== 'granted' && (
                <Button 
                  onClick={requestLocation} 
                  disabled={locStatus === 'denied'}
                  className="h-7 text-[10px] bg-white text-black hover:bg-gray-200 uppercase font-bold tracking-widest"
                >
                  Grant Access
                </Button>
              )}
              {locStatus === 'granted' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
            </div>
          </div>

          {/* Microphone Permission */}
          <div className="bg-[#0A0A0B] border border-[#2A2C32] rounded-lg p-4 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className={cn("p-2 rounded mt-0.5", micStatus === 'granted' ? "bg-green-500/20 text-green-500" : "bg-[#2A2C32] text-gray-400")}>
                  <Mic className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold tracking-tight text-white uppercase">Microphone Access</h4>
                  <p className="text-[11px] text-[#8E9299] leading-relaxed">
                    Required for the AI voice command SOS engine. Allows hands-free 
                    triggering and records emergency audio to attach to your signal.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between mt-1 pl-11">
              <span className={cn("text-[10px] font-bold tracking-widest uppercase", 
                micStatus === 'granted' ? "text-green-500" : micStatus === 'denied' ? "text-red-500" : "text-yellow-500"
              )}>
                {micStatus === 'granted' ? "AUTHORIZED" : micStatus === 'denied' ? "DENIED IN BROWSER" : "AWAITING PERMISSION"}
              </span>
              {micStatus !== 'granted' && (
                <Button 
                  onClick={requestMicrophone} 
                  disabled={micStatus === 'denied'}
                  className="h-7 text-[10px] bg-white text-black hover:bg-gray-200 uppercase font-bold tracking-widest"
                >
                  Grant Access
                </Button>
              )}
              {micStatus === 'granted' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
            </div>
          </div>
        </div>

        {(locStatus === 'denied' || micStatus === 'denied') && (
          <div className="text-[10px] text-red-400 text-center uppercase tracking-wider font-mono p-2 bg-red-500/10 rounded border border-red-500/20">
            Permissions denied! Please allow access in your browser settings and refresh the page.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
