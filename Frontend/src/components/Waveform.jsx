import React, { useMemo } from 'react';

const Waveform = ({ isPlaying = false, barCount = 28, height = 36, progress = 0 }) => {
  // Precompute random organic bar heights
  const bars = useMemo(() => {
    const arr = [];
    for (let i = 0; i < barCount; i++) {
      // Create a natural waveform curve
      const pos = i / barCount;
      const wave = Math.sin(pos * Math.PI) * 0.75 + 0.25;
      const variance = (Math.sin(i * 1.8) + Math.cos(i * 3.2)) * 0.15;
      const baseHeight = Math.max(0.18, Math.min(1, wave + variance));
      const animDelay = (i * 0.05) % 0.8;
      const animDuration = 0.8 + ((i % 5) * 0.12);
      arr.push({ baseHeight, animDelay, animDuration });
    }
    return arr;
  }, [barCount]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '3px',
        width: '100%',
        height: `${height}px`,
        padding: '0 4px',
        overflow: 'hidden',
      }}
    >
      {bars.map((bar, idx) => {
        const barProgress = idx / barCount;
        const isPassed = barProgress <= progress;

        return (
          <div
            key={idx}
            style={{
              flex: 1,
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: '4px',
                minWidth: '2px',
                height: `${bar.baseHeight * 100}%`,
                borderRadius: '3px',
                background: isPassed ? 'var(--primary-bright)' : 'rgba(255, 255, 255, 0.12)',
                transition: 'background 0.2s ease',
                animationName: isPlaying ? 'wave-pulse' : 'none',
                animationDuration: `${bar.animDuration}s`,
                animationTimingFunction: 'ease-in-out',
                animationIterationCount: 'infinite',
                animationDirection: 'alternate',
                animationDelay: `${bar.animDelay}s`,
              }}
            />
          </div>
        );
      })}
    </div>
  );
};

export default Waveform;
