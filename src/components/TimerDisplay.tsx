import React from 'react';
import { Play, Pause, RotateCcw, Volume2, Sparkles } from 'lucide-react';
import { TimerState } from '../types';

interface TimerDisplayProps {
  timeLeftSeconds: number;
  totalDurationSeconds: number;
  timerState: TimerState;
  onMainTap: () => void;
  onReset: () => void;
  ringtoneName: string;
}

export const TimerDisplay: React.FC<TimerDisplayProps> = ({
  timeLeftSeconds,
  totalDurationSeconds,
  timerState,
  onMainTap,
  onReset,
  ringtoneName,
}) => {
  const formatTime = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const progressFraction = totalDurationSeconds > 0 
    ? Math.max(0, Math.min(1, timeLeftSeconds / totalDurationSeconds))
    : 0;

  const radius = 130;
  const strokeWidth = 12;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progressFraction);

  const getStatusLabel = () => {
    switch (timerState) {
      case 'idle':
        return 'Ready • Tap Anywhere To Start';
      case 'running':
        return 'Running • Tap To Pause';
      case 'paused':
        return 'Paused • Tap To Resume';
      case 'finished':
        return 'Time is Up! Alarm Sounding';
    }
  };

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-md mx-auto px-4 select-none">
      {/* Sound / Ringtone Badge */}
      <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 backdrop-blur-md border border-white/10 text-white/80 text-xs font-medium mb-6 shadow-lg">
        <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
        <span className="truncate max-w-[220px]">Ringtone: {ringtoneName}</span>
      </div>

      {/* Main Touch Circle Area */}
      <div
        onClick={onMainTap}
        id="main-timer-tap-area"
        className={`relative flex items-center justify-center w-72 h-72 sm:w-88 sm:h-88 rounded-full cursor-pointer transition-all duration-300 active:scale-95 group touch-manipulation backdrop-blur-2xl bg-white/5 border border-white/10 shadow-2xl hover:bg-white/10 ${
          timerState === 'running'
            ? 'shadow-[0_0_60px_rgba(99,102,241,0.25)] border-indigo-500/40'
            : timerState === 'paused'
            ? 'shadow-[0_0_40px_rgba(245,158,11,0.2)] border-amber-500/40'
            : 'shadow-[0_0_40px_rgba(255,255,255,0.08)]'
        }`}
      >
        {/* Outer Ring Border Accents */}
        <div className="absolute inset-0 rounded-full border-4 border-white/5 pointer-events-none" />

        {/* SVG Progress Ring */}
        <svg className="w-full h-full transform -rotate-90 p-2" viewBox="0 0 300 300">
          {/* Background Track */}
          <circle
            cx="150"
            cy="150"
            r={radius}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-white/10 fill-none"
          />
          {/* Animated Dynamic Progress Stroke */}
          <circle
            cx="150"
            cy="150"
            r={radius}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className={`fill-none transition-all duration-300 ease-linear ${
              timerState === 'running'
                ? 'text-indigo-400'
                : timerState === 'paused'
                ? 'text-amber-400'
                : 'text-purple-400'
            }`}
          />
        </svg>

        {/* Center Content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 rounded-full">
          {/* Icon indicator */}
          <div className="mb-2">
            {timerState === 'running' && (
              <span className="inline-flex items-center justify-center p-3.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 animate-pulse">
                <Pause className="w-7 h-7 fill-current" />
              </span>
            )}
            {timerState === 'paused' && (
              <span className="inline-flex items-center justify-center p-3.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                <Play className="w-7 h-7 fill-current ml-0.5" />
              </span>
            )}
            {timerState === 'idle' && (
              <span className="inline-flex items-center justify-center p-3.5 rounded-full bg-white/10 text-white border border-white/20 group-hover:scale-110 transition-transform">
                <Play className="w-7 h-7 fill-current ml-0.5" />
              </span>
            )}
          </div>

          {/* Time digits - thin elegant frosted typography */}
          <div className="font-sans text-5xl sm:text-6xl font-light tracking-tighter text-white drop-shadow-xl leading-none">
            {formatTime(timeLeftSeconds)}
          </div>

          {/* Prompt Subtitle */}
          <div className="mt-3 text-[11px] font-semibold tracking-[0.25em] uppercase text-indigo-300/80 group-hover:text-indigo-300">
            {timerState === 'idle' && 'TAP TO START'}
            {timerState === 'running' && 'TAP TO PAUSE'}
            {timerState === 'paused' && 'TAP TO RESUME'}
          </div>
        </div>
      </div>

      {/* Reset Action Button if paused or running or changed */}
      <div className="mt-6 flex items-center gap-3">
        {(timerState === 'paused' || timerState === 'running' || timeLeftSeconds !== totalDurationSeconds) && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onReset();
            }}
            id="reset-timer-btn"
            className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 active:scale-95 text-white text-xs font-semibold tracking-wider transition-all shadow-xl backdrop-blur-md border border-white/15"
          >
            <RotateCcw className="w-4 h-4" />
            <span>RESET ({formatTime(totalDurationSeconds)})</span>
          </button>
        )}
      </div>
    </div>
  );
};
