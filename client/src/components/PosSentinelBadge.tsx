import React, { useState, useEffect } from 'react';

export interface HeartbeatTelemetry {
  lastCheck: string;
  localId: string;
  serverId: string | null;
  status: 'ok' | 'mismatch' | 'error' | 'idle';
}

export const CW_HEARTBEAT_TICK_EVENT = 'cw_heartbeat_tick';

export function emitHeartbeatTick(detail: HeartbeatTelemetry) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CW_HEARTBEAT_TICK_EVENT, { detail }));
  }
}

export const PosSentinelBadge: React.FC = () => {
  const [telemetry, setTelemetry] = useState<HeartbeatTelemetry>({
    lastCheck: 'جاري البدء...',
    localId: '---',
    serverId: null,
    status: 'idle',
  });

  useEffect(() => {
    const handleTick = (e: any) => {
      if (e.detail) {
        setTelemetry(e.detail);
      }
    };

    window.addEventListener(CW_HEARTBEAT_TICK_EVENT, handleTick);
    return () => {
      window.removeEventListener(CW_HEARTBEAT_TICK_EVENT, handleTick);
    };
  }, []);

  return (
    <div
      dir="ltr"
      className="fixed bottom-3 left-3 z-50 bg-slate-950/85 text-white text-[11px] font-mono px-3 py-1.5 rounded-lg border border-slate-700/80 shadow-2xl backdrop-blur select-none flex items-center gap-3 transition-colors pointer-events-none"
    >
      <div className="flex items-center gap-1">
        <span className="opacity-70">🖥️ Local:</span>
        <span className="text-cyan-400 font-bold">{telemetry.localId}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="opacity-70">☁️ Cloud:</span>
        <span
          className={`font-bold ${
            telemetry.status === 'mismatch'
              ? 'text-rose-400 animate-pulse'
              : telemetry.status === 'ok'
              ? 'text-emerald-400'
              : 'text-amber-400'
          }`}
        >
          {telemetry.serverId || 'None'}
        </span>
      </div>
      <div className="flex items-center gap-1 text-[10px] text-slate-400 border-l border-slate-700 pl-2">
        <span>⏱️ {telemetry.lastCheck}</span>
      </div>
    </div>
  );
};

export default React.memo(PosSentinelBadge);
