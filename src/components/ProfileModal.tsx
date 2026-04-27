import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUserProfile, EmergencyContact } from '../hooks/useUserProfile';
import { User, Plus, Trash2, Save, UserCircle } from 'lucide-react';
import { auth } from '../lib/firebase';
import { toast } from 'sonner';

export const ProfileModal = () => {
  const { profile, loading, updateProfile } = useUserProfile();
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    medicalInfo: { bloodGroup: '', allergies: '', conditions: '' },
  });
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);

  useEffect(() => {
    if (profile) {
      setFormData({
        name: profile.name || '',
        phone: profile.phone || '',
        medicalInfo: profile.medicalInfo || { bloodGroup: '', allergies: '', conditions: '' },
      });
      setContacts(profile.emergencyContacts || []);
    }
  }, [profile]);

  const handleSave = async () => {
    try {
      await updateProfile({
        ...formData,
        emergencyContacts: contacts,
      });
      toast.success('Profile updated successfully');
      setOpen(false);
    } catch (error) {
      toast.error('Failed to update profile');
    }
  };

  const addContact = () => {
    setContacts([...contacts, { name: '', phone: '', relation: '' }]);
  };

  const removeContact = (index: number) => {
    const newContacts = [...contacts];
    newContacts.splice(index, 1);
    setContacts(newContacts);
  };

  const updateContact = (index: number, field: keyof EmergencyContact, value: string) => {
    const newContacts = [...contacts];
    newContacts[index] = { ...newContacts[index], [field]: value };
    setContacts(newContacts);
  };

  const completion = (() => {
    if (!profile) return 0;
    let score = 0;
    if (profile.name) score += 25;
    if (profile.phone) score += 25;
    if (profile.emergencyContacts && profile.emergencyContacts.length > 0) score += 25;
    if (profile.medicalInfo && (profile.medicalInfo.bloodGroup || profile.medicalInfo.allergies || profile.medicalInfo.conditions)) score += 25;
    return score;
  })();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={
        <button className="relative w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center flex-shrink-0 cursor-pointer outline-none hover:opacity-80 transition-opacity" title={`Profile ${completion}% Complete`}>
          <svg className="absolute inset-0 w-full h-full transform -rotate-90 pointer-events-none" viewBox="0 0 36 36">
            <path 
              className="text-[#2A2C32]"
              strokeWidth="2.5"
              stroke="currentColor"
              fill="none"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" 
            />
            <path 
              className={completion === 100 ? "text-green-500" : "text-yellow-500"}
              strokeDasharray={`${completion}, 100`}
              strokeWidth="2.5"
              strokeDashoffset="0"
              stroke="currentColor"
              fill="none"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" 
            />
          </svg>
          <div className="absolute inset-0 m-auto w-[26px] h-[26px] sm:w-[30px] sm:h-[30px] rounded-full bg-card overflow-hidden flex items-center justify-center">
            {auth.currentUser?.photoURL ? (
              <img src={auth.currentUser.photoURL} alt="User" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <User className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </button>
      } />
      
      <DialogContent className="bg-card/90 text-foreground border-border sm:max-w-[500px] max-h-[85vh] overflow-y-auto hardware-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading text-2xl tracking-wide uppercase">
            <UserCircle className="w-6 h-6 text-red-500" />
            Operator Profile
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground">Loading profile...</div>
        ) : (
          <div className="space-y-6 py-4">
            {/* Basic Info */}
            <div className="space-y-4">
              <h3 className="status-label">Personal Information</h3>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs text-muted-foreground">Email (Read-only)</Label>
                <Input 
                  id="email" 
                  value={profile?.email || ''} 
                  disabled 
                  className="bg-background border-border text-foreground" 
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-xs text-muted-foreground">Full Name</Label>
                  <Input 
                    id="name" 
                    value={formData.name} 
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="bg-background border-border text-foreground" 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-xs text-muted-foreground">Phone Number</Label>
                  <Input 
                    id="phone" 
                    value={formData.phone} 
                    onChange={e => setFormData({...formData, phone: e.target.value})}
                    className="bg-background border-border text-foreground" 
                  />
                </div>
              </div>
            </div>

            {/* Medical Info */}
            <div className="space-y-4">
              <h3 className="status-label">Medical Data</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="blood" className="text-xs text-muted-foreground">Blood Group</Label>
                  <Input 
                    id="blood" 
                    value={formData.medicalInfo.bloodGroup} 
                    onChange={e => setFormData({...formData, medicalInfo: {...formData.medicalInfo, bloodGroup: e.target.value}})}
                    className="bg-background border-border text-foreground uppercase" 
                    placeholder="e.g. O+"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="allergies" className="text-xs text-muted-foreground">Allergies</Label>
                  <Input 
                    id="allergies" 
                    value={formData.medicalInfo.allergies} 
                    onChange={e => setFormData({...formData, medicalInfo: {...formData.medicalInfo, allergies: e.target.value}})}
                    className="bg-background border-border text-foreground" 
                    placeholder="None known"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="conditions" className="text-xs text-muted-foreground">Medical Conditions</Label>
                  <Input 
                    id="conditions" 
                    value={formData.medicalInfo.conditions} 
                    onChange={e => setFormData({...formData, medicalInfo: {...formData.medicalInfo, conditions: e.target.value}})}
                    className="bg-background border-border text-foreground" 
                  />
                </div>
              </div>
            </div>

            {/* Emergency Contacts */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="status-label">Emergency Contacts</h3>
                <Button size="sm" variant="outline" onClick={addContact} className="h-7 text-xs bg-muted dark:bg-muted/80 border-border hover:bg-[#3A3C42] text-foreground">
                  <Plus className="w-3 h-3 mr-1" /> Add
                </Button>
              </div>
              
              {contacts.length === 0 ? (
                <div className="text-xs text-muted-foreground p-4 border border-dashed border-border rounded text-center">
                  No emergency contacts defined
                </div>
              ) : (
                <div className="space-y-3">
                  {contacts.map((contact, idx) => (
                    <div key={idx} className="p-3 bg-background border border-border rounded flex flex-col gap-2 relative">
                      <button 
                        onClick={() => removeContact(idx)}
                        className="absolute right-2 top-2 text-muted-foreground hover:text-red-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <div className="grid grid-cols-2 gap-2 pr-6">
                        <Input 
                          placeholder="Name" 
                          value={contact.name} 
                          onChange={(e) => updateContact(idx, 'name', e.target.value)}
                          className="bg-card border-border h-8 text-xs text-foreground" 
                        />
                        <Input 
                          placeholder="Relation" 
                          value={contact.relation} 
                          onChange={(e) => updateContact(idx, 'relation', e.target.value)}
                          className="bg-card border-border h-8 text-xs text-foreground" 
                        />
                        <Input 
                          placeholder="Phone" 
                          className="col-span-2 bg-card border-border h-8 text-xs text-foreground"
                          value={contact.phone} 
                          onChange={(e) => updateContact(idx, 'phone', e.target.value)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Button onClick={handleSave} className="w-full bg-red-600 hover:bg-red-700 text-foreground font-bold tracking-widest">
              <Save className="w-4 h-4 mr-2" />
              SAVE PROFILE
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
