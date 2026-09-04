import type { Caption, CaptionStyle, Project, Word } from "@/schema";
import { mixHex, toRgba } from "@/lib/color";
import { applyEasing, hashString, mulberry32 } from "./easing";
import { fontString, type FrameContext, type FrameGradient, type ResolvedAssets } from "./context";
import { renderProceduralOverlay } from "./overlays";
import { evaluateCustomAnimation, normalizeCustomAnimation } from "./custom-animation";
import { resolveTemplateStyle } from "./templates";

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function resolveStyle(project: Project, caption?: Caption): CaptionStyle {
  return resolveTemplateStyle(project, caption);
}

function applyTransform(text: string, transform?: CaptionStyle["transform"]): string {
  if (transform === "uppercase") return text.toUpperCase();
  if (transform === "lowercase") return text.toLowerCase();
  if (transform === "capitalize") {
    return text.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return text;
}

function wrapWords(words: string[], maxChars: number, maxLines: number): string[][] {
  const lines: string[][] = [[]];
  let count = 0;
  for (const word of words) {
    const next = count + word.length + (count > 0 ? 1 : 0);
    if (count > 0 && next > maxChars) {
      if (lines.length >= maxLines) {
        const last = lines[lines.length - 1]!;
        last[last.length - 1] = `${last[last.length - 1] ?? ""}…`;
        break;
      }
      lines.push([word]);
      count = word.length;
    } else {
      lines[lines.length - 1]!.push(word);
      count = next;
    }
  }
  return lines;
}

function captionOpacity(
  caption: Caption,
  timeSec: number,
): { alpha: number; tx: number; ty: number; scale: number; blur: number; waveOffset: number } {
  const inn = caption.animation?.in ?? {
    preset: "fade",
    durationSec: 0.25,
    delaySec: 0,
    easing: { type: "named", name: "ease-out-cubic" },
  };
  const out = caption.animation?.out ?? {
    preset: "fade",
    durationSec: 0.25,
    delaySec: 0,
    easing: { type: "named", name: "ease-out-cubic" },
  };
  const tIn = inn.durationSec <= 0 ? 1 : applyEasing(inn.easing, (timeSec - caption.startSec - inn.delaySec) / inn.durationSec);
  const tOut = out.durationSec <= 0 ? 1 : applyEasing(out.easing, (caption.endSec - timeSec - out.delaySec) / out.durationSec);
  const enter = Math.max(0, Math.min(1, tIn));
  const leave = Math.max(0, Math.min(1, tOut));
  const alpha = enter * leave;
  const dir = inn.direction ?? "up";
  const dist = inn.distance ?? 24;
  const slideIn = (1 - enter) * dist;
  const slideOut = (1 - leave) * dist;
  const ty = dir === "up" ? slideIn - slideOut : dir === "down" ? -slideIn + slideOut : 0;
  const tx = dir === "left" ? slideIn - slideOut : dir === "right" ? -slideIn + slideOut : 0;

  let scaleIn = 1;
  if (inn.preset === "scale") scaleIn = lerp(0.86, 1, enter);
  else if (inn.preset === "pop") scaleIn = enter < 1 ? lerp(0.5, 1.08, enter) : 1;
  else if (inn.preset === "bounce" || inn.preset === "spring") {
    scaleIn = enter < 1 ? 0.7 + 0.3 * Math.sin(enter * Math.PI * 1.5) : 1;
  }

  let scaleOut = 1;
  if (out.preset === "scale" || out.preset === "pop") scaleOut = lerp(0.85, 1, leave);
  else if (out.preset === "bounce" || out.preset === "spring") {
    scaleOut = leave < 1 ? 0.7 + 0.3 * Math.sin(leave * Math.PI) : 1;
  }

  const blur = (inn.preset === "blur" ? (1 - enter) * 10 : 0) + (out.preset === "blur" ? (1 - leave) * 10 : 0);
  const waveOffset = inn.preset === "wave" ? Math.sin((timeSec - caption.startSec) * 3) * 6 : 0;
  return { alpha, tx, ty, scale: scaleIn * scaleOut, blur, waveOffset };
}

function wordState(word: Word, timeSec: number): "past" | "active" | "future" {
  if (timeSec < word.startSec) return "future";
  if (timeSec >= word.endSec) return "past";
  return "active";
}

function paintVisualizer(
  ctx: FrameContext,
  width: number,
  height: number,
  config: import("@/schema").VisualizerConfig | undefined,
  spectrum: ArrayLike<number>,
  timeSec: number,
): void {
  const cfg = config ?? {
    type: "bars",
    colorA: "#F5C15A",
    colorB: "#67F0FF",
    sensitivity: 1,
    position: "bottom",
    barCount: 48,
    opacity: 0.35,
  };

  const alpha = Math.max(0, Math.min(1, cfg.opacity ?? 0.35));
  if (alpha <= 0.01) return;

  const sens = Math.max(0.1, Math.min(3, cfg.sensitivity ?? 1));
  const count = Math.min(Math.max(8, cfg.barCount ?? 48), spectrum.length);
  const colorA = cfg.colorA ?? "#F5C15A";
  const colorB = cfg.colorB ?? "#67F0FF";

  const defaultYRatio = cfg.position === "middle" ? 0.5 : cfg.position === "behind-text" ? 0.72 : 0.92;
  const posY = (cfg.yPercent !== undefined ? cfg.yPercent / 100 : defaultYRatio) * height;
  const posX = (cfg.xPercent !== undefined ? cfg.xPercent / 100 : 0.5) * width;
  const vizW = (cfg.widthPercent !== undefined ? cfg.widthPercent / 100 : 0.74) * width;
  const vizH = (cfg.heightPercent !== undefined ? cfg.heightPercent / 100 : 0.22) * height;

  ctx.save();
  ctx.globalAlpha = alpha;

  if (cfg.type === "wave") {
    ctx.beginPath();
    ctx.strokeStyle = colorA;
    ctx.lineWidth = Math.max(2, height * 0.005);
    if ("lineCap" in ctx) ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const step = vizW / Math.max(1, count - 1);
    const startX = posX - vizW / 2;
    for (let i = 0; i < count; i++) {
      const v = (spectrum[i] ?? 0) * sens;
      const wave = Math.sin(timeSec * 4 + (i / count) * Math.PI * 4) * vizH * 0.15;
      const y = posY - v * vizH * 0.85 + wave;
      const x = startX + i * step;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = colorB;
    ctx.lineWidth = Math.max(1, height * 0.003);
    for (let i = 0; i < count; i++) {
      const v = (spectrum[count - 1 - i] ?? 0) * sens;
      const wave = Math.cos(timeSec * 3 + (i / count) * Math.PI * 4) * vizH * 0.12;
      const y = posY + v * vizH * 0.55 + wave;
      const x = startX + i * step;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  } else if (cfg.type === "circle") {
    const cx = posX;
    const cy = posY;
    const baseRadius = Math.min(vizW, vizH) * 0.5;
    const angleStep = (Math.PI * 2) / count;

    ctx.beginPath();
    ctx.arc(cx, cy, baseRadius * 0.85, 0, Math.PI * 2);
    ctx.strokeStyle = toRgba(colorB, 0.4);
    ctx.lineWidth = 2;
    ctx.stroke();

    for (let i = 0; i < count; i++) {
      const v = (spectrum[i] ?? 0) * sens;
      const ang = i * angleStep;
      const len = Math.max(4, v * vizH * 0.8);
      const x1 = cx + Math.cos(ang) * baseRadius;
      const y1 = cy + Math.sin(ang) * baseRadius;
      const x2 = cx + Math.cos(ang) * (baseRadius + len);
      const y2 = cy + Math.sin(ang) * (baseRadius + len);

      ctx.beginPath();
      ctx.strokeStyle = i % 2 === 0 ? colorA : colorB;
      ctx.lineWidth = Math.max(2, width * 0.003);
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  } else if (cfg.type === "mirror") {
    const half = Math.floor(count / 2);
    const gap = 3;
    const bw = vizW / count;
    const cx = posX;

    for (let i = 0; i < half; i++) {
      const v = (spectrum[i] ?? 0) * sens;
      const h = Math.max(4, v * vizH);
      const col = i % 2 === 0 ? colorA : colorB;
      ctx.fillStyle = col;

      const rx = cx + i * bw + gap / 2;
      ctx.fillRect(rx, posY - h, bw - gap, h);

      const lx = cx - (i + 1) * bw + gap / 2;
      ctx.fillRect(lx, posY - h, bw - gap, h);
    }
  } else {
    const gap = Math.max(2, Math.round(width * 0.003));
    const bw = vizW / count;
    const startX = posX - vizW / 2;

    for (let i = 0; i < count; i++) {
      const v = (spectrum[i] ?? 0) * sens;
      const h = Math.max(4, v * vizH);
      const x = startX + i * bw;
      ctx.fillStyle = i % 2 === 0 ? colorA : colorB;
      ctx.fillRect(x, posY - h, Math.max(1, bw - gap), h);
    }
  }

  ctx.restore();
}

function paintBackground(ctx: FrameContext, project: Project, timeSec: number, assets: ResolvedAssets): void {
  const { width, height } = ctx.canvas;
  const bg = project.media.background;
  const colA = bg.color || "#120a21";
  const colB = bg.colorB || "#2d124d";

  // Base fill
  ctx.fillStyle = colA;
  ctx.fillRect(0, 0, width, height);

  const ang = ((bg.angleDeg ?? 160) * Math.PI) / 180;
  const gx = Math.cos(ang) * width;
  const gy = Math.sin(ang) * height;
  const g = ctx.createLinearGradient(width / 2 - gx / 2, height / 2 - gy / 2, width / 2 + gx / 2, height / 2 + gy / 2);
  g.addColorStop(0, colA);
  g.addColorStop(0.5, colB);
  g.addColorStop(1, bg.type === "gradient" ? (bg.colorB ?? "#080410") : "#080410");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);

  const img = assets.backgroundImage ?? assets.albumArt;
  if (img && (bg.type === "image" || bg.type === "album-blur")) {
    const zoomBase = bg.kenBurns ? bg.kenBurnsZoom || 1.1 : 1;
    const seed = hashString(project.id);
    const rnd = mulberry32(seed);
    const driftX = rnd() * 0.08 - 0.04;
    const driftY = rnd() * 0.08 - 0.04;
    const duration = Math.max(1, project.meta.durationSec);
    const k = bg.kenBurns ? timeSec / duration : 0;
    const zoom = lerp(1, zoomBase, k);
    const iw = img.width || width;
    const ih = img.height || height;
    const scale = Math.max(width / iw, height / ih) * zoom;
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = (width - dw) / 2 + driftX * width * k;
    const dy = (height - dh) / 2 + driftY * height * k;
    ctx.save();
    if (bg.type === "album-blur" && bg.blurPx > 0) {
      ctx.filter = `blur(${bg.blurPx}px)`;
    }
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.filter = "none";
    ctx.restore();
  } else if (!img && (bg.type === "album-blur" || bg.type === "image")) {
    const pulse = 0.5 + 0.5 * Math.sin(timeSec * 0.8);
    const rad = ctx.createRadialGradient(width * 0.65, height * 0.45, 20, width * 0.65, height * 0.45, width * 0.6);
    rad.addColorStop(0, toRgba("#f5c15a", 0.45 + 0.15 * pulse));
    rad.addColorStop(0.4, toRgba("#e06b3a", 0.25));
    rad.addColorStop(1, "transparent");
    ctx.fillStyle = rad;
    ctx.fillRect(0, 0, width, height);

    const rad2 = ctx.createRadialGradient(width * 0.25, height * 0.75, 10, width * 0.25, height * 0.75, width * 0.5);
    rad2.addColorStop(0, toRgba("#8b5cf6", 0.35));
    rad2.addColorStop(1, "transparent");
    ctx.fillStyle = rad2;
    ctx.fillRect(0, 0, width, height);
  }

  if (bg.dim > 0) {
    ctx.fillStyle = toRgba("#000000", Math.min(0.65, bg.dim));
    ctx.fillRect(0, 0, width, height);
  }

  if (bg.visualizer && assets.spectrum && assets.spectrum.length > 0) {
    paintVisualizer(ctx, width, height, bg.visualizerConfig, assets.spectrum, timeSec);
  }
}

function paintIntro(ctx: FrameContext, project: Project, timeSec: number): void {
  if (timeSec > 2.6) return;
  const title = project.meta.title?.trim();
  const artist = project.meta.artist?.trim();
  const hasArtist = Boolean(artist && !artist.toLowerCase().includes("unknown") && artist.length > 0);
  const hasTitle = Boolean(title && !title.toLowerCase().includes("untitled") && title.length > 0);
  if (!hasTitle && !hasArtist) return;

  const { width, height } = ctx.canvas;
  const t = Math.max(0, Math.min(1, timeSec / 0.5));
  const fadeOut = timeSec > 1.8 ? 1 - (timeSec - 1.8) / 0.8 : 1;
  const alpha = t * fadeOut;
  if (alpha <= 0) return;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#F7F4EE";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (hasTitle) {
    ctx.font = fontString("Fraunces", 500, true, height * 0.07);
    ctx.fillText(title, width / 2, hasArtist ? height * 0.44 : height * 0.49);
  }
  if (hasArtist) {
    ctx.font = fontString("Outfit", 500, false, height * 0.028);
    ctx.fillStyle = "#F5C15A";
    ctx.fillText(artist.toUpperCase(), width / 2, hasTitle ? height * 0.53 : height * 0.49);
  }
  ctx.restore();
}

function paintRoundedRect(
  ctx: FrameContext,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string | FrameGradient,
): void {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.restore();
}

function paintCaption(
  ctx: FrameContext,
  project: Project,
  caption: Caption,
  timeSec: number,
): void {
  if (timeSec < caption.startSec - 0.05 || timeSec > caption.endSec + 0.05) return;

  const isInstrumental = Boolean(
    caption.instrumental ||
      !caption.text ||
      caption.text.trim() === "♪" ||
      caption.text.toLowerCase().includes("instrumental"),
  );

  const gapDuration = caption.endSec - caption.startSec;
  const displayMode = project.settings?.instrumentalDisplay ?? "auto";

  if (isInstrumental) {
    if (displayMode === "hidden") return;
    if (displayMode === "auto" && gapDuration <= 3.0) return;
  }

  const style = resolveStyle(project, caption);
  const { width, height } = ctx.canvas;
  const motion = captionOpacity(caption, timeSec);
  const custom = normalizeCustomAnimation(caption.animation?.in.custom);
  const lineCustom = custom?.enabled && custom.target === "line"
    ? evaluateCustomAnimation(custom, timeSec, caption.startSec)
    : null;
  if (motion.alpha * (lineCustom?.opacity ?? 1) <= 0.01) return;

  const fontPx = (style.fontSizePct / 100) * height * style.scale;
  const rawWords = (isInstrumental ? ["♪", "Instrumental", "♪"] : caption.text.split(/\s+/).filter(Boolean)).map((w) =>
    applyTransform(w, style.transform ?? (style.uppercase ? "uppercase" : undefined)),
  );
  const lines = wrapWords(rawWords, style.maxCharsPerLine, style.maxLines);
  ctx.font = fontString(style.fontFamily, style.fontWeight, style.italic, fontPx);

  const lineMetrics = lines.map((line) => {
    const text = line.join(" ");
    return {
      line,
      text,
      width: ctx.measureText(text).width + style.letterSpacing * fontPx * Math.max(0, text.length - 1),
    };
  });
  const blockW = Math.max(...lineMetrics.map((l) => l.width), 10);
  const blockH = lineMetrics.length * fontPx * style.lineHeight;

  // Safe area handling for 9:16 vertical videos
  const isVertical = height > width || project.meta.aspectRatio === "9:16";
  let targetYPercent = style.yPercent;
  if (isVertical) {
    targetYPercent = Math.max(16, Math.min(80, targetYPercent));
  }

  const px = (style.xPercent / 100) * width;
  const py = (targetYPercent / 100) * height + motion.waveOffset;

  ctx.save();
  ctx.globalAlpha = motion.alpha * (lineCustom?.opacity ?? 1);
  ctx.translate(px + motion.tx + (lineCustom?.translateX ?? 0), py + motion.ty + (lineCustom?.translateY ?? 0));
  ctx.rotate(((style.rotation + (lineCustom?.rotation ?? 0)) * Math.PI) / 180);
  const lineScale = motion.scale * (lineCustom?.scale ?? 1);
  ctx.scale(lineScale, lineScale);

  // Background pill / box rendering
  if (style.backgroundPill?.enabled) {
    paintRoundedRect(
      ctx,
      -blockW / 2 - (style.backgroundPill.padX ?? 24),
      -blockH / 2 - (style.backgroundPill.padY ?? 14),
      blockW + (style.backgroundPill.padX ?? 24) * 2,
      blockH + (style.backgroundPill.padY ?? 14) * 2,
      style.backgroundPill.radius ?? 14,
      toRgba(style.backgroundPill.color ?? "#000000", style.backgroundPill.opacity ?? 0.5),
    );
  } else if (style.box?.enabled) {
    paintRoundedRect(
      ctx,
      -blockW / 2 - (style.box.paddingX ?? 28),
      -blockH / 2 - (style.box.paddingY ?? 16),
      blockW + (style.box.paddingX ?? 28) * 2,
      blockH + (style.box.paddingY ?? 16) * 2,
      style.box.radius ?? 12,
      toRgba(style.box.fill ?? "#000000", style.box.opacity ?? 0.35),
    );
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;

  let wordCursor = 0;
  const wordLead = (project.settings?.wordLeadMs ?? 0) / 1000;
  const rawSource =
    caption.words && caption.words.length > 0
      ? caption.words
      : rawWords.map((text, i) => {
          const span = (caption.endSec - caption.startSec) / Math.max(1, rawWords.length);
          return {
            text,
            startSec: caption.startSec + i * span,
            endSec: caption.startSec + (i + 1) * span,
            confidence: 1,
          };
        });

  const sourceWords = wordLead
    ? rawSource.map((w) => ({
        ...w,
        startSec: w.startSec + wordLead,
        endSec: w.endSec + wordLead,
      }))
    : rawSource;

  const karaokeMode = style.karaoke ?? (caption.animation?.highlight?.style === "box" ? "word-color" : "wipe");
  const karaokeEnabled = (project.settings?.karaoke ?? true) && karaokeMode !== "none";

  const activeFill = style.activeFill ?? style.highlightFill ?? "#F5C15A";
  const pastFill = style.pastFill ?? "#C8C2B4";
  const futureFill = style.futureFill ?? style.fill ?? "#F4F1EA";
  const inactiveOpacity = style.inactiveOpacity ?? 0.75;
  const activeScale = style.activeScale ?? 1.05;

  lineMetrics.forEach((lm, li) => {
    const y = -blockH / 2 + (li + 0.5) * fontPx * (style.lineHeight ?? 1.2);
    let x = -lm.width / 2;
    if (style.align === "left") x = -blockW / 2;
    if (style.align === "right") x = blockW / 2 - lm.width;

    for (const token of lm.line) {
      const word = sourceWords[Math.min(wordCursor, sourceWords.length - 1)];
      wordCursor += 1;
      const state = word ? wordState(word, timeSec) : "future";
      const localT = word ? Math.max(0, Math.min(1, (timeSec - word.startSec) / Math.max(0.04, word.endSec - word.startSec))) : 0;
      const tw = ctx.measureText(token).width;

      let baseFill = futureFill;
      let wordAlpha = 1;

      if (!karaokeEnabled) {
        baseFill = style.fill ?? "#F4F1EA";
      } else {
        if (state === "past") {
          baseFill = pastFill;
        } else if (state === "active") {
          if (karaokeMode === "word-color") {
            baseFill = activeFill;
          } else if (karaokeMode === "outline-fill") {
            baseFill = activeFill;
          } else {
            baseFill = futureFill;
          }
        } else {
          baseFill = futureFill;
          wordAlpha = inactiveOpacity;
        }
      }

      // Word bounce / scale on active
      const scaleVal = state === "active" ? activeScale : 1;
      const bounce = state === "active" ? 1 + 0.08 * Math.sin(localT * Math.PI) : 1;
      const finalWordScale = scaleVal * bounce;

      ctx.save();
      const wordCustom = custom?.enabled && custom.target === "word"
        ? evaluateCustomAnimation(custom, timeSec, word.startSec ?? caption.startSec)
        : null;
      ctx.globalAlpha = motion.alpha * wordAlpha * (wordCustom?.opacity ?? 1);
      ctx.translate(x + tw / 2 + (wordCustom?.translateX ?? 0), y + (wordCustom?.translateY ?? 0));
      ctx.rotate(((wordCustom?.rotation ?? 0) * Math.PI) / 180);
      const customWordScale = finalWordScale * (wordCustom?.scale ?? 1);
      ctx.scale(customWordScale, customWordScale);
      if (wordCustom?.blur) ctx.filter = `blur(${Math.max(0, motion.blur + wordCustom.blur)}px)`;
      ctx.font = fontString(style.fontFamily, style.fontWeight, style.italic, fontPx);

      // Glow & Shadows
      const glowBlur = style.glow?.blur ?? 0;
      const glowOpacity = style.glow?.opacity ?? 0;
      const shadowOpacity = style.shadow?.opacity ?? 0;

      if (glowBlur > 0 && glowOpacity > 0 && state === "active") {
        ctx.shadowColor = toRgba(style.glow?.color ?? activeFill, glowOpacity);
        ctx.shadowBlur = glowBlur * 1.3;
      } else if (shadowOpacity > 0 && style.shadow) {
        ctx.shadowColor = toRgba(style.shadow.color ?? "#000000", shadowOpacity);
        ctx.shadowBlur = style.shadow.blur ?? 18;
        ctx.shadowOffsetX = style.shadow.x ?? 0;
        ctx.shadowOffsetY = style.shadow.y ?? 4;
      }

      // Stroke / Outline
      const outlineW = style.strokeWidth ?? style.outlineWidth ?? 0;
      if (outlineW > 0) {
        ctx.lineWidth = outlineW * 2;
        ctx.strokeStyle = style.strokeColor ?? style.outlineColor ?? "#000000";
        ctx.strokeText(token, -tw / 2, 0);
      }

      // Base un-wiped text
      ctx.fillStyle = baseFill;
      ctx.fillText(token, -tw / 2, 0);

      // Karaoke Wipe Clip Layer
      if (karaokeEnabled && karaokeMode === "wipe" && state === "active") {
        ctx.save();
        ctx.beginPath();
        // Clip rectangle advancing from left to right across the word
        ctx.rect(-tw / 2 - 2, -fontPx * 0.8, (tw + 4) * localT, fontPx * 1.6);
        ctx.clip();
        ctx.fillStyle = activeFill;
        if (outlineW > 0) {
          ctx.lineWidth = outlineW * 2;
          ctx.strokeStyle = style.strokeColor ?? style.outlineColor ?? "#000000";
          ctx.strokeText(token, -tw / 2, 0);
        }
        ctx.fillText(token, -tw / 2, 0);
        ctx.restore();
      }

      ctx.restore();
      x += tw + fontPx * 0.28 + (style.wordSpacing ?? 0) + (style.letterSpacing ?? 0) * fontPx;
    }
  });

  ctx.restore();
}

export function drawFrame(
  ctx: FrameContext,
  project: Project,
  timeSecRaw: number,
  assets: ResolvedAssets,
): void {
  const timeSec = timeSecRaw + (project.settings?.syncOffsetMs ?? 0) / 1000;
  const { width, height } = ctx.canvas;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.filter = "none";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.shadowColor = "transparent";
  ctx.clearRect(0, 0, width, height);

  paintBackground(ctx, project, timeSec, assets);

  if (project.media?.background?.overlay && project.media.background.overlay.type !== "none") {
    renderProceduralOverlay(ctx, project.media.background.overlay, timeSec, assets);
  } else if (assets.lottieFrame) {
    ctx.drawImage(assets.lottieFrame, 0, 0, width, height);
  }

  paintIntro(ctx, project, timeSec);

  // Phrase windowing: only render active lines within time window
  for (const caption of project.captions ?? []) {
    if (timeSec < caption.startSec - 0.6) continue;
    if (timeSec > caption.endSec + 0.6) continue;
    paintCaption(ctx, project, caption, timeSec);
  }
}
