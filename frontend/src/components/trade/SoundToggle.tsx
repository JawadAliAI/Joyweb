'use client';

/**
 * Speaker on/off switch for the trade sound cues.
 *
 * The preference lives in localStorage, so it is read after mount to keep the
 * server and client markup identical. The button keeps a fixed size in both
 * states so toggling never shifts the layout around it.
 */
import { useEffect, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/format';
import { isSoundEnabled, playSound, primeSound, setSoundEnabled } from '@/lib/sound';

export function SoundToggle({ className }: { className?: string }) {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    setEnabled(isSoundEnabled());
  }, []);

  return (
    <button
      type="button"
      aria-pressed={enabled}
      aria-label={enabled ? 'Turn trade sounds off' : 'Turn trade sounds on'}
      title={enabled ? 'Trade sounds on' : 'Trade sounds off'}
      onClick={() => {
        const next = !enabled;
        setEnabled(next);
        setSoundEnabled(next);
        if (next) {
          // The click is the gesture that unlocks audio — confirm audibly.
          primeSound();
          playSound('trade-draw');
        }
      }}
      className={cn(
        'flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-border',
        'text-muted transition-colors hover:text-fg focus-visible:outline-none',
        'focus-visible:ring-2 focus-visible:ring-primary',
        enabled && 'text-fg',
        className,
      )}
    >
      {enabled ? (
        <Volume2 className="h-5 w-5" aria-hidden />
      ) : (
        <VolumeX className="h-5 w-5" aria-hidden />
      )}
    </button>
  );
}
