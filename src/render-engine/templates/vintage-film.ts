import type { Template } from "@/schema";
import { defaultBackground, defaultStyle } from "@/schema";

export const vintageFilmTemplate: Template = {
  id: "vintage-film",
  name: "Vintage Film 16mm",
  blurb: "Warm analog grain, organic light leaks, Space Grotesk minimal subtitles.",
  aspect: "16:9",
  background: {
    ...defaultBackground(),
    type: "album-blur",
    color: "#120D0A",
    blurPx: 24,
    dim: 0.4,
    overlay: {
      type: "light-leak",
      opacity: 0.6,
      speed: 0.8,
      scale: 1.2,
      blendMode: "screen",
    },
  },
  overlays: [
    {
      type: "light-leak",
      opacity: 0.6,
      speed: 0.8,
      scale: 1.2,
      blendMode: "screen",
    },
  ],
  captionStyle: {
    ...defaultStyle(),
    fontFamily: "Space Grotesk",
    fontWeight: 500,
    fontSizePct: 4.2,
    letterSpacing: 0.04,
    fill: "#FAF6EE",
    activeFill: "#FFB067",
    pastFill: "#A0968B",
    futureFill: "#FAF6EE",
    highlightFill: "#FFB067",
    shadow: { x: 0, y: 2, blur: 12, color: "#000000", opacity: 0.7 },
    karaoke: "word-color",
    activeScale: 1.04,
    yPercent: 80,
  },
  animations: {
    lineIn: [{ type: "fade", inMs: 300, outMs: 250 }],
  },
};
