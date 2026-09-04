import type { Template } from "@/schema";
import { defaultBackground, defaultStyle } from "@/schema";

export const minimalEditorialTemplate: Template = {
  id: "editorial",
  name: "Minimal Editorial",
  blurb: "Quiet Fraunces serif italic, generous cream spacing, subtle analog scanlines.",
  aspect: "16:9",
  background: {
    ...defaultBackground(),
    type: "image",
    color: "#EFE7D6",
    colorB: "#D9CFB8",
    kenBurns: false,
    kenBurnsZoom: 1,
    blurPx: 0,
    dim: 0.08,
    visualizer: false,
    imageAssetId: "art-editorial",
    overlay: {
      type: "scanlines",
      opacity: 0.35,
      speed: 0.8,
      scale: 1,
      blendMode: "screen",
    },
  },
  overlays: [
    {
      type: "scanlines",
      opacity: 0.35,
      speed: 0.8,
      scale: 1,
      blendMode: "screen",
    },
  ],
  captionStyle: {
    ...defaultStyle(),
    fontFamily: "Fraunces",
    fontWeight: 500,
    italic: true,
    fontSizePct: 4.4,
    letterSpacing: 0,
    fill: "#2A241C",
    activeFill: "#8A3B12",
    pastFill: "#6B6256",
    futureFill: "#2A241C",
    highlightFill: "#8A3B12",
    karaoke: "word-color",
    shadow: { x: 0, y: 0, blur: 0, color: "#000000", opacity: 0 },
    yPercent: 68,
  },
  animations: {
    lineIn: [{ type: "fade", inMs: 300, outMs: 300 }],
  },
};
