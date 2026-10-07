import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

interface Player {
  clockMs: number;
  playing: boolean;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  reset: () => void;
  seek: (ms: number) => void;
}

const Ctx = createContext<Player | null>(null);

export function PlayerProvider({ children, durationMs }: { children: ReactNode; durationMs: number }) {
  const [clockMs, setClockMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const startRef = useRef<{ wall: number; clock: number } | null>(null);

  useEffect(() => {
    if (!playing) return;
    startRef.current = { wall: performance.now(), clock: clockMs };
    const id = window.setInterval(() => {
      const s = startRef.current!;
      const t = s.clock + (performance.now() - s.wall);
      if (t >= durationMs) {
        setClockMs(durationMs);
        setPlaying(false);
      } else {
        setClockMs(t);
      }
    }, 50);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, durationMs]);

  const play = useCallback(() => {
    if (clockMs >= durationMs) setClockMs(0);
    startRef.current = null;
    setPlaying(true);
  }, [clockMs, durationMs]);
  const pause = useCallback(() => setPlaying(false), []);
  const toggle = useCallback(() => (playing ? pause() : play()), [playing, pause, play]);
  const reset = useCallback(() => {
    setPlaying(false);
    setClockMs(0);
  }, []);
  const seek = useCallback((ms: number) => {
    setClockMs(Math.max(0, Math.min(ms, durationMs)));
  }, [durationMs]);

  const value = useMemo(() => ({ clockMs, playing, play, pause, toggle, reset, seek }), [clockMs, playing, play, pause, toggle, reset, seek]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlayer(): Player {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}
