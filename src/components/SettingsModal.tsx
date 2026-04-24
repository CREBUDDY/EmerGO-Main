import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { usePermissions } from '../hooks/usePermissions';
import { Settings, Mic, MapPin, Bell, Activity, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const SettingsModal = () => {
  const { permissions, requestMicrophone, requestGeolocation, requestNotifications } = usePermissions();
  const [open, setOpen] = useState(false);

  // Read local settings if any (e.g. sensitivity)
  const [autoSosEnabled, setAutoSosEnabled] = useState(true);
  const [sensitivity, setSensitivity] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM');

  const renderPermission = (
    label: string, 
    icon: React.ReactNode, 
    status: string, 
    requestFn: () => void,
    description: string
  ) => {
    const isGranted = status === 'granted';
    
    return (
      <div className="p-4 bg-[#0A0A0B] border border-[#2A2C32] rounded flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("p-2 rounded-full", isGranted ? "bg-green-500/10 text-green-500" : "bg-[#2A2C32] text-[#8E9299]")}>
              {icon}
            </div>
            <div>
              <h4 className="text-sm font-bold text-white tracking-wide uppercase">{label}</h4>
              <p className="text-[10px] text-[#8E9299] font-mono">{description}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            {isGranted ? (
              <span className="text-xs font-bold text-green-500 uppercase">ACTIVE</span>
            ) : (
              <Button size="sm" variant="outline" onClick={requestFn} className="h-7 text-xs bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20 hover:text-red-400">
                ENABLE
              </Button>
            )}
          </div>
        </div>
        {!isGranted && (
          <div className="flex items-center gap-2 text-[10px] text-yellow-500/80 bg-yellow-500/10 p-2 rounded">
            <AlertTriangle className="w-3 h-3" />
            App may not function properly without this permission
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={
        <button className="p-2 text-[#8E9299] hover:text-white transition-colors flex items-center justify-center cursor-pointer">
          <Settings className="w-5 h-5" />
        </button>
      } />
      
      <DialogContent className="bg-[#151619] text-white border-[#2A2C32] sm:max-w-[500px] hardware-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading text-2xl tracking-wide uppercase">
            <Settings className="w-6 h-6 text-red-500" />
            System Preferences
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          
          <div className="space-y-3">
            <h3 className="status-label">Hardware Permissions</h3>
            {renderPermission('Microphone', <Mic className="w-4 h-4" />, permissions.microphone, requestMicrophone, 'Required for voice trigger & analysis')}
            {renderPermission('Location Services', <MapPin className="w-4 h-4" />, permissions.geolocation, requestGeolocation, 'Required for SOS dispatch tracking')}
            {renderPermission('Push Notifications', <Bell className="w-4 h-4" />, permissions.notifications, requestNotifications, 'Receive nearby emergency alerts')}
          </div>

          <div className="space-y-3">
            <h3 className="status-label">Sensor Sensitivity</h3>
            <div className="p-4 bg-[#0A0A0B] border border-[#2A2C32] rounded flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-blue-500/10 text-blue-500">
                    <Activity className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white tracking-wide uppercase">Auto SOS Detection</h4>
                    <p className="text-[10px] text-[#8E9299] font-mono">Triggers automatically on high stress</p>
                  </div>
                </div>
                <Switch checked={autoSosEnabled} onCheckedChange={setAutoSosEnabled} />
              </div>
              
              <div className="pt-3 border-t border-[#2A2C32]">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs text-[#8E9299] uppercase">Detection Threshold</span>
                  <span className="text-xs font-bold text-white">{sensitivity}</span>
                </div>
                <div className="flex gap-2">
                  {['LOW', 'MEDIUM', 'HIGH'].map((level) => (
                    <Button 
                      key={level}
                      size="sm"
                      variant="outline"
                      onClick={() => setSensitivity(level as any)}
                      className={cn(
                        "flex-1 text-[10px] h-7",
                        sensitivity === level ? "bg-[#2A2C32] text-white border-[#4A4C52]" : "bg-transparent text-[#8E9299] border-[#2A2C32]"
                      )}
                    >
                      {level}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
};
