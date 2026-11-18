'use client';

import React from 'react';

interface BlinkingRobotProps {
  size?: 'sm' | 'md' | 'lg';
  isThinking?: boolean;
  variant?: 'default' | 'error';
  className?: string;
}

/**
 * Creative Minimalist Output Robot with naturally blinking luminous eyes.
 * Constructed purely with crisp geometric CSS layers (zero custom SVG icons).
 */
export const BlinkingRobot: React.FC<BlinkingRobotProps> = ({
  size = 'sm',
  isThinking = false,
  variant = 'default',
  className = '',
}) => {
  const dims =
    size === 'lg'
      ? {
          shell: 'w-20 h-20 rounded-[26px]',
          visor: 'w-14 h-7 rounded-2xl',
          eye: 'w-2.5 h-3.5 rounded-full',
          eyeGap: 'gap-3',
          antennaStem: 'h-2.5 w-0.5 -top-2.5',
          antennaTip: 'w-2.5 h-2.5 -top-4',
          mouth: 'w-5 h-0.5 mt-1.5',
        }
      : size === 'md'
        ? {
            shell: 'w-12 h-12 rounded-2xl',
            visor: 'w-9 h-4.5 rounded-xl',
            eye: 'w-1.5 h-2.5 rounded-full',
            eyeGap: 'gap-2',
            antennaStem: 'h-2 w-0.5 -top-2',
            antennaTip: 'w-2 h-2 -top-3',
            mouth: 'w-3.5 h-0.5 mt-1',
          }
        : {
            shell: 'w-8 h-8 rounded-xl',
            visor: 'w-6 h-3 rounded-lg',
            eye: 'w-1 h-1.5 rounded-full',
            eyeGap: 'gap-1.5',
            antennaStem: 'h-1.5 w-0.5 -top-1',
            antennaTip: 'w-1.5 h-1.5 -top-2',
            mouth: 'w-2.5 h-[1.5px] mt-0.5',
          };

  const isError = variant === 'error';

  const shellTone = isError
    ? 'bg-gradient-to-br from-rose-500 to-rose-700 border-rose-300/70 shadow-rose-500/30'
    : 'bg-gradient-to-br from-indigo-500 via-indigo-600 to-slate-900 border-indigo-300/50 dark:border-indigo-400/30 shadow-indigo-600/30';

  const eyeTone = isError
    ? 'bg-rose-200 shadow-[0_0_8px_rgba(254,205,211,0.95)]'
    : isThinking
      ? 'bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.95)]'
      : 'bg-cyan-300 shadow-[0_0_8px_rgba(103,232,249,0.9)]';

  const tipTone = isError
    ? 'bg-rose-300'
    : isThinking
      ? 'bg-emerald-400 animate-ping'
      : 'bg-cyan-400';

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 select-none ${
        isThinking ? 'animate-robot-float' : ''
      } ${className}`}
      aria-hidden="true"
    >
      {/* Minimalist antenna */}
      <span
        className={`absolute left-1/2 -translate-x-1/2 rounded-full bg-indigo-400/70 dark:bg-indigo-300/60 ${dims.antennaStem}`}
      />
      <span
        className={`absolute left-1/2 -translate-x-1/2 rounded-full ${tipTone} ${dims.antennaTip}`}
      />

      {/* Minimalist squircle robot head */}
      <div
        className={`relative flex flex-col items-center justify-center border shadow-lg transition-all duration-300 ${dims.shell} ${shellTone}`}
      >
        {/* Dark-glass visor */}
        <div
          className={`flex items-center justify-center bg-slate-950/90 border border-white/10 shadow-inner ${dims.visor} ${dims.eyeGap}`}
        >
          {/* Left Blinking Eye */}
          <span
            className={`inline-block origin-center ${dims.eye} ${eyeTone} ${
              isThinking ? 'animate-robot-blink-fast' : 'animate-robot-blink'
            }`}
          />
          {/* Right Blinking Eye */}
          <span
            className={`inline-block origin-center ${dims.eye} ${eyeTone} ${
              isThinking ? 'animate-robot-blink-fast' : 'animate-robot-blink'
            }`}
          />
        </div>

        {/* Minimalist calm indicator bar */}
        <span
          className={`rounded-full transition-all ${dims.mouth} ${
            isThinking
              ? 'bg-emerald-300/80 animate-pulse'
              : 'bg-white/35'
          }`}
        />
      </div>
    </div>
  );
};
