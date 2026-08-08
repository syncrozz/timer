import React, { useEffect, useState } from 'react';
import { Bell, Square, RotateCcw, Volume2, Sparkles } from 'lucide-react';

interface AlarmScreenProps {
  onStopAlarm: () => void;
  onRestartTimer: () => void;
  ringtoneName: string;
  defaultMinutes: number;
}

export const AlarmScreen: React.FC<AlarmScreenProps> = ({
  onStopAlarm,
  onRestartTimer,
  ringtoneName,
  defaultMinutes,
}) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between p-6 bg-[#030712]/95 backdrop-blur-3xl text-white overflow-hidden">
      {/* Background Orbs */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-rose-600/30 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-10 left-10 w-72 h-72 bg-purple-600/20 rounded-full blur-[100px] pointer-events-none" />

      {/* Top Banner */}
      <div className="w-full max-w-sm pt-8 text-center z-10">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-semibold mb-4 backdrop-blur-md">
          <Sparkles className="w-4 h-4 animate-spin" />
          <span>TIMER EXPIRED!</span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white mb-2">
          Time's Up!
        </h1>
        <div className="flex items-center justify-center gap-2 text-rose-200/80 text-sm">
          <Volume2 className="w-4 h-4" />
          <span>Playing: {ringtoneName}</span>
        </div>
      </div>

      {/* Center Bell Icon Pulse */}
      <div className="flex flex-col items-center justify-center my-auto z-10">
        <div className="relative flex items-center justify-center w-44 h-44 rounded-full backdrop-blur-2xl bg-white/10 border-2 border-rose-500/50 shadow-[0_0_80px_rgba(244,63,94,0.4)] animate-bounce">
          <Bell className="w-20 h-20 text-rose-300" />
        </div>
        <div className="mt-6 font-mono text-lg text-rose-200/90 bg-white/5 px-4 py-1.5 rounded-full border border-white/10 backdrop-blur-md">
          Alarming: {elapsed}s
        </div>
      </div>

      {/* Bottom Action Controls */}
      <div className="w-full max-w-sm pb-8 space-y-3 z-10">
        <button
          onClick={onStopAlarm}
          id="stop-alarm-btn"
          className="w-full flex items-center justify-center gap-3 py-4 px-6 rounded-2xl bg-rose-600 hover:bg-rose-500 active:scale-98 text-white font-bold text-base shadow-2xl shadow-rose-900/50 transition-all border border-rose-400/50 backdrop-blur-md"
        >
          <Square className="w-5 h-5 fill-current" />
          <span>Stop Alarm</span>
        </button>

        <button
          onClick={onRestartTimer}
          id="restart-timer-btn"
          className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl bg-white/10 hover:bg-white/20 active:scale-98 text-white font-semibold text-sm transition-all border border-white/15 backdrop-blur-md shadow-xl"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Restart Timer ({defaultMinutes} Min)</span>
        </button>
      </div>
    </div>
  );
};
