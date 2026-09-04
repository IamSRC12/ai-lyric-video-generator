import type { WordTiming } from "@/schema";

/**
 * Detect transient/vocal onset locations (in float seconds) in an audio buffer
 * using short-time root-mean-square energy flux and adaptive threshold peak picking.
 */
export function detectOnsets(
  signal: Float32Array,
  sampleRate: number,
  hopMs = 10,
  frameMs = 25,
  minPeakDistanceMs = 45,
): number[] {
  if (!signal || signal.length === 0 || sampleRate <= 0) return [];

  const hopSamples = Math.max(1, Math.floor((hopMs / 1000) * sampleRate));
  const frameSamples = Math.max(hopSamples, Math.floor((frameMs / 1000) * sampleRate));
  const numFrames = Math.floor((signal.length - frameSamples) / hopSamples);
  if (numFrames <= 0) return [];

  // 1. Calculate frame RMS energy
  const energies = new Float32Array(numFrames);
  for (let f = 0; f < numFrames; f++) {
    let sum = 0;
    const start = f * hopSamples;
    for (let i = 0; i < frameSamples; i++) {
      const s = signal[start + i] ?? 0;
      sum += s * s;
    }
    energies[f] = Math.sqrt(sum / frameSamples);
  }

  // 2. Compute rectified first-order energy flux (rise in energy)
  const flux = new Float32Array(numFrames);
  let maxFlux = 1e-6;
  for (let f = 1; f < numFrames; f++) {
    const diff = (energies[f] ?? 0) - (energies[f - 1] ?? 0);
    const rise = diff > 0 ? diff : 0;
    flux[f] = rise;
    if (rise > maxFlux) maxFlux = rise;
  }

  // Normalize flux to 0..1
  for (let f = 0; f < numFrames; f++) {
    flux[f] = (flux[f] ?? 0) / maxFlux;
  }

  // 3. Peak detection with moving average threshold
  const onsets: number[] = [];
  const windowRadius = 7;
  const minDistanceFrames = Math.max(1, Math.floor(minPeakDistanceMs / hopMs));
  let lastPeakFrame = -minDistanceFrames;

  for (let f = 2; f < numFrames - 2; f++) {
    const val = flux[f] ?? 0;
    if (val < 0.12) continue; // Noise floor

    // Local maximum check
    const isPeak =
      val > (flux[f - 1] ?? 0) &&
      val >= (flux[f + 1] ?? 0) &&
      val > (flux[f - 2] ?? 0) &&
      val >= (flux[f + 2] ?? 0);

    if (!isPeak) continue;

    // Moving average threshold
    let localSum = 0;
    let localCount = 0;
    for (let k = Math.max(0, f - windowRadius); k <= Math.min(numFrames - 1, f + windowRadius); k++) {
      localSum += flux[k] ?? 0;
      localCount++;
    }
    const localAvg = localSum / Math.max(1, localCount);
    const threshold = localAvg * 1.35 + 0.05;

    if (val >= threshold && f - lastPeakFrame >= minDistanceFrames) {
      const timeSec = (f * hopSamples) / sampleRate;
      onsets.push(timeSec);
      lastPeakFrame = f;
    }
  }

  return onsets;
}

/**
 * Snaps a single word timing's start to the nearest audio onset within a configurable window (±120ms default).
 * Strictly guarantees that the snapped word boundary never escapes its parent line bounds.
 */
export function snapWordToOnset(
  word: WordTiming,
  onsets: number[],
  windowMs = 120,
  parentLine?: { start: number; end: number },
): WordTiming {
  if (!onsets || onsets.length === 0) {
    return { ...word };
  }

  const windowSec = windowMs / 1000;
  const wStart = word.start;
  const wEnd = word.end;
  const originalDuration = Math.max(0.06, wEnd - wStart);

  // Search candidate onsets in [wStart - windowSec, wStart + windowSec]
  let bestOnset: number | null = null;
  let minDiff = Infinity;

  for (const onset of onsets) {
    const diff = Math.abs(onset - wStart);
    if (diff <= windowSec && diff < minDiff) {
      minDiff = diff;
      bestOnset = onset;
    }
  }

  if (bestOnset === null) {
    return { ...word };
  }

  let snappedStart = bestOnset;

  // Clamp strictly inside parent line window
  if (parentLine) {
    const minStart = parentLine.start;
    const maxStart = Math.max(minStart, parentLine.end - 0.06);
    snappedStart = Math.max(minStart, Math.min(maxStart, snappedStart));
  }

  const delta = Math.abs(snappedStart - wStart);
  let snappedEnd = wEnd;

  // If start moved significantly, adjust end to maintain reasonable duration
  if (delta > 0.02) {
    snappedEnd = Math.max(snappedStart + 0.06, Math.min(snappedStart + originalDuration, parentLine?.end ?? wEnd + 0.5));
  }

  // Adjust confidence based on delta
  let conf = word.confidence;
  if (delta > 0.08) {
    conf = Math.max(0.2, conf - 0.15);
  } else {
    conf = Math.min(1.0, conf + 0.1);
  }

  return {
    ...word,
    start: snappedStart,
    end: snappedEnd,
    startSec: snappedStart,
    endSec: snappedEnd,
    confidence: conf,
    source: "snapped",
  };
}

/**
 * Computes refined syllable starting timestamps within a word timing span.
 * Uses peak detection across the word audio window if signal is present,
 * with graceful phonetic vowel subdivision fallback.
 */
export function refineSyllableStarts(
  word: WordTiming,
  syllableCount: number,
  signal?: Float32Array,
  sampleRate?: number,
): number[] {
  const count = Math.max(1, syllableCount);
  const wStart = word.start;
  const wEnd = word.end;
  const span = Math.max(0.04, wEnd - wStart);

  if (count === 1) {
    return [wStart];
  }

  // If audio signal is provided, try finding energy peaks inside the word window
  if (signal && sampleRate && sampleRate > 0) {
    const startSample = Math.max(0, Math.floor(wStart * sampleRate));
    const endSample = Math.min(signal.length, Math.floor(wEnd * sampleRate));
    const wordSignal = signal.subarray(startSample, endSample);

    if (wordSignal.length > 256) {
      const peaks = detectOnsets(wordSignal, sampleRate, 8, 20, 30);
      if (peaks.length >= count - 1) {
        const starts: number[] = [wStart];
        for (let i = 0; i < count - 1 && i < peaks.length; i++) {
          const sTime = wStart + (peaks[i] ?? 0);
          if (sTime > wStart + 0.03 && sTime < wEnd - 0.03) {
            starts.push(sTime);
          }
        }
        if (starts.length === count) {
          starts.sort((a, b) => a - b);
          return starts;
        }
      }
    }
  }

  // Fallback: smooth weighted sub-divisions
  const step = span / count;
  const result: number[] = [];
  for (let i = 0; i < count; i++) {
    result.push(wStart + i * step);
  }
  return result;
}
