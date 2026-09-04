import type { OverlaySpec } from "@/schema";
import type { FrameContext, ResolvedAssets } from "./context";
import { hashString, mulberry32 } from "./easing";

function getAudioEnergy(spectrum?: ArrayLike<number>): { bass: number; mid: number; high: number; kick: number } {
  if (!spectrum || spectrum.length === 0) {
    return { bass: 0, mid: 0, high: 0, kick: 0 };
  }
  let b = 0, m = 0, h = 0;
  const n = Math.min(spectrum.length, 48);
  for (let i = 0; i < n; i++) {
    const val = spectrum[i] ?? 0;
    if (i < 6) b += val;
    else if (i < 20) m += val;
    else h += val;
  }
  const bass = b / 6;
  const mid = m / 14;
  const high = h / Math.max(1, n - 20);
  const kick = Math.pow(Math.max(0, bass * 1.5), 1.6);
  return { bass, mid, high, kick };
}

export function renderProceduralOverlay(
  ctx: FrameContext,
  overlay: OverlaySpec,
  timeSec: number,
  assets: ResolvedAssets,
): void {
  if (!overlay || overlay.type === "none" || overlay.opacity <= 0) return;

  const { width, height } = ctx.canvas;
  const energy = getAudioEnergy(assets.spectrum);
  const speed = (overlay.speed ?? 1) * (1 + energy.kick * 0.4);
  const t = timeSec * speed;
  const alpha = Math.max(0, Math.min(1, (overlay.opacity ?? 0.6) * (0.85 + energy.bass * 0.4)));
  const scale = (overlay.scale ?? 1) * (1 + energy.kick * 0.15);

  ctx.save();
  ctx.globalAlpha = alpha;

  switch (overlay.type) {
    case "bokeh":
      paintBokeh(ctx, width, height, t, scale, energy);
      break;
    case "starfield":
      paintStarfield(ctx, width, height, t, scale, energy);
      break;
    case "soundwave":
      paintSoundwaveAura(ctx, width, height, t, scale, energy);
      break;
    case "embers":
      paintEmbers(ctx, width, height, t, scale, energy);
      break;
    case "light-leak":
      paintLightLeak(ctx, width, height, t, scale, energy);
      break;
    case "scanlines":
      paintScanlines(ctx, width, height, t);
      break;
    case "lottie":
      if (assets.lottieFrame) {
        ctx.drawImage(assets.lottieFrame, 0, 0, width, height);
      }
      break;
  }

  ctx.restore();
}

function paintBokeh(ctx: FrameContext, w: number, h: number, t: number, scale: number, energy: { bass: number; kick: number }): void {
  const count = 28;
  const beatScale = 1 + energy.kick * 0.35;
  for (let i = 0; i < count; i++) {
    const seed = hashString(`bokeh-${i}`);
    const rnd = mulberry32(seed);
    const baseX = rnd() * w;
    const baseY = rnd() * h;
    const baseR = (rnd() * 36 + 18) * scale * beatScale;
    const speedX = (rnd() - 0.5) * 28;
    const speedY = -rnd() * 22 - 6;
    const phase = rnd() * Math.PI * 2;

    const x = (baseX + speedX * t + Math.sin(t * 0.8 + phase) * 24 + w) % w;
    const y = (baseY + speedY * t + h) % h;
    const pulse = 0.6 + 0.4 * Math.sin(t * 1.5 + phase) + energy.bass * 0.5;
    const r = baseR * pulse;

    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const hue = i % 3 === 0 ? "rgba(245, 193, 90, " : i % 3 === 1 ? "rgba(103, 240, 255, " : "rgba(255, 160, 200, ";
    g.addColorStop(0, `${hue}${Math.min(1, 0.45 * pulse + energy.kick * 0.3)})`);
    g.addColorStop(0.5, `${hue}${Math.min(1, 0.15 * pulse + energy.bass * 0.2)})`);
    g.addColorStop(1, `${hue}0)`);

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintStarfield(ctx: FrameContext, w: number, h: number, t: number, scale: number, energy: { kick: number; bass: number }): void {
  const count = 80;
  const cx = w / 2;
  const cy = h / 2;
  const warp = 1 + energy.kick * 0.6;

  for (let i = 0; i < count; i++) {
    const seed = hashString(`star-${i}`);
    const rnd = mulberry32(seed);
    const angle = rnd() * Math.PI * 2;
    const baseDist = rnd() * 0.95 + 0.05;
    const maxRadius = Math.sqrt(cx * cx + cy * cy);

    const progress = (baseDist + t * 0.12 * warp) % 1;
    const r = progress * maxRadius * scale;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    const size = Math.max(1, progress * 4.5 * scale * (1 + energy.kick * 0.5));
    const alpha = Math.min(1, progress * 1.6 * (1 + energy.bass * 0.5));

    ctx.fillStyle = i % 2 === 0 ? `rgba(255, 255, 255, ${alpha * 0.85})` : `rgba(103, 240, 255, ${alpha * 0.95})`;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintSoundwaveAura(
  ctx: FrameContext,
  w: number,
  h: number,
  t: number,
  scale: number,
  energy: { bass: number; kick: number },
): void {
  const cx = w / 2;
  const cy = h * 0.72;
  const ringCount = 6;
  const audioKick = energy.kick > 0 ? energy.kick : 0.2;

  for (let i = 0; i < ringCount; i++) {
    const phase = (t * 0.8 + i / ringCount) % 1;
    const radius = phase * (Math.min(w, h) * 0.55) * scale * (1 + audioKick * 0.4);
    const alpha = (1 - phase) * (0.35 + audioKick * 0.65);

    ctx.save();
    ctx.strokeStyle = i % 2 === 0 ? `rgba(245, 193, 90, ${alpha * 0.8})` : `rgba(103, 240, 255, ${alpha * 0.75})`;
    ctx.lineWidth = Math.max(1.5, (1 - phase) * 7 * scale * (1 + audioKick * 0.5));
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    if (i === 0) {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 0.7);
      g.addColorStop(0, `rgba(245, 193, 90, ${alpha * 0.35})`);
      g.addColorStop(1, "rgba(245, 193, 90, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function paintEmbers(ctx: FrameContext, w: number, h: number, t: number, scale: number, energy: { kick: number; bass: number }): void {
  const count = 45;
  const boost = 1 + energy.kick * 0.5;
  for (let i = 0; i < count; i++) {
    const seed = hashString(`ember-${i}`);
    const rnd = mulberry32(seed);
    const baseX = rnd() * w;
    const baseY = rnd() * h;
    const speedY = (-rnd() * 32 - 14) * boost;
    const swayAmp = rnd() * 20 + 8;
    const swayFreq = rnd() * 2 + 1;
    const phase = rnd() * Math.PI * 2;

    const x = (baseX + Math.sin(t * swayFreq + phase) * swayAmp + w) % w;
    const y = (baseY + speedY * t + h) % h;
    const twinkle = 0.5 + 0.5 * Math.sin(t * 4 + phase) + energy.bass * 0.4;
    const size = (rnd() * 2.5 + 1.2) * scale * boost;

    ctx.fillStyle = rnd() > 0.3 ? `rgba(255, 185, 70, ${Math.min(1, twinkle * 0.9)})` : `rgba(255, 100, 50, ${Math.min(1, twinkle * 0.85)})`;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintLightLeak(ctx: FrameContext, w: number, h: number, t: number, scale: number, energy: { kick: number; mid: number }): void {
  const p1 = (Math.sin(t * 0.5) * 0.5 + 0.5) * (1 + energy.kick * 0.4);
  const p2 = (Math.cos(t * 0.35) * 0.5 + 0.5) * (1 + energy.mid * 0.4);

  const g1 = ctx.createRadialGradient(w * 0.15, h * 0.1, 0, w * 0.15, h * 0.1, (w * 0.6) * scale * (1 + energy.kick * 0.2));
  g1.addColorStop(0, `rgba(255, 190, 110, ${Math.min(1, 0.4 * p1)})`);
  g1.addColorStop(0.6, `rgba(255, 90, 140, ${Math.min(1, 0.15 * p1)})`);
  g1.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, w, h);

  const g2 = ctx.createRadialGradient(w * 0.85, h * 0.85, 0, w * 0.85, h * 0.85, (w * 0.55) * scale * (1 + energy.mid * 0.2));
  g2.addColorStop(0, `rgba(103, 240, 255, ${Math.min(1, 0.32 * p2)})`);
  g2.addColorStop(0.5, `rgba(138, 108, 255, ${Math.min(1, 0.12 * p2)})`);
  g2.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, w, h);
}

function paintScanlines(ctx: FrameContext, w: number, h: number, t: number): void {
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
  const step = 4;
  for (let y = 0; y < h; y += step) {
    ctx.fillRect(0, y, w, 1.5);
  }
  const sweepY = ((t * 60) % (h + 100)) - 50;
  const g = ctx.createLinearGradient(0, sweepY - 30, 0, sweepY + 30);
  g.addColorStop(0, "rgba(255, 255, 255, 0)");
  g.addColorStop(0.5, "rgba(255, 255, 255, 0.06)");
  g.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, sweepY - 30, w, 60);
  ctx.restore();
}
