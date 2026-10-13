import React, { useState, useEffect } from 'react';

export const LiveClock: React.FC = () => {
  const [time, setTime] = useState<string>(() => {
    const now = new Date();
    return now.toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  });

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString('ar-EG', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    };

    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-mono text-slate-300 transition-colors duration-300 font-bold"
      style={{
        backgroundColor: 'rgba(2, 6, 23, 0.65)',
        borderColor: 'var(--border-color)',
      }}
    >
      <span>{time}</span>
    </div>
  );
};

export default React.memo(LiveClock);
