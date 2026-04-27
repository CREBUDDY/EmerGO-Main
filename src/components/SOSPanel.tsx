import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { db, auth, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useSOS } from '@/src/hooks/useSOS';
import { useVoiceRecorder } from '@/src/hooks/useVoiceRecorder';
import { useLoading } from '../contexts/LoadingContext';
import { Users, ShieldCheck, X, Phone, Mail, Plus, Info, Activity, Save, Volume2, Mic, Send } from 'lucide-react';

interface Contact {
  name: string;
  phone: string;
  email: string;
}

interface MedicalProfile {
  bio: string;
  medicalConditions: string;
  bloodType: string;
}

export const SOSPanel = React.memo(() => {
  const { broadcastSOS } = useSOS();
  const { withLoading } = useLoading();
  const { startRecording: startVoiceRecording, stopRecording: stopVoiceRecording, isRecording } = useVoiceRecorder();
  
  const [status, setStatus] = useState<"idle" | "recording" | "processing" | "sent">("idle");
  const [sentMessage, setSentMessage] = useState("");
    const [isManagingProfile, setIsManagingProfile] = useState(false);
  const [profileTab, setProfileTab] = useState<"contacts" | "medical">("contacts");
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [customMessage, setCustomMessage] = useState("");
  
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [newContact, setNewContact] = useState<Contact>({ name: '', phone: '', email: '' });
  
  const [medicalProfile, setMedicalProfile] = useState<MedicalProfile>({
    bio: '',
    medicalConditions: '',
    bloodType: ''
  });

  useEffect(() => {
    const fetchUserData = async () => {
      if (!auth.currentUser) return;
      try {
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          if (data.emergencyContacts) setContacts(data.emergencyContacts);
          setMedicalProfile({
            bio: data.bio || '',
            medicalConditions: data.medicalConditions || '',
            bloodType: data.bloodType || ''
          });
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
      }
    };
    fetchUserData();
  }, []);

  const saveContacts = async (updatedContacts: Contact[]) => {
    if (!auth.currentUser) return;
    try {
      await withLoading("Syncing Contacts...", updateDoc(doc(db, 'users', auth.currentUser.uid), {
        emergencyContacts: updatedContacts,
        lastActive: serverTimestamp()
      }));
      setContacts(updatedContacts);
      toast.success("Contacts updated successfully");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${auth.currentUser.uid}`);
    }
  };

  const saveMedicalProfile = async () => {
    if (!auth.currentUser) return;
    try {
      await withLoading("Syncing Medical Profile...", updateDoc(doc(db, 'users', auth.currentUser.uid), {
        ...medicalProfile,
        lastActive: serverTimestamp()
      }));
      toast.success("Medical profile updated");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${auth.currentUser.uid}`);
    }
  };

  const addContact = () => {
    if (!newContact.name || (!newContact.phone && !newContact.email)) {
      toast.error("Please provide a name and at least one contact method");
      return;
    }
    const updated = [...contacts, newContact];
    saveContacts(updated);
    setNewContact({ name: '', phone: '', email: '' });
  };

  const removeContact = (index: number) => {
    const updated = contacts.filter((_, i) => i !== index);
    saveContacts(updated);
  };

  const startRecording = async () => {
    try {
      await startVoiceRecording();
      setStatus("recording");
      setSentMessage("");
      toast.error("RECORDING EMERGENCY AUDIO", {
        description: "Release to broadcast SOS signal.",
        className: "hardware-card border-red-500/50 text-foreground",
      });
    } catch (err) {
      console.error("Failed to start recording", err);
      toast.error("Microphone access denied or unavailable.");
    }
  };

  const sendSOS = async (type: 'voice' | 'silent' | 'text', audioBlob?: Blob, speechText?: string) => {
    setStatus("processing");
    await withLoading('Broadcasting SOS Payload...', async () => {
      try {
        let emergencyMessage = "";
        if (type === 'voice') {
          emergencyMessage = speechText || "Emergency! Voice recording attached. Need immediate assistance.";
        } else if (type === 'silent') {
          emergencyMessage = "SILENT SOS TRIGGERED. User cannot speak. Immediate assistance required at location.";
        } else {
          emergencyMessage = speechText || "Emergency! Immediate assistance required at location.";
        }

        setSentMessage(emergencyMessage);

        let lat = 28.6139;
        let lng = 77.2090;
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
          });
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        } catch (e) {
          console.warn("Could not get location for SOS, using default");
        }

        const emergencyContactList = contacts.map(c => c.email || c.phone);
        
        // Dispatch via the new offline-first hook
        await broadcastSOS(
          type, 
          emergencyMessage, 
          lat, 
          lng, 
          audioBlob, 
          emergencyContactList,
          {
            bloodType: medicalProfile.bloodType,
            conditions: medicalProfile.medicalConditions
          }
        );

        setStatus("sent");
        const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
        
        toast.success(isOffline ? "SOS SAVED OFFLINE" : "SOS BROADCAST SENT", {
          description: isOffline 
            ? "Your signal is locally queued securely and will auto-sync when internet restores." 
            : "Your emergency signal has been dispatched securely to the cloud.",
          className: "hardware-card border-green-500/50 text-foreground",
        });

        setTimeout(() => setStatus("idle"), 3000); // Reset UI after 3s
      } catch (error) {
        console.error("Error sending SOS:", error);
        setStatus("idle");
        toast.error("Critical error scheduling SOS");
      }
    });
  };

  const [extractedTranscript, setExtractedTranscript] = useState("");

  const stopRecordingAndLaunchCountdown = async () => {
    try {
      const { audioBlob, getTranscript } = await stopVoiceRecording();
      // Start 5-second countdown instead of sending instantly.
      setCountdown(5);
      setExtractedTranscript("");
      
      let finalTranscript = "Analyzing voice payload...";
      
      // Start transcription asynchronously so the UI isn't blocked
      getTranscript().then((transcript) => {
        finalTranscript = transcript;
        setExtractedTranscript(transcript);
      });
      
      const interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(interval);
            return 0; // Trigger send when it hits 0. We'll watch this effect.
          }
          return prev - 1;
        });
      }, 1000);
      
      countdownTimerRef.current = interval;
      
      // Send SOS automatically when countdown finishes 
      const finishCountdown = async () => {
         await new Promise(resolve => setTimeout(resolve, 5000));
         // Need current ref to see if cancelled
         if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
            setCountdown(null);
            await sendSOS('voice', audioBlob, finalTranscript);
         }
      };
      finishCountdown();

    } catch (error) {
      console.error(error);
      toast.error("Failed to finalize recording.");
      setStatus("idle");
    }
  };

  const cancelSOS = () => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
      setCountdown(null);
      setStatus("idle");
      toast("SOS Cancelled", { className: "hardware-card border-border text-foreground" });
    }
  };

  // Cleanup timers on unmount
  useEffect(() => {
     return () => {
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
     };
  }, []);

  return (
    <div className="bg-card/90 dark:bg-black/60 border border-black/10 dark:border-white/10 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-md p-5 flex flex-col gap-4 h-full relative overflow-hidden">
      {/* Premium subtle background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[250px] h-[250px] bg-red-500/10 rounded-full blur-[80px] pointer-events-none" />

      <div className="flex justify-between items-start relative z-10 border-b border-black/5 dark:border-white/5 pb-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-foreground drop-shadow-sm">SOS COMMAND</h2>
          <span className="text-[10px] font-bold text-muted-foreground tracking-[0.2em] uppercase leading-none block mt-1">AI EMERGENCY NETWORK</span>
        </div>
        <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="icon"
              onClick={() => setIsManagingProfile(!isManagingProfile)}
              className={cn(
                "w-9 h-9 bg-card/60 border-black/5 dark:border-white/5 text-muted-foreground hover:text-foreground hover:bg-black/20 dark:hover:bg-black/40 transition-all backdrop-blur-sm",
                isManagingProfile && "text-foreground border-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.2)]"
              )}
            >
              <Users className="w-4 h-4" />
            </Button>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-card/60 border border-black/5 dark:border-white/5 backdrop-blur-sm rounded-lg text-[9px] font-bold tracking-widest text-[#22C55E]">
              <ShieldCheck className="w-3.5 h-3.5" />
              SECURE
            </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {isManagingProfile ? (
          <motion.div 
            key="profile-management"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="flex-1 flex flex-col gap-4 overflow-y-auto"
          >
            <div className="flex justify-between items-center">
              <div className="flex gap-2">
                <button 
                  onClick={() => setProfileTab("contacts")}
                  className={cn(
                    "status-label px-2 py-1 rounded transition-colors",
                    profileTab === "contacts" ? "bg-red-500/20 text-red-500" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  CONTACTS
                </button>
                <button 
                  onClick={() => setProfileTab("medical")}
                  className={cn(
                    "status-label px-2 py-1 rounded transition-colors",
                    profileTab === "medical" ? "bg-red-500/20 text-red-500" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  MEDICAL
                </button>
              </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setIsManagingProfile(false)}
                  className="w-6 h-6 text-muted-foreground"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
  
              {profileTab === "contacts" ? (
                <>
                  <div className="space-y-3">
                    {contacts.map((contact, i) => (
                      <div key={i} className="p-3 bg-background border border-border rounded-lg flex justify-between items-center">
                        <div>
                          <div className="text-sm font-bold text-foreground">{contact.name}</div>
                          <div className="text-[10px] text-muted-foreground flex gap-2">
                            {contact.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {contact.phone}</span>}
                            {contact.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {contact.email}</span>}
                          </div>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => removeContact(i)}
                          className="w-6 h-6 text-red-500 hover:text-red-400"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
  
                  <div className="mt-auto p-4 bg-[#1A1B1E] border border-border rounded-lg space-y-3">
                    <span className="status-label">ADD NEW CONTACT</span>
                    <input 
                      placeholder="Name"
                      value={newContact.name}
                      onChange={e => setNewContact({...newContact, name: e.target.value})}
                      className="w-full bg-background border border-border rounded p-2 text-xs text-foreground outline-none focus:border-red-500"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input 
                        placeholder="Phone"
                        value={newContact.phone}
                        onChange={e => setNewContact({...newContact, phone: e.target.value})}
                        className="w-full bg-background border border-border rounded p-2 text-xs text-foreground outline-none focus:border-red-500"
                      />
                      <input 
                        placeholder="Email"
                        value={newContact.email}
                        onChange={e => setNewContact({...newContact, email: e.target.value})}
                        className="w-full bg-background border border-border rounded p-2 text-xs text-foreground outline-none focus:border-red-500"
                      />
                    </div>
                    <Button onClick={addContact} className="w-full bg-foreground text-background hover:bg-foreground/80 h-8 text-xs font-bold">
                      <Plus className="w-3.5 h-3.5 mr-1" /> ADD CONTACT
                    </Button>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <span className="status-label flex items-center gap-1"><Info className="w-3.5 h-3.5" /> BIO / IDENTIFICATION</span>
                    <textarea 
                      value={medicalProfile.bio}
                      onChange={e => setMedicalProfile({...medicalProfile, bio: e.target.value})}
                      placeholder="Brief description for responders..."
                      className="w-full bg-background border border-border rounded p-2 text-xs text-foreground outline-none focus:border-red-500 min-h-[60px] resize-none"
                    />
                  </div>
  
                  <div className="space-y-2">
                    <span className="status-label flex items-center gap-1"><Activity className="w-3.5 h-3.5" /> MEDICAL CONDITIONS</span>
                    <textarea 
                      value={medicalProfile.medicalConditions}
                      onChange={e => setMedicalProfile({...medicalProfile, medicalConditions: e.target.value})}
                      placeholder="Allergies, chronic illnesses, medications..."
                      className="w-full bg-background border border-border rounded p-2 text-xs text-foreground outline-none focus:border-red-500 min-h-[80px] resize-none"
                    />
                  </div>
  
                  <div className="space-y-2">
                    <span className="status-label">BLOOD TYPE</span>
                    <select 
                      value={medicalProfile.bloodType}
                      onChange={e => setMedicalProfile({...medicalProfile, bloodType: e.target.value})}
                      className="w-full bg-background border border-border rounded p-2 text-xs text-foreground outline-none focus:border-red-500"
                    >
                      <option value="">Select Blood Type</option>
                      {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>
  
                  <Button 
                    onClick={saveMedicalProfile}
                    className="w-full bg-red-500 text-foreground hover:bg-red-400 h-10 text-xs font-bold mt-4"
                  >
                    <Save className="w-3.5 h-3.5 mr-2" /> SAVE MEDICAL PROFILE
                  </Button>
                </div>
              )}
          </motion.div>
        ) : (
          <motion.div 
            key="sos-main"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex-1 flex flex-col items-center justify-center gap-6 py-4 mt-4"
          >
            {countdown !== null ? (
              <div className="flex flex-col items-center justify-center gap-6 relative z-10 w-full h-full flex-1">
                 <div className="relative mt-8">
                   <motion.div
                     animate={{ scale: [1, 1.5, 2], opacity: [0.8, 0.4, 0] }}
                     transition={{ duration: 1, repeat: Infinity, ease: "easeOut" }}
                     className="absolute inset-0 rounded-full bg-red-500/30"
                   />
                   <motion.button
                     animate={{ scale: [1, 1.05, 1], borderColor: ["rgba(239,68,68,0.2)", "rgba(239,68,68,1)", "rgba(239,68,68,0.2)"] }}
                     transition={{ duration: 1, repeat: Infinity }}
                     className="relative w-36 h-36 md:w-44 md:h-44 rounded-full flex items-center justify-center border-[3px] border-red-500 bg-gradient-to-b from-red-500/20 to-transparent backdrop-blur-md shadow-[0_0_40px_rgba(239,68,68,0.3)]"
                   >
                     <span className="font-mono text-foreground text-7xl font-bold tracking-tighter drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]">
                       {countdown}
                     </span>
                   </motion.button>
                 </div>
                 <div className="flex flex-col items-center gap-3">
                   <Button 
                     onClick={cancelSOS}
                     variant="outline"
                     className="border-red-500/50 bg-background/80 text-foreground hover:bg-red-500 hover:text-foreground transition-all min-w-[140px] h-12 rounded-full font-bold tracking-[0.2em] shadow-[0_0_15px_rgba(239,68,68,0.2)]"
                   >
                     CANCEL
                   </Button>
                   <p className="text-muted-foreground text-[9px] uppercase font-bold tracking-[0.2em] mt-2 text-center max-w-[220px]">
                     SOS WILL DISPATCH AUTOMATICALLY
                   </p>
                 </div>
              </div>
            ) : (
              <>
              <div className="flex items-center justify-center flex-1 relative w-full h-full z-10">
                {/* Background rings */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                   <div className="w-[85%] aspect-square rounded-full border border-black/5 dark:border-white/5 absolute" />
                   <div className="w-[60%] aspect-square rounded-full border border-black/5 dark:border-white/5 border-dashed opacity-50 absolute" />
                   <div className="w-[35%] aspect-square rounded-full border border-black/5 dark:border-white/5 absolute" />
                </div>
                
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onPointerDown={async () => {
                     if (!isRecording) await startRecording();
                  }}
                  onPointerUp={async () => {
                     if (isRecording) await stopRecordingAndLaunchCountdown();
                  }}
                  className={cn(
                    "relative w-40 h-40 md:w-48 md:h-48 rounded-full flex items-center justify-center transition-all duration-300 cursor-pointer z-20 group",
                    isRecording 
                      ? "bg-gradient-to-b from-red-600 to-red-700 shadow-[inset_0_-8px_15px_rgba(0,0,0,0.4),0_0_60px_rgba(220,38,38,0.8)] border border-red-400/30 scale-95" 
                      : "bg-gradient-to-b from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 shadow-[inset_0_-8px_15px_rgba(0,0,0,0.3),_0_0_40px_rgba(239,68,68,0.4)] border border-red-400/20"
                  )}
                  style={{ touchAction: 'none' }}
                >
                  <div className={cn("absolute inset-0 rounded-full border border-white/30 mix-blend-overlay", !isRecording && "group-hover:animate-ping opacity-30")} />
                  {isRecording && (
                     <motion.div
                       animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
                       transition={{ duration: 1.5, repeat: Infinity }}
                       className="absolute inset-0 rounded-full bg-red-400/40 pointer-events-none"
                     />
                  )}
                  <div className="flex flex-col items-center gap-2 z-10">
                    {isRecording ? (
                      <Volume2 className="w-12 h-12 text-foreground animate-pulse drop-shadow-lg" />
                    ) : (
                      <Mic className="w-11 h-11 text-foreground drop-shadow-md transition-transform group-hover:scale-110" />
                    )}
                    <span className="font-bold text-foreground tracking-[0.2em] text-xs mt-1 drop-shadow-sm">
                      {isRecording ? "TRANSMITTING" : "HOLD SOS"}
                    </span>
                  </div>
                </motion.button>
              </div>
    
              <div className="w-full space-y-2 mt-auto relative z-10">
                <span className="text-[10px] font-bold text-muted-foreground tracking-[0.2em] uppercase text-center block w-full mb-2">AI CAPTURE</span>
                <div className="min-h-[60px] p-4 bg-background/60 border border-black/5 dark:border-white/5 rounded-xl backdrop-blur-sm shadow-inner font-mono text-[11px] text-muted-foreground leading-relaxed text-center flex items-center justify-center">
                  {status === "recording" && (
                    <motion.div
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ repeat: Infinity, duration: 1.5 }}
                      className="flex items-center gap-2 text-foreground"
                    >
                      <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_5px_red]" />
                      Recording audio payload...
                    </motion.div>
                  )}
                  {status === "idle" && countdown !== null && (
                    extractedTranscript ? (
                      <span className="text-foreground text-sm">"{extractedTranscript}"</span>
                    ) : (
                      <motion.div
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                        className="flex items-center gap-2 text-foreground"
                      >
                        <div className="w-3.5 h-3.5 border-[2px] border-white/30 border-t-white rounded-full animate-spin" />
                        Analyzing voice payload...
                      </motion.div>
                    )
                  )}
                  {status === "processing" && (
                    <div className="flex items-center gap-2 text-foreground">
                       <div className="w-3.5 h-3.5 border-[2px] border-white/30 border-t-white rounded-full animate-spin" />
                       Dispatching SOS...
                    </div>
                  )}
                  {status === "sent" && <span className="text-[#22C55E] flex items-center gap-2 font-bold text-xs"><ShieldCheck className="w-4 h-4" /> {sentMessage}</span>}
                  {status === "idle" && countdown === null && (sentMessage ? <span className="text-[#22C55E] font-bold tracking-widest text-[10px]">SOS SIGNAL DELIVERED SECURELY</span> : <span className="opacity-60">Ready to record emergency payload.</span>)}
                </div>
                {status === "idle" && countdown === null && (
                  <div className="flex bg-background/60 border border-black/5 dark:border-white/5 rounded-xl backdrop-blur-sm mt-3 overflow-hidden shadow-inner">
                    <input
                      type="text"
                      value={customMessage}
                      onChange={(e) => setCustomMessage(e.target.value)}
                      placeholder="Or type a custom emergency message..."
                      className="flex-1 bg-transparent px-4 py-3 text-xs text-foreground outline-none placeholder:text-muted-foreground/50 font-mono"
                    />
                    <button 
                      onClick={() => {
                          if (customMessage.trim()) {
                              sendSOS('text', undefined, customMessage);
                              setCustomMessage('');
                          } else {
                              sendSOS('silent');
                          }
                      }}
                      className="bg-red-500/10 hover:bg-red-500/30 text-red-500 transition-colors px-4 py-3 flex items-center justify-center font-bold text-[10px] tracking-widest border-l border-black/5 dark:border-white/5"
                    >
                      SEND <Send className="w-3 h-3 ml-1.5" />
                    </button>
                  </div>
                )}
              </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
