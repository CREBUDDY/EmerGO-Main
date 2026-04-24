import React, { useCallback } from 'react';
import { useNearbySOS } from '@/src/hooks/useNearbySOS';
import { Button } from '@/components/ui/button';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { getDeviceId } from '@/src/lib/device';
import { toast } from 'sonner';
import { AlertCircle, MapPin, CheckCircle } from 'lucide-react';

export const NearbySOSFeed = React.memo(({ userLocation }: { userLocation: { lat: number, lng: number } | null }) => {
  const nearbyRequests = useNearbySOS(userLocation);
  const currentDeviceId = getDeviceId();

  const handleAcknowledge = useCallback(async (eventId: string) => {
    try {
      await updateDoc(doc(db, 'sos_events', eventId), {
        acknowledgedBy: arrayUnion(currentDeviceId),
        status: 'ACKNOWLEDGED'
      });
      toast.success("SOS Acknowledged", {
        description: "The sender has been notified that you are responding."
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `sos_events/${eventId}`);
      toast.error("Failed to acknowledge SOS");
    }
  }, [currentDeviceId]);

  return (
    <div className="hardware-card p-4 flex flex-col w-full h-80 sm:h-96">
      <div className="flex flex-col gap-1 mb-2">
        <div className="flex items-center justify-between">
          <span className="status-label">NEARBY ACTIVE SOS</span>
          <span className="status-label text-red-500 animate-pulse">{nearbyRequests.length} DETECTED</span>
        </div>
        {!userLocation && (
          <div className="text-[10px] text-yellow-500 font-mono flex items-center gap-1 bg-yellow-500/10 p-1 rounded">
             <AlertCircle className="w-3 h-3" /> Waiting for precise GPS distance...
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
        {nearbyRequests.length === 0 ? (
          <div className="text-xs text-[#8E9299] font-mono text-center mt-8">NO NEARBY EMERGENCIES</div>
        ) : (
          nearbyRequests.map(req => (
            <div key={req.id} className="bg-red-500/10 border border-red-500/30 rounded p-3 flex flex-col gap-2">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                  <span className="text-xs font-bold text-red-500">
                    {req.type === 'silent' ? 'SILENT SOS' : 'EMERGENCY'}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[8px] text-red-400 font-mono">
                  <MapPin className="w-3 h-3" />
                  {userLocation ? `${req.distance.toFixed(2)} km` : '?? km'}
                </div>
              </div>
              
              <p className="text-xs text-white/90 font-mono line-clamp-2">
                {req.transcript || "Help required at this location."}
              </p>

              {req.audioDataUrl && (
                <div className="mt-1">
                  <audio src={req.audioDataUrl} controls className="h-6 w-full max-w-[200px]" />
                </div>
              )}
              
              <div className="mt-2 pt-2 border-t border-red-500/20 flex justify-between items-center">
                <div className="text-[10px] text-red-300 flex flex-col gap-0.5">
                   <span>Delivered to {req.deliveredTo?.length || 0} devices</span>
                   <span>Ack'd by {(req.acknowledgedBy?.length || 0)} responding</span>
                </div>
                {!(req.acknowledgedBy || []).includes(currentDeviceId) ? (
                  <Button 
                    onClick={() => handleAcknowledge(req.id)}
                    size="sm" 
                    className="h-6 px-3 text-[10px] uppercase font-bold tracking-wider bg-red-600 hover:bg-red-500 text-white border border-red-400/50"
                  >
                    ACKNOWLEDGE
                  </Button>
                ) : (
                   <div className="flex items-center gap-1 text-[8px] font-bold text-green-400 bg-green-500/10 px-2 py-1 rounded">
                     <CheckCircle className="w-3 h-3" /> RESPONDING
                   </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
});
