import type { Template } from "@/schema";
import { defaultBackground, defaultStyle } from "@/schema";

export const sevenCloudsTemplate: Template = {
  id: "seven-clouds",
  name: "7clouds Gold",
  blurb: "Blurred slow-zoom album art, Outfit geometric sans, word-by-word gold karaoke wipe.",
  aspect: "16:9",
  background: {
    ...defaultBackground(),
    type: "album-blur",
    kenBurns: true,
    kenBurnsZoom: 1.14,
    blurPx: 32,
    dim: 0.42,
  },
  overlays: [],
  captionStyle: {
    ...defaultStyle(),
    fontFamily: "Outfit",
    fontWeight: 600,
    fontSizePct: 5.2,
    lineHeight: 1.25,
    letterSpacing: 0.02,
    align: "center",
    fill: "#F7F4EE",
    activeFill: "#F5C15A",
    pastFill: "#D4CFC4",
    futureFill: "#F7F4EE",
    highlightFill: "#F5C15A",
    karaoke: "wipe",
    activeScale: 1.06,
    inactiveOpacity: 0.75,
    shadow: { x: 0, y: 6, blur: 22, color: "#000000", opacity: 0.6 },
    yPercent: 74,
  },
  animations: {
    lineIn: [{ type: "fade", inMs: 250, outMs: 200 }],
    wordActive: [{ type: "karaoke-wipe" }],
  },
};
