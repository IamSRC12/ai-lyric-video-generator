import { fftInPlace, ifftInPlace, nextPow2 } from "./fft";

export interface CorrelationHit {
  offsetSamples: number;
  offsetSec: number;
  peakConfidence: number;
}

function energy(signal: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < signal.length; i += 1) {
    const v = signal[i] ?? 0;
    sum += v * v;
  }
  return sum;
}

function decimate(signal: Float32Array, factor: number): Float32Array {
  if (factor <= 1) return signal;
  const outLen = Math.floor(signal.length / factor);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i += 1) {
    let sum = 0;
    const start = i * factor;
    for (let j = 0; j < factor; j += 1) {
      sum += signal[start + j] || 0;
    }
    out[i] = sum / factor;
  }
  return out;
}

/**
 * Standard single-pass cross-correlation via IFFT(FFT(a) · conj(FFT(b))).
 */
export function rawCrossCorrelate(
  master: Float32Array,
  clip: Float32Array,
  sampleRate: number,
  searchStart = 0,
  searchEnd?: number,
): CorrelationHit {
  if (clip.length === 0 || master.length === 0) {
    return { offsetSamples: 0, offsetSec: 0, peakConfidence: 0 };
  }
  const windowEnd = Math.min(master.length, searchEnd ?? master.length);
  const windowStart = Math.max(0, Math.min(searchStart, windowEnd));
  const regionLen = Math.max(1, windowEnd - windowStart);
  const n = nextPow2(regionLen + clip.length);
  const aRe = new Float32Array(n);
  const aIm = new Float32Array(n);
  const bRe = new Float32Array(n);
  const bIm = new Float32Array(n);
  for (let i = 0; i < regionLen; i += 1) aRe[i] = master[windowStart + i] ?? 0;
  for (let i = 0; i < clip.length; i += 1) bRe[i] = clip[i] ?? 0;
  fftInPlace(aRe, aIm);
  fftInPlace(bRe, bIm);
  for (let i = 0; i < n; i += 1) {
    const ar = aRe[i] ?? 0;
    const ai = aIm[i] ?? 0;
    const br = bRe[i] ?? 0;
    const bi = bIm[i] ?? 0;
    // a * conj(b)
    aRe[i] = ar * br + ai * bi;
    aIm[i] = ai * br - ar * bi;
  }
  ifftInPlace(aRe, aIm);
  const clipEnergy = energy(clip);
  let best = 0;
  let bestVal = Number.NEGATIVE_INFINITY;
  const maxLag = Math.max(1, regionLen - 1);
  for (let lag = 0; lag < maxLag; lag += 1) {
    const val = aRe[lag] ?? 0;
    if (val > bestVal) {
      bestVal = val;
      best = lag;
    }
  }
  let localEnergy = 0;
  const span = Math.min(clip.length, regionLen - best);
  for (let i = 0; i < span; i += 1) {
    const v = master[windowStart + best + i] ?? 0;
    localEnergy += v * v;
  }
  const denom = Math.sqrt(Math.max(1e-12, clipEnergy * Math.max(1e-12, localEnergy)));
  const peakConfidence = Math.max(0, Math.min(1, bestVal / denom));
  const offsetSamples = windowStart + best;
  return {
    offsetSamples,
    offsetSec: offsetSamples / sampleRate,
    peakConfidence,
  };
}

/**
 * Hierarchical fast cross-correlation:
 * 1. Coarse search in 4x downsampled space (4,000 Hz) for blazing speed.
 * 2. Fine refinement in a narrow ±0.5s window at full sample rate for sample accuracy.
 */
export function crossCorrelate(
  master: Float32Array,
  clip: Float32Array,
  sampleRate: number,
  searchStart = 0,
  searchEnd?: number,
): CorrelationHit {
  if (clip.length === 0 || master.length === 0) {
    return { offsetSamples: 0, offsetSec: 0, peakConfidence: 0 };
  }

  // For short regions (< 2 seconds), use direct raw correlation
  if (master.length < sampleRate * 2 || (searchEnd !== undefined && (searchEnd - searchStart) < sampleRate * 2)) {
    return rawCrossCorrelate(master, clip, sampleRate, searchStart, searchEnd);
  }

  // Coarse search at 4x decimation
  const factor = 4;
  const windowEnd = Math.min(master.length, searchEnd ?? master.length);
  const windowStart = Math.max(0, Math.min(searchStart, windowEnd));
  const masterSlice = master.subarray(windowStart, windowEnd);

  const coarseMaster = decimate(masterSlice, factor);
  const coarseClip = decimate(clip, factor);
  const coarseHit = rawCrossCorrelate(coarseMaster, coarseClip, sampleRate / factor);

  if (coarseHit.peakConfidence < 0.25) {
    return {
      offsetSamples: windowStart + coarseHit.offsetSamples * factor,
      offsetSec: (windowStart + coarseHit.offsetSamples * factor) / sampleRate,
      peakConfidence: coarseHit.peakConfidence,
    };
  }

  // Refine in a ±0.5s window at full resolution
  const coarseOffset = windowStart + coarseHit.offsetSamples * factor;
  const pad = Math.round(sampleRate * 0.5);
  const refineStart = Math.max(0, coarseOffset - pad);
  const refineEnd = Math.min(master.length, coarseOffset + clip.length + pad);

  return rawCrossCorrelate(master, clip, sampleRate, refineStart, refineEnd);
}

export const ANCHOR_CONFIDENCE_FLOOR = 0.42;

export function locateClip(
  master: Float32Array,
  clip: Float32Array,
  sampleRate: number,
  cursorSec: number,
  windowSec = 12,
): CorrelationHit {
  const start = Math.max(0, Math.floor((cursorSec - 1.5) * sampleRate));
  const end = Math.min(master.length, Math.ceil((cursorSec + windowSec) * sampleRate));
  return crossCorrelate(master, clip, sampleRate, start, end);
}
