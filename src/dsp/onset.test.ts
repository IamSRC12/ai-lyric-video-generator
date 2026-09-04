import { describe, expect, it } from "vitest";
import { detectOnsets, snapWordToOnset, refineSyllableStarts } from "./onset";
import type { WordTiming } from "@/schema";

describe("DSP Onset Detection & Snapping", () => {
  it("detects sharp energy bursts in audio signal", () => {
    const sampleRate = 44100;
    const signal = new Float32Array(sampleRate * 2);
    // Pulse at 0.5s and 1.2s
    for (let i = 0; i < 500; i++) {
      signal[Math.round(sampleRate * 0.5) + i] = 0.95 * Math.sin(i * 0.2);
      signal[Math.round(sampleRate * 1.2) + i] = 0.85 * Math.sin(i * 0.2);
    }

    const onsets = detectOnsets(signal, sampleRate);
    expect(onsets.length).toBeGreaterThanOrEqual(2);

    const nearFirst = onsets.some((t) => Math.abs(t - 0.5) < 0.08);
    const nearSecond = onsets.some((t) => Math.abs(t - 1.2) < 0.08);
    expect(nearFirst).toBe(true);
    expect(nearSecond).toBe(true);
  });

  it("snaps word within line boundaries strictly", () => {
    const onsets = [1.02, 2.05, 3.12];
    const word: WordTiming = {
      text: "test",
      start: 1.0,
      end: 1.6,
      confidence: 0.8,
      id: "test-word",
      source: "whisper",
    };

    const snapped = snapWordToOnset(word, onsets, 120, { start: 0.8, end: 2.5 });
    expect(snapped.start).toBe(1.02);

    // Boundary constraint test: candidate near upper bound with onset at 2.49
    const nearUpperWord: WordTiming = {
      text: "last",
      start: 2.48,
      end: 2.7,
      confidence: 0.8,
      id: "test-word",
      source: "whisper",
    };
    const clampedUpper = snapWordToOnset(nearUpperWord, [1.02, 2.05, 2.49], 120, { start: 0.8, end: 2.5 });
    expect(clampedUpper.start).toBeLessThanOrEqual(2.5 - 0.05);

    // Boundary constraint test: candidate near lower bound
    const nearLowerWord: WordTiming = {
      text: "first",
      start: 0.81,
      end: 1.2,
      confidence: 0.8,
      id: "test-word",
      source: "whisper",
    };
    const clampedLower = snapWordToOnset(nearLowerWord, onsets, 120, { start: 0.8, end: 2.5 });
    expect(clampedLower.start).toBeGreaterThanOrEqual(0.8);
  });

  it("refines syllable starts proportionally within word window", () => {
    const word: WordTiming = {
      text: "generation",
      start: 1.0,
      end: 2.0,
      confidence: 0.8,
      id: "test-word",
      source: "whisper",
    };
    const syllables = refineSyllableStarts(word, 4);
    expect(syllables.length).toBe(4);
    for (let i = 0; i < syllables.length; i++) {
      expect(syllables[i]).toBeGreaterThanOrEqual(1.0);
      expect(syllables[i]).toBeLessThanOrEqual(2.0);
    }
  });
});
