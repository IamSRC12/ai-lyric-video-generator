import { describe, expect, it } from "vitest";
import { TEMPLATES, getTemplateById, applyTemplateToProject, resolveTemplateStyle } from "./templates";
import { defaultProject } from "@/schema";

describe("Templates Design System", () => {
  it("provides 8 distinct templates with curated styles", () => {
    expect(TEMPLATES.length).toBe(8);
    const ids = TEMPLATES.map((t) => t.id);
    expect(ids).toContain("seven-clouds");
    expect(ids).toContain("tiktok-viral");
    expect(ids).toContain("neon-karaoke");
    expect(ids).toContain("editorial");
    expect(ids).toContain("stage-spotlight");
    expect(ids).toContain("kinetic-pop");
    expect(ids).toContain("synthwave-glow");
    expect(ids).toContain("vintage-film");
  });

  it("NEVER mutates caption timestamps when applying a template", () => {
    const originalProject = defaultProject({
      id: "test-proj",
      templateId: "seven-clouds",
      captions: [
        {
          id: "c1",
          index: 0,
          text: "First line of song",
          startSec: 2.5,
          endSec: 5.8,
          words: [
            { text: "First", startSec: 2.5, endSec: 3.2, confidence: 0.9 },
            { text: "line", startSec: 3.2, endSec: 4.0, confidence: 0.9 },
            { text: "of", startSec: 4.0, endSec: 4.5, confidence: 0.9 },
            { text: "song", startSec: 4.5, endSec: 5.8, confidence: 0.9 },
          ],
          animation: { in: { preset: "fade", durationSec: 0.25, delaySec: 0, easing: { type: "named", name: "ease-out-cubic" } }, out: { preset: "fade", durationSec: 0.25, delaySec: 0, easing: { type: "named", name: "ease-out-cubic" } }, highlight: { style: "color", intensity: 1 } },
          confidence: 0.9,
          instrumental: false,
          locked: false,
        },
      ],
    });

    const updated = applyTemplateToProject(originalProject, "tiktok-viral");

    // Template identity updated
    expect(updated.templateId).toBe("tiktok-viral");
    expect(updated.defaultStyle.fontFamily).toBe("Montserrat");
    expect(updated.defaultStyle.backgroundPill?.enabled).toBe(true);

    // Timing integrity guarantee: captions and word timestamps are completely untouched
    expect(updated.captions[0]!.startSec).toBe(2.5);
    expect(updated.captions[0]!.endSec).toBe(5.8);
    expect(updated.captions[0]!.words[0]!.startSec).toBe(2.5);
    expect(updated.captions[0]!.words[0]!.endSec).toBe(3.2);
    expect(updated.captions[0]!.words[3]!.startSec).toBe(4.5);
    expect(updated.captions[0]!.words[3]!.endSec).toBe(5.8);
  });

  it("resolves template style cascading correctly", () => {
    const project = defaultProject({
      id: "casc",
      templateId: "neon-karaoke",
    });

    const style = resolveTemplateStyle(project);
    expect(style.fontFamily).toBe("Orbitron");
    expect(style.karaoke).toBe("word-color");
  });
});
