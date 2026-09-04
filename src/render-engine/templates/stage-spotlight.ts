import type { Template } from "@/schema";
import { defaultBackground, defaultStyle } from "@/schema";

export const stageSpotlightTemplate: Template = {
  id: "stage-spotlight",
  name: "Stage Spotlight",
  blurb: "Theatrical gold Cinzel serif uppercase with glowing box backing and warm bokeh atmosphere.",
  aspect: "16:9",
  background: {
    ...defaultBackground(),
    type: "album-blur",
    color: "#070604",
    kenBurns: true,
    kenBurnsZoom: 1.1,
    blurPx: 18,
    dim: 0.5,
    visualizer: false,
    imageAssetId: "art-spotlight",
    overlay: {
      type: "bokeh",
      opacity: 0.75,
      speed: 1,
      scale: 1,
      blendMode: "screen",
    },
  },
  overlays: [
    {
      type: "bokeh",
      opacity: 0.75,
      speed: 1,
      scale: 1,
      blendMode: "screen",
    },
  ],
  captionStyle: {
    ...defaultStyle(),
    fontFamily: "Cinzel",
    fontWeight: 700,
    fontSizePct: 4.8,
    letterSpacing: 0.12,
    transform: "uppercase",
    uppercase: true,
    fill: "#F8E7B0",
    activeFill: "#FFE08A",
    pastFill: "#B89A4A",
    futureFill: "#E6D7A2",
    highlightFill: "#FFE08A",
    glow: { color: "#F5C15A", blur: 16, opacity: 0.55 },
    shadow: { x: 0, y: 10, blur: 28, color: "#000000", opacity: 0.7 },
    box: { enabled: true, fill: "#000000", opacity: 0.28, paddingX: 36, paddingY: 18, radius: 4 },
    karaoke: "outline-fill",
    activeScale: 1.05,
    yPercent: 76,
  },
  animations: {
    lineIn: [{ type: "fade", inMs: 250, outMs: 250 }],
  },
};
