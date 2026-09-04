export { applyEasing, cubicBezier, hashString, mulberry32, spring } from "./easing";
export {
  STYLE_PRESETS,
  TEMPLATES,
  applyPreset,
  applyTemplateToProject,
  getTemplateById,
  presetById,
  resolveTemplateStyle,
  type StylePreset,
} from "./presets";
export { drawFrame } from "./draw-frame";
export { SoftwareCanvas } from "./software-canvas";
export { fontString, type FrameContext, type FrameImage, type ResolvedAssets } from "./context";

export function asFrameContext(ctx: unknown): import("./context").FrameContext {
  return ctx as import("./context").FrameContext;
}

