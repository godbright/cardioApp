import { useState, useEffect, useRef, useCallback } from 'react';
import Sound from 'react-native-sound';

Sound.setCategory('Playback');

export type PlaybackState = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'error';

export function useAudioPlayer(filePath: string | null) {
  const soundRef               = useRef<Sound | null>(null);
  const [state, setState]      = useState<PlaybackState>('idle');
  const [position, setPosition] = useState(0); // seconds elapsed
  const [duration, setDuration] = useState(0); // seconds total
  const progressTimer          = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load the file whenever filePath changes.
  useEffect(() => {
    if (!filePath) { setState('idle'); return; }

    setState('loading');
    soundRef.current?.release();
    soundRef.current = null;

    // MAIN_BUNDLE = '' means the path is absolute (device storage).
    const s = new Sound(filePath, '', err => {
      if (err) {
        console.warn('[AudioPlayer] load error:', err);
        setState('error');
        return;
      }
      soundRef.current = s;
      setDuration(s.getDuration());
      setPosition(0);
      setState('ready');
    });

    return () => {
      clearInterval(progressTimer.current ?? undefined);
      s.release();
      soundRef.current = null;
    };
  }, [filePath]);

  const startProgressTimer = useCallback(() => {
    clearInterval(progressTimer.current ?? undefined);
    progressTimer.current = setInterval(() => {
      soundRef.current?.getCurrentTime(sec => setPosition(sec));
    }, 250);
  }, []);

  const play = useCallback(() => {
    const s = soundRef.current;
    if (!s) return;
    s.play(success => {
      clearInterval(progressTimer.current ?? undefined);
      if (success) {
        setPosition(0);
        setState('ready');
      } else {
        setState('error');
      }
    });
    setState('playing');
    startProgressTimer();
  }, [startProgressTimer]);

  const pause = useCallback(() => {
    soundRef.current?.pause();
    clearInterval(progressTimer.current ?? undefined);
    setState('paused');
  }, []);

  const stop = useCallback(() => {
    soundRef.current?.stop();
    clearInterval(progressTimer.current ?? undefined);
    setPosition(0);
    setState('ready');
  }, []);

  const seek = useCallback((seconds: number) => {
    soundRef.current?.setCurrentTime(seconds);
    setPosition(seconds);
  }, []);

  return { state, position, duration, play, pause, stop, seek };
}
