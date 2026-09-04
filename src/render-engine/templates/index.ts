import type { Caption, CaptionStyle, Project, Template } from "@/schema";
import { sevenCloudsTemplate } from "./seven-clouds";
import { tiktokViralTemplate } from "./tiktok-viral";
import { neonKaraokeTemplate } from "./neon-karaoke";
import { minimalEditorialTemplate } from "./minimal-editorial";
import { stageSpotlightTemplate } from "./stage-spotlight";
import { kineticPopTemplate } from "./kinetic-pop";
import { synthwaveGlowTemplate } from "./synthwave-glow";
import { vintageFilmTemplate } from "./vintage-film";

export const TEMPLATES: Template[] = [
  sevenCloudsTemplate,
  tiktokViralTemplate,
  neonKaraokeTemplate,
  minimalEditorialTemplate,
  stageSpotlightTemplate,
  kineticPopTemplate,
  synthwaveGlowTemplate,
  vintageFilmTemplate,
];

export function getTemplateById(id?: string): Template {
  return TEMPLATES.find((t) => t.id === id) ?? sevenCloudsTemplate;
}

/**
 * Resolves the final computed caption style for rendering:
 * 1. Base template style from templateId (or presetId)
 * 2. Project-level styleOverride
 * 3. Caption-level styleOverride
 *
 * CRITICAL RULE: This is a pure computation and NEVER mutates caption timings!
 */
export function resolveTemplateStyle(project: Project, caption?: Caption): CaptionStyle {
  const template = getTemplateById(project.templateId ?? project.presetId);
  const base = template.captionStyle;
  const withProjectOverride = project.styleOverride ? { ...base, ...project.styleOverride } : base;
  if (!caption?.styleOverride) return withProjectOverride;
  return { ...withProjectOverride, ...caption.styleOverride };
}

/**
 * Applies a visual template to a project:
 * - Updates templateId and presetId
 * - Updates media background / overlay properties from template
 * - Clears styleOverride
 * - GUARANTEE: Caption timestamps (startSec/endSec/words) are NEVER touched!
 */
export function applyTemplateToProject(project: Project, templateId: string): Project {
  const template = getTemplateById(templateId);
  return {
    ...project,
    templateId: template.id,
    presetId: template.id,
    defaultStyle: { ...template.captionStyle },
    styleOverride: undefined,
    media: {
      ...project.media,
      background: {
        ...template.background,
        imageAssetId: project.media.background.imageAssetId ?? template.background.imageAssetId,
      },
    },
    updatedAt: new Date().toISOString(),
  };
}

export {
  sevenCloudsTemplate,
  tiktokViralTemplate,
  neonKaraokeTemplate,
  minimalEditorialTemplate,
  stageSpotlightTemplate,
  kineticPopTemplate,
  synthwaveGlowTemplate,
  vintageFilmTemplate,
};
