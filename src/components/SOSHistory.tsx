import React, { useEffect, useState } from 'react';
import { collection, query, onSnapshot, getDoc, doc } from 'firebase/firestore';
import { db as firestore, auth, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { useSOS } from '@/src/hooks/useSOS';
import { SOSEvent } from '@/src/types/sos';
import { CheckCircle, AlertTriangle, Trash2 } from 'lucide-react';

export const SOSHistory = React.memo(() => {
  const { localEvents, deleteSOS } = useSOS();
  const [adminRequests, setAdminRequests] = useState<SOSEvent[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;
    let unsubscribe: () => void;

    const fetchAdminStatus = async () => {
      try {
        const docSnap = await getDoc(doc(firestore, 'users', uid));
        const role = docSnap.data()?.role;
        setIsAdmin(role === 'admin');
        
        if (role === 'admin') {
          const q = query(collection(firestore, 'sos_events'));
          unsubscribe = onSnapshot(q, (snapshot) => {
            const reqs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));
            reqs.sort((a, b) => b.timestamp - a.timestamp);
            setAdminRequests(reqs.slice(0, 50));
          }, (error) => {
            handleFirestoreError(error, OperationType.GET, 'sos_events');
          });
        }
      } catch (error) {
        console.error("Failed to fetch admin status", error);
      }
    };

    fetchAdminStatus();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const displayEvents = isAdmin ? adminRequests : localEvents.slice(0, 5);

  return (
    <div className="hardware-card p-4 flex flex-col w-full h-80 sm:h-96">
      <div className="flex items-center justify-between mb-4">
        <span className="status-label">SOS HISTORY {isAdmin ? '(ALL)' : '(YOURS)'}</span>
        <span className="status-label text-blue-500">{displayEvents.length} {isAdmin ? '' : '/ 5'} RECORDS</span>
      </div>
      <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
        {displayEvents.length === 0 ? (
          <div className="text-xs text-muted-foreground font-mono text-center mt-8">NO SOS RECORDS FOUND</div>
        ) : (
          displayEvents.map(req => (
            <div key={req.id} className="bg-background border border-border rounded p-3 flex items-center justify-between">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  {req.isResolved ? (
                    <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                  )}
                  <span className="text-xs font-bold text-foreground">
                    {req.isResolved ? 'RESOLVED' : 'ACTIVE SOS'}
                  </span>
                  <span className="text-[8px] text-muted-foreground/60 font-mono">
                    {new Date(req.timestamp).toLocaleString()}
                  </span>
                  {!isAdmin && req.status && (
                    <span className={`text-[9px] font-mono px-1 rounded ${
                      req.status === 'PENDING' ? 'bg-yellow-500/20 text-yellow-500' : 
                      req.status === 'SENT' ? 'bg-blue-500/20 text-blue-500' : 
                      req.status === 'DELIVERED' ? 'bg-purple-500/20 text-purple-500' : 
                      req.status === 'ACKNOWLEDGED' ? 'bg-green-500/20 text-green-500' : 
                      req.status === 'FAILED' ? 'bg-red-500/20 text-red-500' : 'bg-green-500/20 text-green-500'
                    }`}>
                      {req.status}
                    </span>
                  )}
                </div>
                <div className="flex gap-4">
                  <span className="text-[8px] text-muted-foreground/60 font-mono truncate">
                    SENDER: {req.userId === auth.currentUser?.uid ? 'YOU' : req.userId}
                  </span>
                  <span className="text-[8px] text-purple-400 font-mono">
                    [{req.deliveredTo?.length || 0} DELIVERED]
                  </span>
                  <span className="text-[8px] text-green-400 font-mono">
                    [{req.acknowledgedBy?.length || 0} ACK'D]
                  </span>
                </div>
              </div>
                <div className="flex items-center gap-2">
                  {req.audioDataUrl && (
                    <audio src={req.audioDataUrl} controls className="h-6 w-32" />
                  )}
                  {(!isAdmin || req.userId === auth.currentUser?.uid) && (
                    <button 
                      onClick={() => deleteSOS(req.id)}
                      className="p-1.5 bg-red-500/10 text-red-500 rounded hover:bg-red-500 hover:text-foreground transition-colors"
                      title="Delete SOS Record"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
});
