/**
 * Live waveform renderer using react-native-svg Polyline.
 *
 * Stream-agnostic: caller provides label, color, and data buffer.
 * Same component renders both the single-stream ECG layout and the dual-stream
 * PCG+ECG stacked layout. Updates at ~12.5 fps (80 ms tick) — sufficient for
 * clinical signal monitoring.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent } from 'react-native';
import Svg, { Polyline, Line, G } from 'react-native-svg';

export interface WaveformStream {
  label: string;
  color: string;
  buffer: number[];  // normalized [-1, 1], newest at end
}

interface WaveformViewProps {
  streams: WaveformStream[];
  height?: number;
}

function buildPoints(buf: number[], w: number, h: number): string {
  const n = buf.length;
  if (n < 2) return '';
  const mid = h / 2;
  const amp = h * 0.40;
  return buf
    .map((v, i) => `${((i / (n - 1)) * w).toFixed(1)},${(mid - v * amp).toFixed(1)}`)
    .join(' ');
}

export default function WaveformView({ streams, height = 120 }: WaveformViewProps) {
  const [width, setWidth] = useState(600);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const perStreamH = streams.length > 1 ? Math.floor((height - 12) / streams.length) : height;

  return (
    <View style={[styles.container, { height }]} onLayout={onLayout}>
      {streams.map((s, idx) => {
        const points = buildPoints(s.buffer, width, perStreamH);
        const top = idx * (perStreamH + 12);
        return (
          <View key={s.label} style={[styles.track, { top, height: perStreamH }]}>
            <Text style={styles.trackLabel}>{s.label}</Text>
            <Svg width={width} height={perStreamH} style={styles.svg}>
              <G stroke="rgba(255,255,255,0.05)" strokeWidth={1}>
                {Array.from({ length: Math.floor(width / 26) }, (_, i) => (
                  <Line key={`v${i}`} x1={(i + 1) * 26} y1={0} x2={(i + 1) * 26} y2={perStreamH} />
                ))}
                {Array.from({ length: Math.floor(perStreamH / 26) }, (_, i) => (
                  <Line key={`h${i}`} x1={0} y1={(i + 1) * 26} x2={width} y2={(i + 1) * 26} />
                ))}
              </G>
              {points.length > 0 && (
                <Polyline
                  points={points}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}
            </Svg>
          </View>
        );
      })}
    </View>
  );
}

// ─── Static trace (for Measurements screen) ───────────────────────────────────

interface StaticTraceProps {
  samples: number[];  // normalized [-1, 1]
  color: string;
  height?: number;
}

export function StaticTrace({ samples, color, height = 120 }: StaticTraceProps) {
  const n = samples.length;
  const W = 1000;
  const mid = height / 2;
  const amp = height * 0.38;
  const points = samples
    .map((v, i) => `${((i / (n - 1)) * W).toFixed(1)},${(mid - v * amp).toFixed(1)}`)
    .join(' ');

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none">
      <Polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </Svg>
  );
}

// ─── Waveform hook ────────────────────────────────────────────────────────────
//
// In DEMO_MODE, plays back the pre-recorded signal arrays from src/demo/*.raw
// in a continuous loop instead of the synthetic generator.

import { DEMO_MODE, PCG_DEMO_SAMPLES, ECG_DEMO_SAMPLES, PCG_DEMO_RATE, ECG_DEMO_RATE } from '../demo';

export function useWaveformBuffers(active: boolean, modality: 'pcg' | 'ecg' | null) {
  const BUF = 620;
  const pcgRef = useRef<number[]>(new Array(BUF).fill(0));
  const ecgRef = useRef<number[]>(new Array(BUF).fill(0));
  const cardiacRef   = useRef(0);
  const pcgCursorRef = useRef(0);
  const ecgCursorRef = useRef(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!active) return;

    if (DEMO_MODE) {
      // Display at 100 Hz visual rate → buffer (620 slots) shows ~6 seconds of signal.
      // Peak-hold per stride window preserves brief S1/S2 bursts that stride-step
      // sampling would miss entirely.
      const DISPLAY_HZ = 100;
      const displaySteps = Math.max(1, Math.round(DISPLAY_HZ * 0.08));
      const pcgStride = Math.max(1, Math.round(PCG_DEMO_RATE / DISPLAY_HZ));
      const ecgStride = Math.max(1, Math.round(ECG_DEMO_RATE / DISPLAY_HZ));

      const peakHold = (arr: number[], base: number, stride: number): number => {
        let best = arr[base % arr.length];
        for (let j = 1; j < stride; j++) {
          const s = arr[(base + j) % arr.length];
          if (Math.abs(s) > Math.abs(best)) best = s;
        }
        return best;
      };

      const interval = setInterval(() => {
        if (modality === 'pcg' || modality === null) {
          for (let k = 0; k < displaySteps; k++) {
            pcgRef.current.push(peakHold(PCG_DEMO_SAMPLES, pcgCursorRef.current, pcgStride));
            pcgRef.current.shift();
            pcgCursorRef.current += pcgStride;
          }
        }
        for (let k = 0; k < displaySteps; k++) {
          ecgRef.current.push(peakHold(ECG_DEMO_SAMPLES, ecgCursorRef.current, ecgStride));
          ecgRef.current.shift();
          ecgCursorRef.current += ecgStride;
        }
        setTick(t => t + 1);
      }, 80);
      return () => clearInterval(interval);
    }

    // Synthetic generator (non-demo mode).
    const CYCLE = 60 / 74;
    const RATE  = 220;
    const interval = setInterval(() => {
      const steps = Math.max(1, Math.round(RATE * 0.08));
      for (let k = 0; k < steps; k++) {
        cardiacRef.current += 1 / (CYCLE * RATE);
        if (cardiacRef.current >= 1) cardiacRef.current -= 1;
        const p = cardiacRef.current;
        if (modality === 'pcg' || modality === null) {
          pcgRef.current.push(pcgSample(p, 1, true));
          pcgRef.current.shift();
        }
        ecgRef.current.push(ecgSample(p, 1));
        ecgRef.current.shift();
      }
      setTick(t => t + 1);
    }, 80);
    return () => clearInterval(interval);
  }, [active, modality]);

  function reset() {
    pcgRef.current = new Array(BUF).fill(0);
    ecgRef.current = new Array(BUF).fill(0);
    cardiacRef.current = 0;
    pcgCursorRef.current = 0;
    ecgCursorRef.current = 0;
  }

  return { pcgBuf: pcgRef.current, ecgBuf: ecgRef.current, reset };
}

function gauss(x: number, mu: number, s: number) {
  return Math.exp(-((x - mu) ** 2) / (2 * s * s));
}
function pcgSample(p: number, q: number, abn: boolean) {
  let s = 0.95 * gauss(p, 0.12, 0.028) + 0.72 * gauss(p, 0.42, 0.024);
  if (abn && p > 0.15 && p < 0.40) s += 0.42 * (Math.random() * 2 - 1) * gauss(p, 0.27, 0.14);
  s *= 0.25 + 0.75 * q;
  s += (1 - q) * 0.28 * (Math.random() * 2 - 1);
  return s;
}
function ecgSample(p: number, q: number) {
  let s = 0.13 * gauss(p, 0.02, 0.02) - 0.09 * gauss(p, 0.10, 0.009)
    + 1.0 * gauss(p, 0.125, 0.006) - 0.20 * gauss(p, 0.15, 0.009)
    + 0.24 * gauss(p, 0.33, 0.032);
  s *= 0.55 + 0.45 * q;
  s += (1 - q) * 0.16 * (Math.random() * 2 - 1);
  return s;
}

const styles = StyleSheet.create({
  container: { position: 'relative', width: '100%' },
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'column',
  },
  trackLabel: {
    fontSize: 11,
    letterSpacing: 1.4,
    color: '#7E8CA0',
    textTransform: 'uppercase',
    fontWeight: '600',
    marginBottom: 6,
  },
  svg: { display: 'flex' },
});
