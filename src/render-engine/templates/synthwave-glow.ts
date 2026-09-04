import type { Template } from "@/schema";
import { defaultBackground, defaultStyle } from "@/schema";

export const synthwaveGlowTemplate: Template = {
  id: "synthwave-glow",
  name: "Synthwave Outrun",
  blurb: "80s retro grid wave, glowing magenta outline, Righteous font with audio reactive visualizer.",
  aspect: "16:9",
  background: {
    ...defaultBackground(),
    type: "gradient",
    color: "#100028",
    colorB: "#350066",
    angleDeg: 180,
    dim: 0.3,
    visualizer: true,
    overlay: {
      type: "scanlines",
      opacity: 0.45,
      speed: 1.5,
      scale: 1,
      blendMode: "screen",
    },
  },
  overlays: [
    {
      type: "scanlines",
      opacity: 0.45,
      speed: 1.5,
      scale: 1,
      blendMode: "screen",
    },
  ],
  captionStyle: {
    ...defaultStyle(),
    fontFamily: "Righteous",
    fontWeight: 400,
    fontSizePct: 5.0,
    letterSpacing: 0.06,
    fill: "#FFE6FA",
    activeFill: "#FF1493",
    pastFill: "#7B68EE",
    futureFill: "#FFE6FA",
    highlightFill: "#FF1493",
    glow: { color: "#FF1493", blur: 24, opacity: 0.95 },
    karaoke: "word-color",
    activeScale: 1.08,
    yPercent: 75,
  },
  animations: {
    lineIn: [{ type: "slide", dx: 0, dy: -20, ms: 200 }],
    wordActive: [{ type: "glow-pulse", toBeat: true }],
  },
};
