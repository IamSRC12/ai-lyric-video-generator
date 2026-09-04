import { describe, expect, it } from "vitest";
import { defaultProject } from "@/schema";
import { heuristicSync, parseLyrics } from "@/align-engine";
import { drawFrame } from "./draw-frame";
import { SoftwareCanvas } from "./software-canvas";

describe("drawFrame determinism", () => {
  it("renders identical pixels for the same timeSec", () => {
    const lyrics = parseLyrics("hello world\nsecond line");
    const { captions } = heuristicSync(lyrics.lines, 12);
    const project = defaultProject({
      id: "det",
      meta: {
        title: "Determinism",
        artist: "Tests",
        durationSec: 12,
        fps: 30,
        resolution: "1280x720",
        aspectRatio: "16:9",
        language: "en",
      },
      captions,
    });
    const a = new SoftwareCanvas(320, 180);
    const b = new SoftwareCanvas(320, 180);
    drawFrame(a, project, 1.25, {});
    drawFrame(b, project, 1.25, {});
    expect(a.pixels.length).toBe(b.pixels.length);
    for (let i = 0; i < a.pixels.length; i += 1) {
      expect(a.pixels[i]).toBe(b.pixels[i]);
    }
    expect(a.ops.map((o) => `${o.kind}:${o.payload}`).join("|")).toBe(b.ops.map((o) => `${o.kind}:${o.payload}`).join("|"));
  }, 15000);
});
