import React, { useState, useEffect } from 'react';

export const HeaderClock = React.memo(() => {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col items-end">
      <span className="status-label">SYS TIME (LOCAL)</span>
      <span className="data-value font-mono text-[10px] tracking-wider">
        {currentTime.toLocaleString('en-US', {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
          hour12: true
        }).toUpperCase()}
      </span>
    </div>
  );
});
