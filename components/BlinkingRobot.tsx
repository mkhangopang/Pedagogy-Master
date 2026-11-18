'use client';

import React from 'react';

interface BlinkingRobotProps {
  size?: 'sm' | 'md' | 'lg';
  isThinking?: boolean;
  variant?: 'default' | 'error';
  className?: string;
}

/**
 * Creative Minimalist Output Robot with naturally blinking luminous eyes
 * and a refined crescent smile inside a dark-glass OLED visor.
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
          visor: 'w-14 h-9 rounded-2xl',
          eye: 'w-2.5 h-3 rounded-full',
          eyeGap: 'gap-3.5',
          smile: 'w-6 h-2.5 mt-1 border-b-[2.5px]',
          frown: 'w-5 h-2 mt-1.5 border-t-[2.5px]',
          antennaStem: 'h-2.5 w-0.5 -top-2.5',
          antennaTip: 'w-2.5 h-2.5 -top-4',
          chinAccent: 'w-4 h-[2px] mt-1.5',
        }
      : size === 'md'
        ? {
            shell: 'w-12 h-12 rounded-2xl',
            visor: 'w-9 h-[22px] rounded-xl',
            eye: 'w-1.5 h-2 rounded-full',
            eyeGap: 'gap-2',
            smile: 'w-3.5 h-1.5 mt-0.5 border-b-2',
            frown: 'w-3 h-1.5 mt-1 border-t-2',
            antennaStem: 'h-2 w-0.5 -top-2',
            antennaTip: 'w-2 h-2 -top-3',
            chinAccent: 'w-2.5 h-[1.5px] mt-1',
          }
        : {
            shell: 'w-8 h-8 rounded-xl',
            visor: 'w-6 h-[15px] rounded-lg',
            eye: 'w-[3.5px] h-[5px] rounded-full',
            eyeGap: 'gap-1.5',
            smile: 'w-2.5 h-[4px] mt-[1.5px] border-b-[1.5px]',
            frown: 'w-2 h-[3.5px] mt-[2px] border-t-[1.5px]',
            antennaStem: 'h-1.5 w-0.5 -top-1',
            antennaTip: 'w-1.5 h-1.5 -top-2',
            chinAccent: '',
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

  const smileTone = isError
    ? 'border-rose-200/90 [filter:drop-shadow(0_0_4px_rgba(254,205,211,0.65))]'
    : isThinking
      ? 'border-emerald-300 [filter:drop-shadow(0_0_5px_rgba(110,231,183,0.85))] animate-robot-smile'
      : 'border-cyan-300 [filter:drop-shadow(0_0_5px_rgba(103,232,249,0.75))] animate-robot-smile';

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
        {/* Dark-glass OLED visor with blinking eyes & curved smile */}
        <div
          className={`flex flex-col items-center justify-center bg-slate-950/95 border border-white/10 shadow-inner ${dims.visor}`}
        >
          <div className={`flex items-center justify-center ${dims.eyeGap}`}>
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

          {/* Elegant curved crescent smile (or subtle empathetic arc on error) */}
          {isError ? (
            <span
              className={`inline-block origin-center rounded-t-full border-x border-x-transparent transition-transform duration-300 ${dims.frown} ${smileTone}`}
            />
          ) : (
            <span
              className={`inline-block origin-center rounded-b-full border-x border-x-transparent transition-transform duration-300 ${dims.smile} ${smileTone}`}
            />
          )}
        </div>

        {/* Subtle anodized chin highlight on medium/large variants */}
        {dims.chinAccent && (
          <span
            className={`rounded-full transition-opacity duration-300 ${dims.chinAccent} ${
              isThinking ? 'bg-emerald-200/40' : 'bg-white/25'
            }`}
          />
        )}
      </div>
    </div>
  );
};
