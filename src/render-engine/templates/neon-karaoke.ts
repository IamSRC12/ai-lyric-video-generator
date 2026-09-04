import type { Template } from "@/schema";
import { defaultBackground, defaultStyle } from "@/schema";

export const neonKaraokeTemplate: Template = {
  id: "neon-karaoke",
  name: "Neon Cyberpunk",
  blurb: "Cyan and magenta neon glow, futuristic Orbitron typography, starfield atmosphere.",
  aspect: "16:9",
  background: {
    ...defaultBackground(),
    type: "image",
    color: "#05060A",
    kenBurns: true,
    kenBurnsZoom: 1.08,
    blurPx: 8,
    dim: 0.55,
    visualizer: true,
    imageAssetId: "art-neon",
    overlay: {
      type: "starfield",
      opacity: 0.7,
      speed: 1.2,
      scale: 1,
      blendMode: "screen",
    },
  },
  overlays: [
    {
      type: "starfield",
      opacity: 0.7,
      speed: 1.2,
      scale: 1,
      blendMode: "screen",
    },
  ],
  captionStyle: {
    ...defaultStyle(),
    fontFamily: "Orbitron",
    fontWeight: 700,
    fontSizePct: 4.6,
    letterSpacing: 0.08,
    fill: "#E8FBFF",
    activeFill: "#67F0FF",
    pastFill: "#8A6CFF",
    futureFill: "#D7E4EA",
    highlightFill: "#67F0FF",
    glow: { color: "#67F0FF", blur: 18, opacity: 0.85 },
    shadow: { x: 0, y: 0, blur: 18, color: "#FF2BD6", opacity: 0.45 },
    box: { enabled: true, fill: "#05060A", opacity: 0.35, paddingX: 32, paddingY: 18, radius: 999 },
    karaoke: "word-color",
    activeScale: 1.08,
    yPercent: 78,
  },
  animations: {
    lineIn: [{ type: "fade", inMs: 250, outMs: 200 }],
    wordActive: [{ type: "glow-pulse", toBeat: true }],
  },
};
