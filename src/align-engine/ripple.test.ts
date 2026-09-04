import { describe, expect, it } from "vitest";
import { defaultAnim, type Caption } from "@/schema";
import { applyIndependentResize, applyRippleMove, applyRippleResize, applyRoll } from "./ripple";

function cap(id: string, start: number, end: number): Caption {
  return {
    id,
    index: 0,
    text: id,
    startSec: start,
    endSec: end,
    words: [{ text: id, startSec: start, endSec: end, confidence: 1 }],
    animation: { in: defaultAnim(), out: defaultAnim(), highlight: { style: "color", intensity: 1 } },
    confidence: 1,
    instrumental: false,
    locked: false,
  };
}

describe("ripple math", () => {
  it("preserves inter-caption gaps when rippling an out-point", () => {
    const caps = [cap("a", 1, 2), cap("b", 2.4, 3.4), cap("c", 3.8, 4.8)];
    const gapAB = 2.4 - 2;
    const gapBC = 3.8 - 3.4;
    const res = applyRippleResize(caps, "a", "out", 2.5, 20);
    const a = res.captions.find((c) => c.id === "a")!;
    const b = res.captions.find((c) => c.id === "b")!;
    const c = res.captions.find((c) => c.id === "c")!;
    expect(a.startSec).toBeCloseTo(1);
    expect(a.endSec).toBeCloseTo(2.5);
    expect(b.startSec - a.endSec).toBeCloseTo(gapAB);
    expect(c.startSec - b.endSec).toBeCloseTo(gapBC);
  });

  it("clamps a ripple at the audio boundary", () => {
    const caps = [cap("a", 8, 9), cap("b", 9.2, 9.8)];
    const res = applyRippleResize(caps, "a", "out", 12, 10);
    expect(res.clamped).toBe(true);
    expect(res.captions[res.captions.length - 1]!.endSec).toBeLessThanOrEqual(10);
  });

  it("rolls a shared boundary without changing total span", () => {
    const caps = [cap("a", 1, 2), cap("b", 2, 4)];
    const res = applyRoll(caps, "a", 2.6);
    expect(res.captions[0]!.endSec).toBeCloseTo(2.6);
    expect(res.captions[1]!.startSec).toBeCloseTo(2.6);
    expect(res.captions[1]!.endSec - res.captions[0]!.startSec).toBeCloseTo(3);
  });

  it("independent resize does not move neighbors", () => {
    const caps = [cap("a", 1, 2), cap("b", 3, 4)];
    const res = applyIndependentResize(caps, "a", "out", 2.5, 20);
    expect(res.captions[1]!.startSec).toBe(3);
    expect(res.captions[0]!.endSec).toBeCloseTo(2.5);
  });

  it("ripple move shifts the tail as one unit", () => {
    const caps = [cap("a", 1, 2), cap("b", 3, 4)];
    const res = applyRippleMove(caps, "a", 1.5, 20);
    expect(res.captions[0]!.startSec).toBeCloseTo(1.5);
    expect(res.captions[1]!.startSec).toBeCloseTo(3.5);
  });
});
