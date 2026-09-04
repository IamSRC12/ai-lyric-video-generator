/** Duck-typed 2D context so drawFrame stays free of DOM globals. */

export interface FrameGradient {
  addColorStop(offset: number, color: string): void;
}

export interface FrameImage {
  width: number;
  height: number;
}

export interface FrameContext {
  canvas: { width: number; height: number };
  fillStyle: string | FrameGradient | unknown;
  strokeStyle: string | FrameGradient | unknown;
  globalAlpha: number;
  font: string;
  textAlign: CanvasTextAlign | string;
  textBaseline: CanvasTextBaseline | string;
  lineWidth: number;
  lineCap?: CanvasLineCap | string;
  lineJoin: CanvasLineJoin | string;
  miterLimit: number;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  filter: string;
  save(): void;
  restore(): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  rect(x: number, y: number, w: number, h: number): void;
  arc(x: number, y: number, r: number, a0: number, a1: number): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  roundRect(x: number, y: number, w: number, h: number, r: number): void;
  fill(): void;
  stroke(): void;
  clip(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  strokeText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
  translate(x: number, y: number): void;
  rotate(r: number): void;
  scale(x: number, y: number): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): FrameGradient;
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): FrameGradient;
  drawImage(image: FrameImage | unknown, dx: number, dy: number, dw: number, dh: number): void;
  getImageData?(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray; width: number; height: number };
}

export interface ResolvedAssets {
  backgroundImage?: FrameImage;
  albumArt?: FrameImage;
  lottieFrame?: FrameImage;
  spectrum?: ArrayLike<number>;
}

export function fontString(family: string, weight: number, italic: boolean, px: number): string {
  const style = italic ? "italic" : "normal";
  return `${style} ${weight} ${px}px "${family}", system-ui, sans-serif`;
}
