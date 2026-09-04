import type { Template } from "@/schema";
import { defaultBackground, defaultStyle } from "@/schema";

export const kineticPopTemplate: Template = {
  id: "kinetic-pop",
  name: "Kinetic Pop",
  blurb: "Punchy Bebas Neue typeface, active word bounce pop, high-energy neon color shifts.",
  aspect: "9:16",
  background: {
    ...defaultBackground(),
    type: "gradient",
    color: "#FF3366",
    colorB: "#330066",
    angleDeg: 135,
    dim: 0.2,
  },
  overlays: [],
  captionStyle: {
    ...defaultStyle(),
    fontFamily: "Bebas Neue",
    fontWeight: 700,
    uppercase: true,
    transform: "uppercase",
    fontSizePct: 6.2,
    letterSpacing: 0.05,
    align: "center",
    fill: "#FFFFFF",
    activeFill: "#00FFA3",
    pastFill: "#FFAACC",
    futureFill: "#FFFFFF",
    highlightFill: "#00FFA3",
    karaoke: "wipe",
    activeScale: 1.15,
    shadow: { x: 4, y: 4, blur: 0, color: "#000000", opacity: 0.8 },
    yPercent: 70,
  },
  animations: {
    lineIn: [{ type: "bounce", amp: 1.15, ms: 220 }],
    wordActive: [
      { type: "scale", from: 1.0, to: 1.15, inMs: 120, ease: "ease-out-cubic" },
      { type: "karaoke-wipe" },
    ],
  },
};
