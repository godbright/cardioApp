import { useState, useEffect, useRef } from 'react';
import { getNativeSda, SqaPayload } from '../native/NativeSda';
import { DEMO_MODE } from '../demo';

export type SqaMode = 'pcg' | 'ecg' | 'dual';

// Poll the JSI host object at 25 Hz (every 40 ms).
// JSI calls are synchronous — zero async overhead, safe to poll this frequently.
const POLL_INTERVAL_MS = 40;

/**
 * Provides continuous SQA payload while `active` is true.
 *
 * @param active  — start/stop the quality assessment loop
 * @param mode    — which modality to assess ('pcg' | 'ecg' | 'dual')
 * @returns Latest SqaPayload or null (null = native module not yet built, or inactive)
 *
 * Graceful degradation:
 *  - Returns null when the native module is absent (JS-only reload).
 *  - In DEMO_MODE returns a synthetic payload that ramps score 0→1 over 3 s,
 *    so the signal-quality UI is exercisable without hardware.
 */
export function useCardioSQI(
  active: boolean,
  mode: SqaMode = 'pcg',
): SqaPayload | null {
  const [payload, setPayload] = useState<SqaPayload | null>(null);
  const startRef = useRef<number>(0);

  useEffect(() => {
    if (!active) {
      setPayload(null);
      return;
    }

    // ── DEMO_MODE: synthetic ramp payload ─────────────────────────────────
    if (DEMO_MODE) {
      startRef.current = Date.now();
      const id = setInterval(() => {
        const elapsed = (Date.now() - startRef.current) / 1000; // seconds
        const score = Math.min(1, elapsed / 3);                  // 0→1 over 3 s
        const ready = score >= 0.65;
        setPayload({
          ready,
          score,
          pcgScore:  mode !== 'ecg' ? score : 0,
          ecgScore:  mode !== 'pcg' ? score : 0,
          tsMs:      Date.now(),
          serSqi:    score * 0.95,
          eSqi:      score * 0.90,
          aSqi:      score * 0.85,
          bSqi:      score * 0.92,
          kSqi:      score * 0.88,
          basSqi:    score * 0.80,
        });
      }, POLL_INTERVAL_MS);
      return () => {
        clearInterval(id);
        setPayload(null);
      };
    }

    // ── Real native module ─────────────────────────────────────────────────
    // nativeInstall runs asynchronously on the JS queue thread — read the
    // global lazily so we pick it up after it has been installed.
    let mod = getNativeSda();
    if (!mod) {
      // Not yet installed — retry once after a short delay to account for the
      // JS queue thread install happening just after the first render.
      let stopPoll: (() => void) | undefined;
      const retryId = setTimeout(() => {
        mod = getNativeSda();
        if (!mod) return; // native build absent — stay null silently
        stopPoll = startPolling(mod);
      }, 300);
      return () => {
        clearTimeout(retryId);
        stopPoll?.();
      };
    }

    return startPolling(mod);

    function startPolling(native: NonNullable<ReturnType<typeof getNativeSda>>) {
      const modeInt: 0 | 1 | 2 = mode === 'ecg' ? 1 : mode === 'dual' ? 2 : 0;
      native.setMode(modeInt);

      const id = setInterval(() => {
        try {
          setPayload(native.getPayload());
        } catch {
          // Native side threw (e.g. shutdown in progress) — stop polling.
          clearInterval(id);
          setPayload(null);
        }
      }, POLL_INTERVAL_MS);

      return () => {
        clearInterval(id);
        native.reset();
        setPayload(null);
      };
    }
  }, [active, mode]);

  return payload;
}
