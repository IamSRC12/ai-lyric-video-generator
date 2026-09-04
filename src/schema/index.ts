import { z } from "zod";

/** Industry-standard choice: document times are always float seconds; frames/ms only at display/encode edges. */

export const ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:5", "21:9"] as const;
export const RESOLUTIONS = ["1280x720", "1920x1080", "2560x1440", "3840x2160"] as const;
export const FPS_OPTIONS = [24, 25, 30, 50, 60] as const;
export const RIPPLE_MODES = ["independent", "ripple", "roll", "relink"] as const;
export const QUALITY_PRESETS = ["high", "balanced", "small", "custom"] as const;

export const HexColorSchema = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);

export const EasingNameSchema = z.enum([
  "linear",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "ease-in-cubic",
  "ease-out-cubic",
  "ease-in-out-cubic",
  "ease-out-back",
  "ease-out-expo",
]);

export const EasingSchema = z.object({
  type: z.enum(["named", "cubic-bezier", "spring"]),
  name: EasingNameSchema.optional(),
  bezier: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
  stiffness: z.number().optional(),
  damping: z.number().optional(),
});

export const AnimPresetSchema = z.enum([
  "none",
  "fade",
  "slide",
  "scale",
  "blur",
  "typewriter",
  "cascade",
  "wipe",
  "spring",
  "pop",
  "bounce",
  "wave",
]);

export const CustomAnimationKeyframeSchema = z.object({
  at: z.number().min(0).max(1),
  opacity: z.number().min(0).max(1).optional(),
  translateX: z.number().min(-4096).max(4096).optional(),
  translateY: z.number().min(-4096).max(4096).optional(),
  scale: z.number().min(0).max(20).optional(),
  rotation: z.number().min(-3600).max(3600).optional(),
  blur: z.number().min(0).max(256).optional(),
});
export const CustomAnimationSchema = z.object({
  version: z.literal(1),
  enabled: z.boolean().default(true),
  target: z.enum(["line", "word"]).default("line"),
  durationSec: z.number().positive().max(60),
  offsetSec: z.number().min(-60).max(60).default(0),
  easing: EasingNameSchema.default("linear"),
  keyframes: z.array(CustomAnimationKeyframeSchema).min(2).max(64),
});

export const AnimSpecSchema = z.object({
  preset: AnimPresetSchema,
  durationSec: z.number().nonnegative(),
  delaySec: z.number().nonnegative(),
  easing: EasingSchema,
  direction: z.enum(["up", "down", "left", "right"]).optional(),
  distance: z.number().optional(),
  staggerSec: z.number().optional(),
  custom: CustomAnimationSchema.optional(),
});

export const HighlightStyleSchema = z.enum([
  "none",
  "color",
  "sweep",
  "box",
  "scale",
  "underline",
  "glow",
  "shimmer",
]);

export const OVERLAY_TYPES = [
  "none",
  "bokeh",
  "starfield",
  "soundwave",
  "embers",
  "light-leak",
  "scanlines",
  "lottie",
] as const;

export const OverlaySpecSchema = z.object({
  type: z.enum(OVERLAY_TYPES).default("none"),
  opacity: z.number().min(0).max(1).default(0.6),
  speed: z.number().min(0.1).max(5).default(1),
  blendMode: z.enum(["source-over", "screen", "lighter"]).default("screen"),
  scale: z.number().min(0.2).max(3).default(1),
  lottieJson: z.string().optional(),
  lottieName: z.string().optional(),
});

export type OverlaySpec = z.infer<typeof OverlaySpecSchema>;

export const HighlightSpecSchema = z.object({
  style: HighlightStyleSchema,
  intensity: z.number().min(0).max(2).default(1),
  enabled: z.boolean().default(true).optional(),
});

export const ShadowSchema = z.object({
  x: z.number(),
  y: z.number(),
  blur: z.number().nonnegative(),
  color: z.string(),
  opacity: z.number().min(0).max(1),
});

export const GlowSchema = z.object({
  color: z.string(),
  blur: z.number().nonnegative(),
  opacity: z.number().min(0).max(1),
});

export const GradientStopSchema = z.object({
  offset: z.number().min(0).max(1),
  color: z.string(),
});

export const GradientSchema = z.object({
  enabled: z.boolean(),
  angleDeg: z.number(),
  stops: z.array(GradientStopSchema).min(2),
});

export const CaptionBoxSchema = z.object({
  enabled: z.boolean(),
  fill: z.string(),
  opacity: z.number().min(0).max(1),
  paddingX: z.number(),
  paddingY: z.number(),
  radius: z.number(),
});

export const AnchorSchema = z.enum([
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "middle-center",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
]);

export const BackgroundPillSchema = z.object({
  enabled: z.boolean().default(false).optional(),
  color: z.string().default("#000000"),
  radius: z.number().default(12),
  padX: z.number().default(24),
  padY: z.number().default(14),
  opacity: z.number().min(0).max(1).default(0.4),
});

export const CaptionPositionSchema = z.object({
  x: z.number().default(50),
  y: z.number().default(72),
  anchor: z.enum(["top", "center", "bottom"]).default("center"),
});

export const KaraokeModeSchema = z.enum(["none", "word-color", "wipe", "outline-fill"]);
export type KaraokeMode = z.infer<typeof KaraokeModeSchema>;

export const CaptionStyleSchema = z.object({
  fontFamily: z.string(),
  fontWeight: z.number(),
  italic: z.boolean().default(false),
  fontSizePct: z.number().default(5),
  fontSize: z.number().optional(), // alias/relative helper
  lineHeight: z.number().default(1.2),
  letterSpacing: z.number().default(0.02),
  wordSpacing: z.number().default(0).optional(),
  align: z.enum(["left", "center", "right"]).default("center"),
  uppercase: z.boolean().default(false).optional(),
  transform: z.enum(["uppercase", "lowercase", "capitalize", "none"]).optional(),
  maxCharsPerLine: z.number().default(32),
  maxLines: z.number().default(2),
  maxWidth: z.number().default(90).optional(),
  fill: z.string().default("#F4F1EA"),
  activeFill: z.string().default("#F5C15A").optional(),
  inactiveFill: z.string().default("#C8C2B4").optional(),
  highlightFill: z.string().default("#F5C15A"),
  pastFill: z.string().default("#C8C2B4"),
  futureFill: z.string().default("#F4F1EA"),
  strokeWidth: z.number().default(0).optional(),
  strokeColor: z.string().default("#000000").optional(),
  outlineColor: z.string().optional(),
  outlineWidth: z.number().optional(),
  shadow: ShadowSchema.optional(),
  glow: GlowSchema.optional(),
  gradient: GradientSchema.optional(),
  box: CaptionBoxSchema.optional(),
  backgroundPill: BackgroundPillSchema.optional(),
  position: CaptionPositionSchema.optional(),
  anchor: AnchorSchema.default("middle-center"),
  xPercent: z.number().default(50),
  yPercent: z.number().default(72),
  rotation: z.number().default(0),
  scale: z.number().default(1),
  karaoke: KaraokeModeSchema.default("word-color").optional(),
  activeScale: z.number().default(1.05).optional(),
  inactiveOpacity: z.number().min(0).max(1).default(0.7).optional(),
});

export const WordTimingSourceSchema = z.enum(["whisper", "aligned", "snapped", "manual"]);
export type WordTimingSource = z.infer<typeof WordTimingSourceSchema>;

export const WordSchema = z.object({
  id: z.string().optional(),
  text: z.string(),
  startSec: z.number(),
  endSec: z.number(),
  start: z.number().optional(), // alias
  end: z.number().optional(),   // alias
  syllableStarts: z.array(z.number()).optional(),
  confidence: z.number().min(0).max(1).default(1),
  source: WordTimingSourceSchema.default("aligned").optional(),
});

export type WordTiming = {
  id: string;
  text: string;
  start: number;
  end: number;
  startSec?: number;
  endSec?: number;
  syllableStarts?: number[];
  confidence: number;
  source: WordTimingSource;
};

export const CaptionSchema = z.object({
  id: z.string(),
  index: z.number().int().nonnegative(),
  text: z.string(),
  startSec: z.number(),
  endSec: z.number(),
  start: z.number().optional(), // alias
  end: z.number().optional(),   // alias
  instrumental: z.boolean().default(false),
  confidence: z.number().min(0).max(1).default(1),
  locked: z.boolean().default(false).optional(),
  section: z.string().optional(),
  styleOverride: CaptionStyleSchema.partial().optional(),
  animation: z.object({
    in: AnimSpecSchema,
    out: AnimSpecSchema,
    highlight: HighlightSpecSchema,
  }),
  words: z.array(WordSchema),
});

export type LineTiming = {
  id: string;
  text: string;
  start: number;
  end: number;
  startSec?: number;
  endSec?: number;
  words: WordTiming[];
  confidence: number;
  instrumental?: boolean;
  section?: string;
  index?: number;
};

export type Anim =
  | { type: "fade"; inMs: number; outMs: number }
  | { type: "scale"; from: number; to: number; inMs: number; ease: string }
  | { type: "bounce"; amp: number; ms: number }
  | { type: "slide"; dx: number; dy: number; ms: number }
  | { type: "karaoke-wipe" }
  | { type: "typewriter" }
  | { type: "char-stagger"; delayMs: number }
  | { type: "blur-in"; px: number; ms: number }
  | { type: "glow-pulse"; toBeat?: boolean };

export type Template = {
  id: string;
  name: string;
  blurb?: string;
  thumbnail?: string;
  aspect: "9:16" | "16:9" | "1:1";
  background: z.infer<typeof BackgroundLayerSchema>;
  overlays: OverlaySpec[];
  captionStyle: z.infer<typeof CaptionStyleSchema>;
  animations: {
    lineIn?: Anim[];
    wordActive?: Anim[];
    lineOut?: Anim[];
  };
};

export const AssetRefSchema = z.object({
  id: z.string(),
  kind: z.enum(["audio", "image", "font", "lottie", "clip"]),
  name: z.string(),
  mime: z.string(),
  durationSec: z.number().optional(),
  sha256: z.string().optional(),
});

export type OverlayType = (typeof OVERLAY_TYPES)[number];

export const VISUALIZER_TYPES = ["bars", "wave", "circle", "mirror"] as const;
export const VISUALIZER_POSITIONS = ["bottom", "middle", "behind-text", "custom"] as const;

export const VisualizerConfigSchema = z.object({
  type: z.enum(VISUALIZER_TYPES).default("bars"),
  colorA: z.string().default("#F5C15A"),
  colorB: z.string().default("#67F0FF"),
  sensitivity: z.number().min(0.1).max(3).default(1),
  position: z.enum(VISUALIZER_POSITIONS).default("bottom"),
  xPercent: z.number().min(0).max(100).default(50).optional(),
  yPercent: z.number().min(0).max(100).default(92).optional(),
  widthPercent: z.number().min(10).max(100).default(74).optional(),
  heightPercent: z.number().min(5).max(60).default(22).optional(),
  barCount: z.number().int().min(8).max(128).default(48),
  opacity: z.number().min(0).max(1).default(0.35),
});

export type VisualizerConfig = z.infer<typeof VisualizerConfigSchema>;
export type VisualizerType = (typeof VISUALIZER_TYPES)[number];
export type VisualizerPosition = (typeof VISUALIZER_POSITIONS)[number];

export const BackgroundLayerSchema = z.object({
  type: z.enum(["solid", "gradient", "image", "album-blur"]),
  color: z.string().optional(),
  colorB: z.string().optional(),
  angleDeg: z.number().optional(),
  imageAssetId: z.string().optional(),
  kenBurns: z.boolean(),
  kenBurnsZoom: z.number(),
  blurPx: z.number(),
  dim: z.number().min(0).max(1),
  visualizer: z.boolean(),
  visualizerConfig: VisualizerConfigSchema.optional().default({
    type: "bars",
    colorA: "#F5C15A",
    colorB: "#67F0FF",
    sensitivity: 1,
    position: "bottom",
    barCount: 48,
    opacity: 0.35,
  }),
  overlay: OverlaySpecSchema.optional().default({
    type: "none",
    opacity: 0.6,
    speed: 1,
    blendMode: "screen",
    scale: 1,
  }),
});

export const ProjectMetaSchema = z.object({
  title: z.string(),
  artist: z.string(),
  durationSec: z.number().nonnegative(),
  fps: z.number().positive(),
  resolution: z.enum(RESOLUTIONS),
  aspectRatio: z.enum(ASPECT_RATIOS),
  language: z.string().default("en"),
});

export const ProjectSettingsSchema = z.object({
  rippleMode: z.enum(RIPPLE_MODES).default("ripple"),
  snapping: z.boolean().default(true),
  quality: z.enum(QUALITY_PRESETS).default("high"),
  previewQuality: z.enum(["draft", "full"]).default("full"),
  customBitrateKbps: z.number().optional(),
  instrumentalDisplay: z.enum(["auto", "always-show", "hidden"]).default("auto"),

  // NEW ↓
  karaoke: z.boolean().default(true),        // global word-highlight on/off
  syncOffsetMs: z.number().min(-2000).max(2000).default(0), // global nudge
  wordLeadMs: z.number().min(-300).max(300).default(-40),   // per-word bias
});

export const ProjectMediaSchema = z.object({
  masterAudio: AssetRefSchema.optional(),
  vocalStem: AssetRefSchema.optional(),
  background: BackgroundLayerSchema,
  lottieAssetId: z.string().optional(),
  customFontAssetId: z.string().optional(),
});

export const ProjectSchema = z.object({
  id: z.string(),
  version: z.number().int().nonnegative(),
  meta: ProjectMetaSchema,
  media: ProjectMediaSchema,
  defaultStyle: CaptionStyleSchema,
  captions: z.array(CaptionSchema),
  settings: ProjectSettingsSchema,
  presetId: z.string().optional(),
  templateId: z.string().optional(),
  styleOverride: CaptionStyleSchema.partial().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Easing = z.infer<typeof EasingSchema>;
export type AnimSpec = z.infer<typeof AnimSpecSchema>;
export type HighlightSpec = z.infer<typeof HighlightSpecSchema>;
export type CaptionStyle = z.infer<typeof CaptionStyleSchema>;
export type Word = z.infer<typeof WordSchema>;
export type Caption = z.infer<typeof CaptionSchema>;
export type AssetRef = z.infer<typeof AssetRefSchema>;
export type BackgroundLayer = z.infer<typeof BackgroundLayerSchema>;
export type ProjectMeta = z.infer<typeof ProjectMetaSchema>;
export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type RippleMode = (typeof RIPPLE_MODES)[number];
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export const AsrWordSchema = z.object({
  word: z.string(),
  start: z.number(),
  end: z.number(),
  probability: z.number().optional(),
});

export const AsrSegmentSchema = z.object({
  id: z.number().optional(),
  start: z.number(),
  end: z.number(),
  text: z.string(),
  avg_logprob: z.number().optional(),
  no_speech_prob: z.number().optional(),
  words: z.array(AsrWordSchema).optional(),
});

export const AsrResultSchema = z.object({
  text: z.string(),
  language: z.string().optional(),
  duration: z.number().optional(),
  words: z.array(AsrWordSchema).optional(),
  segments: z.array(AsrSegmentSchema).optional(),
});

export type AsrWord = z.infer<typeof AsrWordSchema>;
export type AsrSegment = z.infer<typeof AsrSegmentSchema>;
export type AsrResult = z.infer<typeof AsrResultSchema>;

export const LlmTiebreakSchema = z.object({
  map: z.array(
    z.object({
      lyricIndex: z.number().int().nonnegative(),
      segmentIndex: z.number().int().nonnegative(),
    }),
  ),
});

export type LlmTiebreak = z.infer<typeof LlmTiebreakSchema>;

export const AnchorHitSchema = z.object({
  lineIndex: z.number().int().nonnegative(),
  offsetSec: z.number(),
  peakConfidence: z.number(),
  durationSec: z.number().optional(),
});

export type AnchorHit = z.infer<typeof AnchorHitSchema>;

export const LyricLineSchema = z.object({
  index: z.number().int().nonnegative(),
  text: z.string(),
  section: z.string().optional(),
  instrumental: z.boolean(),
});

export const ParsedLyricsSchema = z.object({
  title: z.string().optional(),
  artist: z.string().optional(),
  lines: z.array(LyricLineSchema),
});

export type LyricLine = z.infer<typeof LyricLineSchema>;
export type ParsedLyrics = z.infer<typeof ParsedLyricsSchema>;

export const AnalyzeProgressSchema = z.object({
  stage: z.enum(["A", "B", "C", "D", "E", "F", "G", "H", "done", "error"]),
  label: z.string(),
  progress: z.number().min(0).max(1),
  detail: z.string().optional(),
  elapsedMs: z.number().optional(),
});

export type AnalyzeProgress = z.infer<typeof AnalyzeProgressSchema>;

export const JobSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  type: z.enum(["analyze", "export"]),
  status: z.enum(["queued", "running", "done", "error", "cancelled"]),
  progress: z.number(),
  stage: z.string(),
  error: z.string().nullable(),
  result: z.unknown().nullable(),
});

export type Job = z.infer<typeof JobSchema>;

const CURRENT_VERSION = 1;

export function defaultEasing(name: z.infer<typeof EasingNameSchema> = "ease-out-cubic"): Easing {
  return { type: "named", name };
}

export function defaultAnim(preset: z.infer<typeof AnimPresetSchema> = "fade"): AnimSpec {
  return {
    preset,
    durationSec: 0.25,
    delaySec: 0,
    easing: defaultEasing(),
    direction: "up",
    distance: 24,
    staggerSec: 0.03,
  };
}

export function defaultStyle(): CaptionStyle {
  return {
    fontFamily: "Outfit",
    fontWeight: 600,
    italic: false,
    fontSizePct: 5,
    letterSpacing: 0.02,
    wordSpacing: 0,
    lineHeight: 1.2,
    align: "center",
    transform: "none",
    maxCharsPerLine: 32,
    maxLines: 2,
    fill: "#F4F1EA",
    highlightFill: "#F5C15A",
    pastFill: "#C8C2B4",
    futureFill: "#F4F1EA",
    outlineColor: "#000000",
    outlineWidth: 0,
    shadow: { x: 0, y: 4, blur: 18, color: "#000000", opacity: 0.55 },
    glow: { color: "#F5C15A", blur: 0, opacity: 0 },
    gradient: {
      enabled: false,
      angleDeg: 90,
      stops: [
        { offset: 0, color: "#FFFFFF" },
        { offset: 1, color: "#F5C15A" },
      ],
    },
    box: {
      enabled: false,
      fill: "#000000",
      opacity: 0.35,
      paddingX: 28,
      paddingY: 16,
      radius: 12,
    },
    anchor: "middle-center",
    xPercent: 50,
    yPercent: 72,
    rotation: 0,
    scale: 1,
  };
}

export function defaultBackground(): BackgroundLayer {
  return {
    type: "album-blur",
    color: "#0B0D12",
    colorB: "#1A1408",
    angleDeg: 160,
    kenBurns: true,
    kenBurnsZoom: 1.12,
    blurPx: 28,
    dim: 0.45,
    visualizer: false,
    visualizerConfig: {
      type: "bars",
      colorA: "#F5C15A",
      colorB: "#67F0FF",
      sensitivity: 1,
      position: "bottom",
      barCount: 48,
      opacity: 0.35,
    },
    overlay: {
      type: "none",
      opacity: 0.6,
      speed: 1,
      blendMode: "screen",
      scale: 1,
    },
  };
}

export function defaultProject(partial?: Partial<Project>): Project {
  const now = new Date().toISOString();
  return {
    id: partial?.id ?? "proj_draft",
    version: CURRENT_VERSION,
    meta: {
      title: "Untitled",
      artist: "Unknown Artist",
      durationSec: 0,
      fps: 30,
      resolution: "1920x1080",
      aspectRatio: "16:9",
      language: "en",
      ...partial?.meta,
    },
    media: {
      background: defaultBackground(),
      ...partial?.media,
    },
    defaultStyle: partial?.defaultStyle ?? defaultStyle(),
    captions: partial?.captions ?? [],
    settings: {
      rippleMode: "ripple",
      snapping: true,
      quality: "high",
      previewQuality: "full",
      instrumentalDisplay: "auto",
      karaoke: true,
      syncOffsetMs: 0,
      wordLeadMs: -40,
      ...partial?.settings,
    },
    presetId: partial?.presetId ?? partial?.templateId ?? "seven-clouds",
    templateId: partial?.templateId ?? partial?.presetId ?? "seven-clouds",
    createdAt: partial?.createdAt ?? now,
    updatedAt: partial?.updatedAt ?? now,
  };
}

type LooseRecord = Record<string, unknown>;

function isRecord(value: unknown): value is LooseRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** v0 → v1 is a documented no-op so the migrate() chain exists and is tested. */
export function migrateV0ToV1(doc: unknown): unknown {
  if (!isRecord(doc)) return doc;
  const next: LooseRecord = { ...doc };
  if (next.version === 0 || next.version === undefined) {
    next.version = 1;
  }
  return next;
}

export function migrate(doc: unknown): Project {
  let current = doc;
  if (isRecord(current) && (current.version === 0 || current.version === undefined)) {
    current = migrateV0ToV1(current);
  }
  const parsed = ProjectSchema.safeParse(current);
  if (parsed.success) return parsed.data;
  if (isRecord(current)) {
    const fallback = defaultProject({
      id: typeof current.id === "string" ? current.id : undefined,
      meta: {
        title: typeof current.meta === "object" && current.meta && "title" in current.meta
          ? String((current.meta as LooseRecord).title ?? "Untitled")
          : "Untitled",
        artist: "Unknown Artist",
        durationSec: 0,
        fps: 30,
        resolution: "1920x1080",
        aspectRatio: "16:9",
        language: "en",
      },
    });
    return ProjectSchema.parse(fallback);
  }
  return defaultProject();
}

export const DOCUMENT_VERSION = CURRENT_VERSION;
