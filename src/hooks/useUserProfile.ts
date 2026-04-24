import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';

export interface EmergencyContact {
  name: string;
  phone: string;
  relation: string;
}

export interface MedicalInfo {
  bloodGroup: string;
  allergies: string;
  conditions: string;
}

export interface UserProfile {
  name: string;
  phone: string;
  email: string | null;
  emergencyContacts: EmergencyContact[];
  medicalInfo: MedicalInfo;
  profileComplete: boolean;
}

export const useUserProfile = () => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!auth.currentUser) return;
      
      try {
        const docRef = doc(db, 'users', auth.currentUser.uid);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          setProfile({
            name: data.name || auth.currentUser.displayName || '',
            phone: data.phone || auth.currentUser.phoneNumber || '',
            email: data.email || auth.currentUser.email || '',
            emergencyContacts: data.emergencyContacts || [],
            medicalInfo: data.medicalInfo || { bloodGroup: '', allergies: '', conditions: '' },
            profileComplete: !!data.profileComplete,
          });
        } else {
          // Initialize empty profile
          const initialProfile = {
            uid: auth.currentUser.uid, // Required by rules
            role: 'user', // Required by rules
            name: auth.currentUser.displayName || '',
            phone: auth.currentUser.phoneNumber || '',
            email: auth.currentUser.email || '',
            emergencyContacts: [],
            medicalInfo: { bloodGroup: '', allergies: '', conditions: '' },
            profileComplete: false,
            lastActive: serverTimestamp(),
          };
          setProfile(initialProfile as any);
          await setDoc(docRef, initialProfile, { merge: true });
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `users/${auth.currentUser.uid}`);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (!auth.currentUser) return;
    try {
      const docRef = doc(db, 'users', auth.currentUser.uid);
      
      // Calculate profile completion
      const fullProfile = { ...profile, ...updates } as UserProfile;
      const isComplete = Boolean(
        fullProfile.name && 
        fullProfile.phone && 
        fullProfile.emergencyContacts.length > 0 &&
        fullProfile.medicalInfo.bloodGroup
      );

      const finalUpdates = { ...updates, profileComplete: isComplete, lastActive: serverTimestamp() };
      
      await updateDoc(docRef, finalUpdates);
      setProfile(prev => prev ? { ...prev, ...finalUpdates } : null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${auth.currentUser.uid}`);
      throw error;
    }
  };

  return { profile, loading, updateProfile };
};
