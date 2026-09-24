import { useState, useEffect, useRef, useCallback } from 'react';
import Sound from 'react-native-sound';

Sound.setCategory('Playback');

export type PlaybackState = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'error';

export function useAudioPlayer(filePath: string | null) {
  const soundRef      = useRef<Sound | null>(null);
  const mountedRef    = useRef(true);
  const generationRef = useRef(0);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const [state,    setState]    = useState<PlaybackState>('idle');
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const clearTimer = useCallback(() => {
    if (progressTimer.current !== null) {
      clearInterval(progressTimer.current);
      progressTimer.current = null;
    }
  }, []);

  useEffect(() => {
    const gen = ++generationRef.current;

    // Track whether this Sound instance finished loading.
    // Calling stop() on Android's MediaPlayer while it is still in PREPARING
    // state throws IllegalStateException on the Java side — the source of the
    // Double.doubleValue() NPE. We only call stop() when the Sound is loaded.
    let loaded = false;

    if (!filePath) {
      clearTimer();
      if (soundRef.current) {
        const old = soundRef.current;
        soundRef.current = null;
        try { old.stop(); } catch (_) {}
        try { old.release(); } catch (_) {}
      }
      setState('idle');
      setPosition(0);
      setDuration(0);
      return () => { generationRef.current++; };
    }

    setState('loading');

    if (soundRef.current) {
      clearTimer();
      const old = soundRef.current;
      soundRef.current = null;
      // old was necessarily loaded (it was in soundRef), safe to stop
      try { old.stop(); } catch (_) {}
      try { old.release(); } catch (_) {}
    }

    const s = new Sound(filePath, '', err => {
      if (generationRef.current !== gen) {
        // Superseded — release without stop (still in PREPARING on Java side)
        try { s.release(); } catch (_) {}
        return;
      }
      if (err) {
        setState('error');
        return;
      }
      loaded = true;
      soundRef.current = s;
      try { setDuration(s.getDuration()); } catch (_) { setDuration(0); }
      setPosition(0);
      setState('ready');
    });

    return () => {
      generationRef.current++;
      clearTimer();
      if (soundRef.current === s) soundRef.current = null;
      // Only call stop() if the Sound finished loading — stop() on a
      // MediaPlayer still in PREPARING state crashes the Android bridge.
      if (loaded) {
        try { s.stop(); } catch (_) {}
      }
      try { s.release(); } catch (_) {}
    };
  }, [filePath]); // eslint-disable-line react-hooks/exhaustive-deps

  const startProgressTimer = useCallback((gen: number) => {
    clearTimer();
    progressTimer.current = setInterval(() => {
      const s = soundRef.current;
      if (!s || !mountedRef.current || generationRef.current !== gen) {
        clearTimer();
        return;
      }
      try {
        s.getCurrentTime(sec => {
          if (!mountedRef.current || generationRef.current !== gen) return;
          setPosition(sec ?? 0);
        });
      } catch (_) {
        clearTimer();
      }
    }, 250);
  }, [clearTimer]);

  const play = useCallback(() => {
    const s = soundRef.current;
    if (!s) return;
    const gen = generationRef.current;
    s.play(success => {
      clearTimer();
      if (!mountedRef.current || generationRef.current !== gen || soundRef.current !== s) return;
      setPosition(0);
      setState(success ? 'ready' : 'error');
    });
    setState('playing');
    startProgressTimer(gen);
  }, [clearTimer, startProgressTimer]);

  const pause = useCallback(() => {
    try { soundRef.current?.pause(); } catch (_) {}
    clearTimer();
    if (mountedRef.current) setState('paused');
  }, [clearTimer]);

  const stop = useCallback(() => {
    try { soundRef.current?.stop(); } catch (_) {}
    clearTimer();
    if (mountedRef.current) {
      setPosition(0);
      setState('ready');
    }
  }, [clearTimer]);

  const seek = useCallback((seconds: number) => {
    try { soundRef.current?.setCurrentTime(seconds); } catch (_) {}
    if (mountedRef.current) setPosition(seconds);
  }, []);

  return { state, position, duration, play, pause, stop, seek };
}
