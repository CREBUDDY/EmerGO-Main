import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useNotifications, NotificationItem } from '../hooks/useNotifications';
import { Bell, ShieldAlert, Info, CheckCircle, Trash2, CheckSquare, Navigation } from 'lucide-react';
import { cn } from '@/lib/utils';

export const NotificationDropdown = () => {
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification } = useNotifications();

  const getIcon = (type: NotificationItem['type']) => {
    switch(type) {
      case 'SOS_ALERT': return <ShieldAlert className="w-4 h-4 text-red-500" />;
      case 'ACK': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'SYSTEM': 
      default: return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  const formatTime = (ts: number) => {
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    const daysDifference = Math.round((ts - Date.now()) / (1000 * 60 * 60 * 24));
    
    if (daysDifference === 0) {
      const hoursDiff = Math.round((ts - Date.now()) / (1000 * 60 * 60));
      if (hoursDiff === 0) {
        const minsDiff = Math.round((ts - Date.now()) / (1000 * 60));
        return rtf.format(minsDiff, 'minute');
      }
      return rtf.format(hoursDiff, 'hour');
    }
    return rtf.format(daysDifference, 'day');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="relative p-2 text-[#8E9299] hover:text-white transition-colors flex items-center justify-center cursor-pointer">
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
        )}
      </DropdownMenuTrigger>
      
      <DropdownMenuContent align="end" className="w-[320px] bg-[#151619] border-[#2A2C32] text-white hardware-card p-0">
        <div className="flex items-center justify-between p-3 border-b border-[#2A2C32]">
          <h3 className="font-heading text-lg font-normal uppercase tracking-wide py-0 flex items-center gap-2 m-0 text-white">
            System Alerts
            {unreadCount > 0 && (
              <span className="bg-red-500/10 text-red-500 text-[10px] px-1.5 rounded-full font-mono">{unreadCount}</span>
            )}
          </h3>
          {unreadCount > 0 && (
            <button 
              onClick={markAllAsRead}
              className="text-[#8E9299] hover:text-white transition-colors"
              title="Mark all as read"
            >
              <CheckSquare className="w-4 h-4" />
            </button>
          )}
        </div>
        
        <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
          {notifications.length === 0 ? (
            <div className="p-4 text-center text-[#8E9299] text-xs font-mono">No active alerts</div>
          ) : (
            <div className="flex flex-col">
              {notifications.map((notif) => (
                <div 
                  key={notif.id}
                  className={cn(
                    "flex flex-col gap-2 p-3 border-b border-[#2A2C32] last:border-b-0 hover:bg-[#1A1C20] transition-colors relative group",
                    !notif.read ? "bg-[#1A1C20]" : ""
                  )}
                  onClick={() => !notif.read && markAsRead(notif.id)}
                >
                  <div className="flex gap-3">
                    <div className="mt-0.5">
                      {getIcon(notif.type)}
                    </div>
                    <div className="flex-1 flex flex-col min-w-0 pr-6">
                      <span className={cn(
                        "text-xs leading-relaxed break-words",
                        !notif.read ? "font-bold text-white" : "text-[#8E9299]"
                      )}>
                        {notif.message}
                      </span>
                      <span className="text-[10px] text-[#5A5C62] font-mono mt-1">
                        {formatTime(notif.timestamp)}
                      </span>
                    </div>
                  </div>

                  {(notif.type === 'SOS_ALERT' && notif.latitude !== undefined && notif.longitude !== undefined) && (
                    <div className="ml-7 mt-1">
                      <a 
                        href={`https://www.google.com/maps/dir/?api=1&destination=${notif.latitude},${notif.longitude}`}
                        target="_blank" 
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#2A2C32] hover:bg-white hover:text-black hover:border-white transition-colors border border-[#3A3C42] text-[9px] font-bold uppercase rounded-md w-fit"
                      >
                        <Navigation className="w-3 h-3" />
                        Trace Location
                      </a>
                    </div>
                  )}

                  {!notif.read && (
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 absolute top-4 right-3 group-hover:hidden" />
                  )}
                  <button 
                    onClick={(e) => { e.stopPropagation(); deleteNotification(notif.id); }}
                    className="absolute top-3 right-3 text-[#5A5C62] hover:text-red-500 hidden group-hover:block transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

