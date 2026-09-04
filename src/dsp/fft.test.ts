import { describe, expect, it } from "vitest";
import { crossCorrelate, fftInPlace, naiveDft } from "./index";

describe("FFT", () => {
  it("matches a naive DFT on a known signal", () => {
    const n = 16;
    const re = new Float32Array(n);
    const im = new Float32Array(n);
    for (let i = 0; i < n; i += 1) re[i] = Math.sin((2 * Math.PI * 3 * i) / n) + 0.25 * Math.cos((2 * Math.PI * i) / n);
    const naive = naiveDft(re, im);
    fftInPlace(re, im);
    for (let i = 0; i < n; i += 1) {
      expect(re[i]).toBeCloseTo(naive.re[i]!, 4);
      expect(im[i]).toBeCloseTo(naive.im[i]!, 4);
    }
  });

  it("recovers a known delay via cross-correlation", () => {
    const sr = 1000;
    const master = new Float32Array(sr);
    const clip = new Float32Array(80);
    for (let i = 0; i < clip.length; i += 1) clip[i] = Math.sin((2 * Math.PI * 40 * i) / sr);
    const delay = 220;
    for (let i = 0; i < clip.length; i += 1) master[delay + i] = clip[i]!;
    const hit = crossCorrelate(master, clip, sr);
    expect(Math.abs(hit.offsetSamples - delay)).toBeLessThan(2);
    expect(hit.peakConfidence).toBeGreaterThan(0.7);
  });
});
