import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { db, auth, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useSOS } from '@/src/hooks/useSOS';
import { useVoiceRecorder } from '@/src/hooks/useVoiceRecorder';
import { Users, ShieldCheck, X, Phone, Mail, Plus, Info, Activity, Save, Volume2, Mic, AlertTriangle, Send } from 'lucide-react';

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
  const { startRecording: startVoiceRecording, stopRecording: stopVoiceRecording, transcript: liveTranscript, isRecording, isSupported } = useVoiceRecorder();
  
  const [status, setStatus] = useState<"idle" | "recording" | "processing" | "sent">("idle");
  const [sentMessage, setSentMessage] = useState("");
    const [isManagingProfile, setIsManagingProfile] = useState(false);
  const [profileTab, setProfileTab] = useState<"contacts" | "medical">("contacts");
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  
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
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        emergencyContacts: updatedContacts,
        lastActive: serverTimestamp()
      });
      setContacts(updatedContacts);
      toast.success("Contacts updated successfully");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${auth.currentUser.uid}`);
    }
  };

  const saveMedicalProfile = async () => {
    if (!auth.currentUser) return;
    try {
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        ...medicalProfile,
        lastActive: serverTimestamp()
      });
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
        className: "hardware-card border-red-500/50 text-white",
      });
    } catch (err) {
      console.error("Failed to start recording", err);
      toast.error("Microphone access denied or unavailable.");
    }
  };

  const sendSOS = async (type: 'voice' | 'silent' | 'text', audioBlob?: Blob, speechText?: string) => {
    setStatus("processing");
    try {
      let emergencyMessage = "";
      if (type === 'voice') {
        emergencyMessage = speechText || "Emergency! Voice recording attached. Need immediate assistance.";
      } else if (type === 'silent') {
        emergencyMessage = "SILENT SOS TRIGGERED. User cannot speak. Immediate assistance required at location.";
      } else {
        emergencyMessage = "Emergency! Immediate assistance required at location.";
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
        className: "hardware-card border-green-500/50 text-white",
      });

      setTimeout(() => setStatus("idle"), 3000); // Reset UI after 3s
    } catch (error) {
      console.error("Error sending SOS:", error);
      setStatus("idle");
      toast.error("Critical error scheduling SOS");
    }
  };

  const stopRecordingAndLaunchCountdown = async () => {
    try {
      const { audioBlob, finalTranscript } = await stopVoiceRecording();
      // Start 5-second countdown instead of sending instantly.
      setCountdown(5);
      
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
      toast("SOS Cancelled", { className: "hardware-card border-[#3A3C42] text-white" });
    }
  };

  const handleSOS = async () => {
    if (isRecording) {
      await stopRecordingAndLaunchCountdown();
    } else {
      await startRecording();
    }
  };

  // Cleanup timers on unmount
  useEffect(() => {
     return () => {
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
     };
  }, []);

  return (
    <div className="hardware-card p-4 md:p-5 flex flex-col gap-4 h-full relative overflow-hidden">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-lg md:text-xl font-bold tracking-tight text-white">SOS COMMAND</h2>
          <span className="status-label">AI EMERGENCY NETWORK</span>
        </div>
        <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="icon"
              onClick={() => setIsManagingProfile(!isManagingProfile)}
              className={cn(
                "w-8 h-8 bg-[#2A2C32] border-[#3A3C42] text-[#8E9299] hover:text-white transition-colors",
                isManagingProfile && "text-white border-red-500/50"
              )}
            >
              <Users className="w-[18px] h-[18px]" />
            </Button>
            <div className="flex items-center gap-1 px-2 py-1 bg-[#2A2C32] rounded text-[8px] font-mono text-green-500">
              <ShieldCheck className="w-3 h-3" />
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
                    profileTab === "contacts" ? "bg-red-500/20 text-red-500" : "text-[#8E9299] hover:text-white"
                  )}
                >
                  CONTACTS
                </button>
                <button 
                  onClick={() => setProfileTab("medical")}
                  className={cn(
                    "status-label px-2 py-1 rounded transition-colors",
                    profileTab === "medical" ? "bg-red-500/20 text-red-500" : "text-[#8E9299] hover:text-white"
                  )}
                >
                  MEDICAL
                </button>
              </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setIsManagingProfile(false)}
                  className="w-6 h-6 text-[#8E9299]"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
  
              {profileTab === "contacts" ? (
                <>
                  <div className="space-y-3">
                    {contacts.map((contact, i) => (
                      <div key={i} className="p-3 bg-[#0A0A0B] border border-[#2A2C32] rounded-lg flex justify-between items-center">
                        <div>
                          <div className="text-sm font-bold text-white">{contact.name}</div>
                          <div className="text-[10px] text-[#8E9299] flex gap-2">
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
  
                  <div className="mt-auto p-4 bg-[#1A1B1E] border border-[#2A2C32] rounded-lg space-y-3">
                    <span className="status-label">ADD NEW CONTACT</span>
                    <input 
                      placeholder="Name"
                      value={newContact.name}
                      onChange={e => setNewContact({...newContact, name: e.target.value})}
                      className="w-full bg-[#0A0A0B] border border-[#2A2C32] rounded p-2 text-xs text-white outline-none focus:border-red-500"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input 
                        placeholder="Phone"
                        value={newContact.phone}
                        onChange={e => setNewContact({...newContact, phone: e.target.value})}
                        className="w-full bg-[#0A0A0B] border border-[#2A2C32] rounded p-2 text-xs text-white outline-none focus:border-red-500"
                      />
                      <input 
                        placeholder="Email"
                        value={newContact.email}
                        onChange={e => setNewContact({...newContact, email: e.target.value})}
                        className="w-full bg-[#0A0A0B] border border-[#2A2C32] rounded p-2 text-xs text-white outline-none focus:border-red-500"
                      />
                    </div>
                    <Button onClick={addContact} className="w-full bg-white text-black hover:bg-gray-200 h-8 text-xs font-bold">
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
                      className="w-full bg-[#0A0A0B] border border-[#2A2C32] rounded p-2 text-xs text-white outline-none focus:border-red-500 min-h-[60px] resize-none"
                    />
                  </div>
  
                  <div className="space-y-2">
                    <span className="status-label flex items-center gap-1"><Activity className="w-3.5 h-3.5" /> MEDICAL CONDITIONS</span>
                    <textarea 
                      value={medicalProfile.medicalConditions}
                      onChange={e => setMedicalProfile({...medicalProfile, medicalConditions: e.target.value})}
                      placeholder="Allergies, chronic illnesses, medications..."
                      className="w-full bg-[#0A0A0B] border border-[#2A2C32] rounded p-2 text-xs text-white outline-none focus:border-red-500 min-h-[80px] resize-none"
                    />
                  </div>
  
                  <div className="space-y-2">
                    <span className="status-label">BLOOD TYPE</span>
                    <select 
                      value={medicalProfile.bloodType}
                      onChange={e => setMedicalProfile({...medicalProfile, bloodType: e.target.value})}
                      className="w-full bg-[#0A0A0B] border border-[#2A2C32] rounded p-2 text-xs text-white outline-none focus:border-red-500"
                    >
                      <option value="">Select Blood Type</option>
                      {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>
  
                  <Button 
                    onClick={saveMedicalProfile}
                    className="w-full bg-red-500 text-white hover:bg-red-400 h-10 text-xs font-bold mt-4"
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
              <div className="flex flex-col items-center gap-4">
                 <motion.button
                   animate={{ scale: [1, 1.05, 1], borderColor: ["rgba(239,68,68,0)", "rgba(239,68,68,1)", "rgba(239,68,68,0)"] }}
                   transition={{ duration: 1, repeat: Infinity }}
                   className="relative w-32 h-32 md:w-36 md:h-36 rounded-full flex items-center justify-center border-[3px] border-red-500 bg-red-500/10"
                 >
                   <span className="font-bold text-red-500 text-6xl tracking-tighter">
                     {countdown}
                   </span>
                 </motion.button>
                 <Button 
                   onClick={cancelSOS}
                   variant="outline"
                   className="mt-4 border-[#3A3C42] text-white hover:bg-white hover:text-black hover:border-white transition-all min-w-[120px] font-bold tracking-widest"
                 >
                   CANCEL
                 </Button>
                 <p className="text-[#8E9299] text-[10px] uppercase font-mono mt-2 tracking-widest text-center max-w-[200px]">
                   SOS WILL DISPATCH AUTOMATICALLY WHEN TIMER ENDS
                 </p>
              </div>
            ) : (
              <>
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
                    "relative w-32 h-32 md:w-36 md:h-36 rounded-full flex items-center justify-center transition-all duration-500 cursor-pointer",
                    isRecording ? "bg-red-600 shadow-[0_0_40px_rgba(220,38,38,0.7)]" : "bg-red-500 hover:bg-red-400 shadow-[0_0_20px_rgba(239,68,68,0.4)]"
                  )}
                >
                  <div className={cn("absolute inset-0 rounded-full border border-white/20", !isRecording && "animate-ping opacity-20")} />
                  <div className="flex flex-col items-center gap-1.5 z-10">
                    {isRecording ? (
                      <Volume2 className="w-10 h-10 text-white animate-pulse" />
                    ) : (
                      <Mic className="w-10 h-10 text-white" />
                    )}
                    <span className="font-bold text-white tracking-widest text-xs mt-1">
                      {isRecording ? "TRANSMITTING" : "HOLD SOS"}
                    </span>
                  </div>
                </motion.button>
    
                <div className="w-full space-y-1.5 mt-auto">
                  <span className="status-label text-[10px] text-center block w-full">AI TRANSCRIPT {isSupported ? '(LIVE)' : ''}</span>
                  <div className="min-h-[40px] p-3 border-t border-[#2A2C32] font-mono text-[11px] text-[#8E9299] leading-relaxed text-center flex items-center justify-center">
                    {status === "recording" && (
                      <>
                        {liveTranscript ? <span className="text-white">"{liveTranscript}"</span> : (
                          <motion.div
                            animate={{ opacity: [0.3, 1, 0.3] }}
                            transition={{ repeat: Infinity, duration: 1.5 }}
                          >
                            Listening for emergency voice command...
                          </motion.div>
                        )}
                      </>
                    )}
                    {status === "processing" && "Uploading voice data & analyzing..."}
                    {status === "sent" && <span className="text-green-500">{sentMessage}</span>}
                    {status === "idle" && (sentMessage ? <span className="text-green-500">SOS SIGNAL DELIVERED</span> : "No active SOS signal detected.")}
                  </div>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
