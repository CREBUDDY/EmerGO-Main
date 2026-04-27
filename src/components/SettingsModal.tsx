import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { usePermissions } from '../hooks/usePermissions';
import { Settings, Mic, MapPin, Bell, AlertTriangle, Moon, Sun, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTheme } from 'next-themes';

export const SettingsModal = () => {
  const { permissions, requestMicrophone, requestGeolocation, requestNotifications } = usePermissions();
  const [open, setOpen] = useState(false);
  const { theme, setTheme } = useTheme();

  const renderPermission = (
    label: string, 
    icon: React.ReactNode, 
    status: string, 
    requestFn: () => void,
    description: string
  ) => {
    const isGranted = status === 'granted';
    
    return (
      <div className="p-4 bg-background border border-border rounded flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("p-2 rounded-full", isGranted ? "bg-green-500/10 text-green-500" : "bg-muted dark:bg-muted/80 text-muted-foreground")}>
              {icon}
            </div>
            <div>
              <h4 className="text-sm font-bold text-foreground tracking-wide uppercase">{label}</h4>
              <p className="text-[10px] text-muted-foreground font-mono">{description}</p>
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
        <button className="p-2 text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center cursor-pointer">
          <Settings className="w-5 h-5" />
        </button>
      } />
      
      <DialogContent className="bg-card/90 text-foreground border-border sm:max-w-[500px] hardware-card">
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
            <h3 className="status-label">Display Preferences</h3>
            <div className="p-4 bg-background border border-border rounded flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-purple-500/10 text-purple-500">
                    <Sun className="w-4 h-4 dark:hidden" />
                    <Moon className="w-4 h-4 hidden dark:block" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-foreground tracking-wide uppercase">System Theme</h4>
                    <p className="text-[10px] text-muted-foreground font-mono">Select app appearance</p>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setTheme('light')} className={cn("flex-1 text-xs h-8 flex gap-2 items-center", theme === 'light' ? "bg-accent/10 border-accent text-accent" : "bg-transparent text-muted-foreground border-border")}>
                  <Sun className="w-3 h-3" /> Light
                </Button>
                <Button size="sm" variant="outline" onClick={() => setTheme('dark')} className={cn("flex-1 text-xs h-8 flex gap-2 items-center", theme === 'dark' ? "bg-accent/10 border-accent text-accent" : "bg-transparent text-muted-foreground border-border")}>
                  <Moon className="w-3 h-3" /> Dark
                </Button>
                <Button size="sm" variant="outline" onClick={() => setTheme('system')} className={cn("flex-1 text-xs h-8 flex gap-2 items-center", theme === 'system' ? "bg-accent/10 border-accent text-accent" : "bg-transparent text-muted-foreground border-border")}>
                  <Monitor className="w-3 h-3" /> System
                </Button>
              </div>
            </div>
          </div>



        </div>
      </DialogContent>
    </Dialog>
  );
};
