export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function formatTimecode(sec: number, fps = 30, showMs = true): string {
  const sign = sec < 0 ? "-" : "";
  const abs = Math.abs(sec);
  const m = Math.floor(abs / 60);
  const s = Math.floor(abs % 60);
  const ms = Math.round((abs - Math.floor(abs)) * 1000);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  if (!showMs) return `${sign}${mm}:${ss}`;
  return `${sign}${mm}:${ss}.${String(ms).padStart(3, "0")}`;
}

export function parseTimecode(value: string): number | null {
  const trimmed = value.trim();
  const m = trimmed.match(/^(-?)(?:(\d+):)?(\d+)(?:\.(\d{1,3}))?$/);
  if (!m) return null;
  const neg = m[1] === "-";
  const minutes = Number(m[2] ?? 0);
  const seconds = Number(m[3] ?? 0);
  const ms = Number((m[4] ?? "0").padEnd(3, "0"));
  const total = minutes * 60 + seconds + ms / 1000;
  return neg ? -total : total;
}

export function secToFrame(sec: number, fps: number): number {
  return Math.round(sec * fps);
}

export function frameToSec(frame: number, fps: number): number {
  return frame / fps;
}

export function resolutionSize(resolution: string): { width: number; height: number } {
  const [w, h] = resolution.split("x").map(Number);
  return { width: w || 1920, height: h || 1080 };
}

export function aspectCss(aspect: string): string {
  const map: Record<string, string> = {
    "16:9": "16 / 9",
    "9:16": "9 / 16",
    "1:1": "1 / 1",
    "4:5": "4 / 5",
    "21:9": "21 / 9",
  };
  return map[aspect] ?? "16 / 9";
}

export function naturalSort(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}
