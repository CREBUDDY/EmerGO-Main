import { useTheme } from 'next-themes';
import { useEffect, useState, useRef } from 'react';
import { Radar } from './components/Radar';
import { SOSPanel } from './components/SOSPanel';
import { SystemStatus } from './components/SystemStatus';
import { MapDisplay } from './components/MapDisplay';
import { SOSHistory } from './components/SOSHistory';
import { NearbySOSFeed } from './components/NearbySOSFeed';
import { AutoSOSPanel } from './components/AutoSOSPanel';
import { HotspotsPanel } from './components/HotspotsPanel';
import { DashboardGrid } from './components/DashboardGrid';
import 'leaflet/dist/leaflet.css';
import { Toaster, toast } from 'sonner';
import { auth, db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, User as FirebaseUser } from 'firebase/auth';
import { doc, setDoc, updateDoc, getDoc, getDocs, writeBatch, collection, query, where, onSnapshot, arrayUnion, serverTimestamp, addDoc } from 'firebase/firestore';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { app } from '@/src/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getDeviceId } from '@/src/lib/device';
import { Shield, LogIn } from 'lucide-react';
import React, { Suspense } from 'react';

const ProfileModal = React.lazy(() => import('./components/ProfileModal').then(module => ({ default: module.ProfileModal })));
const SettingsModal = React.lazy(() => import('./components/SettingsModal').then(module => ({ default: module.SettingsModal })));
const NotificationDropdown = React.lazy(() => import('./components/NotificationDropdown').then(module => ({ default: module.NotificationDropdown })));

import { calculateDistance } from '@/src/lib/geo';

import { HeaderClock } from './components/HeaderClock';
import { NetworkModeIndicator } from './components/NetworkModeIndicator';
import { PermissionsModal } from './components/PermissionsModal';
import { MobileNavBar } from './components/MobileNavBar';
import { useCapacitorSetup } from './hooks/useCapacitorSetup';

import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { LocalNotifications } from '@capacitor/local-notifications';

import { LoadingProvider, useLoading } from './contexts/LoadingContext';
import { GlobalLoader } from './components/GlobalLoader';

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

function PublicTrackingView({ trackId }: { trackId: string }) {
  const { theme, resolvedTheme } = useTheme();
  const [eventData, setEventData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'sos_events', trackId), (docSnap) => {
      if (docSnap.exists()) {
        setEventData({ id: docSnap.id, ...docSnap.data() });
      } else {
        setEventData(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [trackId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-t-2 border-red-500 rounded-full" />
      </div>
    );
  }

  if (!eventData) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <Shield className="w-16 h-16 text-muted-foreground mb-4 opacity-50" />
        <h2 className="text-foreground text-xl font-bold tracking-widest uppercase mb-2">Event Not Found</h2>
        <p className="text-muted-foreground font-mono text-center">This SOS event may have been resolved or deleted.</p>
        <Button onClick={() => window.location.href = '/'} variant="outline" className="mt-8 border-border text-foreground">Return to Home</Button>
      </div>
    );
  }

  const sosIcon = new L.DivIcon({
    html: `<div style="width: 24px; height: 24px; background: #ef4444; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 15px rgba(239,68,68,0.6); display: flex; align-items: center; justify-content: center;"><div style="width: 6px; height: 6px; background: white; border-radius: 50%;"></div></div>`,
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

  return (
    <div className="w-screen h-screen relative bg-background">
      <div className="absolute top-4 left-4 z-[9999] bg-card/90 backdrop-blur-md p-4 rounded-xl border border-red-500/50 shadow-2xl max-w-sm">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-3 h-3 rounded-full animate-pulse bg-red-500" />
          <h2 className="text-red-500 font-bold tracking-widest text-sm uppercase">LIVE EMERGENCY TRACKING</h2>
        </div>
        <div className="space-y-2 text-xs font-mono">
          <div className="flex justify-between border-b border-border pb-2">
            <span className="text-muted-foreground">STATUS</span>
            <span className={eventData.isResolved ? 'text-green-500' : 'text-red-500 font-bold'}>
              {eventData.isResolved ? 'RESOLVED' : 'ACTIVE'}
            </span>
          </div>
          <div className="flex justify-between border-b border-border pb-2">
             <span className="text-muted-foreground">LAST UPDATED</span>
             <span className="text-foreground">{eventData.timestamp?.toMillis ? new Date(eventData.timestamp.toMillis()).toLocaleTimeString() : 'Just now'}</span>
          </div>
          <div className="pt-1">
             <span className="text-muted-foreground block mb-1">MESSAGE</span>
             <span className="text-foreground bg-black/10 dark:bg-black/40 p-2 rounded block border border-black/5 dark:border-white/5 break-words">
                {eventData.transcript || eventData.message || "Emergency Help Needed!"}
             </span>
          </div>
        </div>
      </div>
      
      <div className="w-full h-full">
        {typeof window !== 'undefined' && eventData.latitude && eventData.longitude && (
          <MapContainer 
            center={[eventData.latitude, eventData.longitude]} 
            zoom={15} 
            style={{ width: '100%', height: '100%' }}
            zoomControl={false}
          >
            <TileLayer
              attribution=""
              url={(resolvedTheme || theme) === 'light' ? "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" : "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"}
            />
            <Marker position={[eventData.latitude, eventData.longitude]} icon={sosIcon}>
               <Popup className="custom-popup">
                 <div className="font-bold text-red-500 text-center tracking-wide">EMERGENCY LOCATION</div>
                 <div className="text-[10px] text-center text-gray-500 mt-1">{eventData.latitude.toFixed(4)}, {eventData.longitude.toFixed(4)}</div>
               </Popup>
            </Marker>
          </MapContainer>
        )}
      </div>
    </div>
  );
}

function AppContent() {
  const trackId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('track') : null;

  useCapacitorSetup();
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const notifiedSosIds = useRef<Set<string>>(new Set());
  const { showLoading, hideLoading } = useLoading();
  
  useEffect(() => {
    if (user && !userLocation) {
        showLoading("Acquiring GPS Signal...");
    } else {
        hideLoading();
    }
  }, [user, userLocation]);

  // Auth states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  // Request Notification Permission and initialized FCM
  useEffect(() => {
    if ("Notification" in window) {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          console.log('Notification permission granted.');
          // Initialize FCM Token
          try {
             const messaging = getMessaging(app);
             getToken(messaging).then((currentToken) => {
               if (currentToken) {
                 console.log("FCM Token initialized (Ready for backend usage):", currentToken);
                 // We could dynamically save it to the user's document for a backend to consume
               }
             }).catch((err) => {
               console.log("An error occurred while retrieving token. ", err);
             });
             
             // Handle actual remote foreground pushes if a backend triggers them
             onMessage(messaging, (payload) => {
               console.log('Foreground FCM Message received. ', payload);
             });
          } catch (e) {
             console.warn("FCM setup skipped (requires further native config). Only local SW alerts will run.", e);
          }
        }
      });
    }

    // Listener for service worker focus messages
    const handleSWMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'FOCUS_MAP') {
        const { lat, lng } = event.data.payload;
        // The Map component would need via Context or global state to actually Pan to lat/lng.
        // For now, logging to demonstrate reception
        console.log(`FCM Click focus map at: ${lat}, ${lng}`);
      }
    };
    navigator.serviceWorker?.addEventListener('message', handleSWMessage);

    return () => {
      navigator.serviceWorker?.removeEventListener('message', handleSWMessage);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Ensure user document exists in Firestore
        const userRef = doc(db, 'users', user.uid);
        try {
          const snap = await getDoc(userRef);
          if (!snap.exists()) {
            await setDoc(userRef, {
              uid: user.uid,
              name: user.displayName || 'Unknown',
              email: user.email || '',
              photoUrl: user.photoURL || '',
              lastActive: serverTimestamp(),
              role: 'user'
            });
            console.log("User document created successfully");
          }
        } catch (e) {
          console.error("Failed to create user doc:", e);
          handleFirestoreError(e, OperationType.CREATE, `users/${user.uid}`);
        }
      }
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Real-time location tracking and broadcasting
  useEffect(() => {
    if (!user) return;

    let watchId: number;

    const updateLocation = async (position: GeolocationPosition) => {
      const { latitude, longitude } = position.coords;
      setUserLocation({ lat: latitude, lng: longitude });
      
      try {
        // 1. Update Node status for Radar visibility
        await setDoc(doc(db, 'nodes', user.uid), {
          id: user.uid,
          latitude,
          longitude,
          lastSeen: serverTimestamp(),
          isRelay: false,
          batteryLevel: 100, // Default for web, in mobile we'd get real battery
        }, { merge: true });

        // 2. Update User profile last active
        const userRef = doc(db, 'users', user.uid);
        // We can use a direct updateDoc if we want to be more efficient, 
        // but following original logic of checking existence if preferred (though updateDoc fails if not exists)
        await updateDoc(userRef, {
          lastActive: serverTimestamp()
        });

        // 3. Update any active SOS events for this user with new location
        const sosQuery = query(
          collection(db, 'sos_events'),
          where('userId', '==', user.uid),
          where('isResolved', '==', false)
        );
        const activeSosSnap = await getDocs(sosQuery);
        
        if (!activeSosSnap.empty) {
          const batch = writeBatch(db);
          activeSosSnap.docs.forEach((d) => {
             batch.update(d.ref, {
               latitude,
               longitude
             });
          });
          await batch.commit();
        }
      } catch (error) {
        // Silently handle background update errors in production usually, 
        // but for this task we should probably log them correctly as per directives
        console.error("Failed to broadcast location", error);
      }
    };

    let capWatchId: string | undefined;

    const setupLocation = async () => {
       if (Capacitor.isNativePlatform()) {
          try {
             capWatchId = await Geolocation.watchPosition(
               { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
               (position, error) => {
                 if (error) console.warn("Capacitor geolocation issue:", error);
                 if (position) {
                    updateLocation({ coords: { latitude: position.coords.latitude, longitude: position.coords.longitude } } as GeolocationPosition);
                 }
               }
             );
          } catch (e) {
             console.warn("Capacitor geolocation watch failed", e);
          }
       } else if ("geolocation" in navigator) {
          watchId = navigator.geolocation.watchPosition(
            updateLocation,
            (error) => console.warn("Geolocation warning:", error.message || error.code || "Unknown error"),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
          );
       }
    };
    
    setupLocation();

    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
      if (capWatchId) Geolocation.clearWatch({ id: capWatchId });
    };
  }, [user]);

  // Listen for new nearby SOS requests to trigger push notifications
  useEffect(() => {
    if (!user || !userLocation) return;
    
    const currentDeviceId = getDeviceId();

    const q = query(collection(db, 'sos_events'), where('isResolved', '==', false));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const sos = { id: change.doc.id, ...change.doc.data() } as any;
          
          // DO NOT notify for own device!
          if (sos.deviceId === currentDeviceId) return;
          
          // Ignore expired SOS (> 24h old)
          const now = Date.now();
          const MAX_AGE_MS = 24 * 60 * 60 * 1000;
          if (now - sos.timestamp > MAX_AGE_MS) return;
          
          // Don't notify for ones we've already notified about
          if (notifiedSosIds.current.has(sos.id)) return;
          
          // Check distance
          if (sos.latitude && sos.longitude) {
            const distance = calculateDistance(userLocation.lat, userLocation.lng, sos.latitude, sos.longitude);
            
            if (distance <= 10) { // Within 10km
              notifiedSosIds.current.add(sos.id);
              
              // Mark as delivered
              updateDoc(doc(db, 'sos_events', sos.id), {
                deliveredTo: arrayUnion(currentDeviceId),
                status: 'DELIVERED'
              }).catch(e => handleFirestoreError(e, OperationType.UPDATE, `sos_events/${sos.id}`));

              // Add to notifications collection manually
              addDoc(collection(db, 'notifications'), {
                userId: user.uid,
                type: 'SOS_ALERT',
                message: `NEARBY EMERGENCY: ${distance.toFixed(1)}km away. ${sos.message || sos.transcript}`,
                timestamp: serverTimestamp(),
                read: false
              }).catch(e => handleFirestoreError(e, OperationType.CREATE, 'notifications'));

              // Show in-app toast
              toast.error("NEARBY EMERGENCY DETECTED", {
                description: `${distance.toFixed(1)}km away: ${sos.message || sos.transcript}`,
                duration: 10000,
                className: "hardware-card border-red-500/50 text-foreground",
              });

              // Show push notification
              const notificationTitle = "🚨 Emergency Alert Nearby";
              const notificationBody = `${distance.toFixed(1)}km away: ${sos.transcript || sos.message || 'Help required.'}`;
              
              if (Capacitor.isNativePlatform()) {
                LocalNotifications.schedule({
                  notifications: [{
                    title: notificationTitle,
                    body: notificationBody,
                    id: Math.floor(Math.random() * 2147483647),
                    extra: { lat: sos.latitude, lng: sos.longitude }
                  }]
                });
              } else if ("Notification" in window && Notification.permission === "granted") {
                const notificationOptions = {
                  body: notificationBody,
                  icon: "/favicon.ico",
                  vibrate: [200, 100, 200, 100, 200, 100, 200], // SOS pattern
                  requireInteraction: true,
                  data: { lat: sos.latitude, lng: sos.longitude }
                };

                // Play custom local sound (since Audio Context easily lets us bypass some sound limitations when active)
                const playSound = () => {
                  try {
                    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
                    const oscillator = audioCtx.createOscillator();
                    const gainNode = audioCtx.createGain();
                    oscillator.connect(gainNode);
                    gainNode.connect(audioCtx.destination);
                    oscillator.type = 'square';
                    oscillator.frequency.setValueAtTime(800, audioCtx.currentTime); // 800Hz beep
                    oscillator.frequency.setValueAtTime(1200, audioCtx.currentTime + 0.5); // 1200Hz
                    gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1.5);
                    oscillator.start(audioCtx.currentTime);
                    oscillator.stop(audioCtx.currentTime + 1.5);
                  } catch(e) {
                    console.warn("Audio Context sound failed", e);
                  }
                };
                playSound();

                // If ServiceWorker is active, use it for the notification so handles work nicely
                navigator.serviceWorker?.ready.then(registration => {
                   registration.showNotification(notificationTitle, notificationOptions);
                }).catch(() => {
                   // Fallback to classic window Object
                   const n = new Notification(notificationTitle, notificationOptions);
                   n.onclick = () => {
                     window.focus();
                     // Trigger focus event locally
                     window.dispatchEvent(new CustomEvent('FOCUS_MAP', { detail: { lat: sos.latitude, lng: sos.longitude } }));
                   };
                });
              }
            }
          }
        }
      });
    }, (error) => {
      console.error("SOS Notification listener error:", error);
    });

    return () => unsubscribe();
  }, [user, userLocation]);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (error: any) {
      console.error("Auth failed", error);
      setAuthError(error.message || 'Authentication failed');
    } finally {
      setAuthLoading(false);
    }
  };

  if (trackId) {
    return <PublicTrackingView trackId={trackId} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-foreground font-mono animate-pulse">INITIALIZING AESN SECURE LINK...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="hardware-card p-8 max-w-md w-full space-y-6">
          <div className="text-center space-y-2 flex flex-col items-center">
            <div className="w-16 h-16 bg-green-500 rounded-2xl mx-auto flex items-center justify-center shadow-[0_0_20px_rgba(34,197,94,0.4)] mb-4">
              <Shield className="w-8 h-8 text-foreground" />
            </div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight uppercase flex items-center justify-center gap-2">
              AUTO SOS ACCESS
              <Shield className="w-5 h-5 text-green-500" />
            </h1>
            <p className="status-label">PREMIUM EMERGENCY NETWORK</p>
          </div>
          
          {authError && (
            <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 text-red-500 text-xs font-mono text-center">
              {authError}
            </div>
          )}

          <form onSubmit={handleEmailAuth} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground font-mono tracking-wider ml-1">OPERATOR EMAIL</Label>
              <Input 
                type="email" 
                placeholder="Secure Link Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-background border-border text-foreground focus-visible:ring-green-500 placeholder:text-muted-foreground/30 h-12"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground font-mono tracking-wider ml-1">PASSCODE / ENCRYPTION KEY</Label>
              <Input 
                type="password" 
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-background border-border text-foreground focus-visible:ring-green-500 placeholder:text-muted-foreground/30 h-12"
              />
            </div>
            
            <Button 
              type="submit"
              disabled={authLoading}
              className="w-full bg-green-500 hover:bg-green-600 text-foreground h-12 text-sm font-bold tracking-widest mt-6"
            >
              {authLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn className="w-5 h-5 mr-2" />
                  {isSignUp ? 'INITIALIZE SECURE LINK' : 'AUTHENTICATE'}
                </>
              )}
            </Button>
          </form>

          <div className="pt-4 border-t border-border text-center space-y-4">
            <button 
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setAuthError('');
              }}
              className="text-muted-foreground hover:text-foreground text-xs font-mono transition-colors"
            >
              {isSignUp ? 'ALREADY REGISTERED? INITIATE LOGIN' : 'REQUIRE ACCESS? REQUEST PREMIUM LINK'}
            </button>
            <p className="text-[10px] font-mono text-muted-foreground opacity-50 max-w-[250px] mx-auto leading-relaxed">
              BY {isSignUp ? 'INITIALIZING' : 'AUTHENTICATING'}, YOU AGREE TO EMERGENCY DATA SHARING PROTOCOLS.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 font-sans pb-20 sm:pb-8 relative">
      <Toaster position="top-right" theme="dark" />
      <PermissionsModal />
      <MobileNavBar />
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between hardware-card p-3 sm:p-4 px-4 sm:px-6 gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-green-500 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(34,197,94,0.4)] flex-shrink-0">
              <Shield className="w-4 h-4 sm:w-6 sm:h-6 text-foreground" />
            </div>
            <div className="min-w-0 flex items-center gap-4">
              <div>
                <h1 className="text-sm sm:text-base font-bold text-foreground tracking-tight truncate uppercase flex items-center gap-2">
                  AUTO SOS
                  <Shield className="w-4 h-4 text-green-500" />
                </h1>
                <span className="status-label block truncate !text-[8.5px] sm:!text-[10px]">SECURE EMERGENCY NETWORK v1.0</span>
              </div>
              <div className="hidden sm:block">
                <NetworkModeIndicator />
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-1 sm:gap-4 flex-shrink-0">
            <div className="hidden lg:flex items-center gap-6 mr-6">
              <div className="flex flex-col items-end">
                <span className="status-label">OPERATOR</span>
                <span className="data-value">{user.displayName?.toUpperCase() || 'UNKNOWN'}</span>
              </div>
              <HeaderClock />
            </div>
            <Suspense fallback={<div className="w-8 h-8 rounded-full bg-card animate-pulse" />}>
              <div className="flex items-center gap-2 sm:gap-4">
                <NotificationDropdown />
                <SettingsModal />
                <ProfileModal />
              </div>
            </Suspense>
          </div>
        </header>

        {/* System Status Row */}
        <SystemStatus />

        {/* Main Grid */}
        <DashboardGrid
          left={
            <>
              <SOSPanel />
              <AutoSOSPanel />
              <Radar />
            </>
          }
          right={
            <div className="flex flex-col gap-[16px] w-full h-full">
              <div className="w-full h-[400px] lg:h-[500px] xl:h-[600px] flex-shrink-0">
                <MapDisplay />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-[16px] flex-1">
                <NearbySOSFeed userLocation={userLocation} />
                <SOSHistory />
              </div>
              <HotspotsPanel userLatitude={userLocation?.lat || null} userLongitude={userLocation?.lng || null} />
            </div>
          }
        />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <LoadingProvider>
      <GlobalLoader />
      <AppContent />
    </LoadingProvider>
  );
}
