import lottie, { type AnimationItem } from "lottie-web";

export class LottiePlayer {
  private canvas: HTMLCanvasElement | null = null;
  private anim: AnimationItem | null = null;
  private currentJson: string | null = null;
  private durationSec = 1;
  private ready = false;

  constructor(width = 1920, height = 1080) {
    if (typeof window !== "undefined") {
      this.canvas = document.createElement("canvas");
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  public isReady(): boolean {
    return this.ready && Boolean(this.canvas) && Boolean(this.anim);
  }

  public load(jsonString: string): boolean {
    if (typeof window === "undefined" || !this.canvas) return false;
    if (this.currentJson === jsonString && this.ready) return true;

    try {
      const data = JSON.parse(jsonString) as { fr?: number; ip?: number; op?: number; w?: number; h?: number };
      if (this.anim) {
        this.anim.destroy();
        this.anim = null;
      }

      const w = data.w || this.canvas.width || 1920;
      const h = data.h || this.canvas.height || 1080;
      this.canvas.width = w;
      this.canvas.height = h;

      const fr = data.fr || 30;
      const totalFrames = (data.op ?? 90) - (data.ip ?? 0);
      this.durationSec = Math.max(0.1, totalFrames / fr);

      const ctx = this.canvas.getContext("2d");
      if (!ctx) return false;

      this.anim = (lottie as unknown as { loadAnimation: (cfg: unknown) => AnimationItem }).loadAnimation({
        renderer: "canvas",
        loop: true,
        autoplay: false,
        animationData: data,
        rendererSettings: {
          context: ctx,
          clearCanvas: true,
        },
      });

      this.currentJson = jsonString;
      this.ready = true;
      return true;
    } catch (err) {
      console.warn("Failed to load Lottie animation:", err);
      this.ready = false;
      return false;
    }
  }

  public loadJson(jsonString: string): Promise<boolean> {
    return Promise.resolve(this.load(jsonString));
  }

  public renderFrame(timeSec: number): HTMLCanvasElement | null {
    if (!this.ready || !this.anim || !this.canvas) return null;
    const loopTime = this.durationSec > 0 ? timeSec % this.durationSec : 0;
    const progress = loopTime / this.durationSec;
    const totalFrames = this.anim.totalFrames || 90;
    const frame = progress * totalFrames;
    this.anim.goToAndStop(frame, true);
    return this.canvas;
  }

  public renderAtTime(timeSec: number): HTMLCanvasElement | null {
    return this.renderFrame(timeSec);
  }

  public destroy() {
    if (this.anim) {
      this.anim.destroy();
      this.anim = null;
    }
    this.ready = false;
    this.canvas = null;
  }
}

