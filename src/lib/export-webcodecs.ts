import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import { drawFrame, type ResolvedAssets } from "@/render-engine";
import type { Project } from "@/schema";
import { resolutionSize } from "@/lib/time";
import { StudioError } from "./errors";

export interface ExportOptions {
  width?: number;
  height?: number;
  fps?: number;
  quality: "high" | "balanced" | "small" | "custom";
  bitrateKbps?: number;
  spectrumFrames?: Float32Array[];
  onProgress?: (p: { frame: number; total: number; pct: number; elapsedMs: number }) => void;
  signal?: AbortSignal;
}

function bitrateFor(
  quality: ExportOptions["quality"],
  width: number,
  height: number,
  fps: number,
  custom?: number,
): number {
  if (quality === "custom" && custom) return custom * 1000;
  const pixels = width * height;
  const base = pixels >= 1920 * 1080 ? 12_000_000 : 6_000_000;
  const scale = quality === "high" ? 1 : quality === "balanced" ? 0.62 : 0.38;
  return Math.round(base * scale * (fps / 30));
}

export function computeSpectrumFrames(
  audioBuffer: AudioBuffer,
  fps: number,
  totalFrames: number,
  binCount = 48,
): Float32Array[] {
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const frames: Float32Array[] = [];
  const windowSize = 2048;

  for (let i = 0; i < totalFrames; i++) {
    const centerSample = Math.round((i / fps) * sampleRate);
    const start = Math.max(0, centerSample - Math.floor(windowSize / 2));
    const end = Math.min(channelData.length, start + windowSize);

    const bins = new Float32Array(binCount);
    const sliceLen = end - start;
    if (sliceLen > 64) {
      const step = Math.floor(sliceLen / binCount);
      for (let b = 0; b < binCount; b++) {
        let sum = 0;
        const bStart = start + b * step;
        const bEnd = Math.min(end, bStart + step);
        for (let s = bStart; s < bEnd; s++) {
          const v = channelData[s] ?? 0;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / Math.max(1, bEnd - bStart));
        const boost = 1 + (b / binCount) * 1.5;
        bins[b] = Math.max(0, Math.min(1, rms * 4.5 * boost));
      }
    }
    frames.push(bins);
  }
  return frames;
}

export async function isWebCodecsSupported(width: number, height: number): Promise<boolean> {
  if (typeof VideoEncoder === "undefined" || typeof VideoEncoder.isConfigSupported !== "function") return false;
  try {
    const res = await VideoEncoder.isConfigSupported({
      codec: "avc1.4d0028",
      width,
      height,
      bitrate: 6_000_000,
      framerate: 30,
    });
    return Boolean(res.supported);
  } catch {
    return false;
  }
}

/** Wait for encoder queue to drain without deadlock risk. */
function waitForQueueDrain(encoder: VideoEncoder | AudioEncoder, threshold: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const check = () => {
      if (encoder.encodeQueueSize <= threshold || encoder.state === "closed") {
        resolve();
        return;
      }
      // Use setTimeout polling instead of ondequeue to avoid race condition
      setTimeout(check, 8);
    };
    check();
  });
}

export async function exportWebCodecsMp4(
  project: Project,
  canvas: HTMLCanvasElement,
  assets: ResolvedAssets,
  audioBuffer: AudioBuffer | null,
  options: ExportOptions,
): Promise<Blob> {
  const { width, height } =
    options.width && options.height
      ? { width: options.width, height: options.height }
      : resolutionSize(project.meta.resolution);
  const fps = options.fps ?? project.meta.fps;
  const duration = Math.max(0.1, audioBuffer?.duration || project.meta.durationSec || 8);
  const totalFrames = Math.round(duration * fps);

  const supported = await isWebCodecsSupported(width, height);
  if (!supported) throw new StudioError("webcodecs_unsupported", "WebCodecs is not available.");

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not acquire 2D context for export.");

  // Determine if we can actually encode audio
  const canEncodeAudio =
    audioBuffer !== null &&
    typeof AudioEncoder !== "undefined" &&
    typeof OfflineAudioContext !== "undefined";

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: "avc", width, height },
    audio: canEncodeAudio
      ? {
          codec: "aac",
          numberOfChannels: Math.min(2, audioBuffer!.numberOfChannels),
          sampleRate: 48000,
        }
      : undefined,
    fastStart: "in-memory",
    firstTimestampBehavior: "offset",
  });

  const bitrate = bitrateFor(options.quality, width, height, fps, options.bitrateKbps);

  // Track encoder errors properly
  let encoderError: Error | null = null;

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encoderError = e instanceof Error ? e : new Error(String(e));
    },
  });

  videoEncoder.configure({
    codec: "avc1.4d0028",
    width,
    height,
    bitrate,
    framerate: fps,
    latencyMode: "quality",
  });

  // Encode audio track
  if (canEncodeAudio && audioBuffer) {
    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => {
        encoderError = e instanceof Error ? e : new Error(String(e));
      },
    });

    audioEncoder.configure({
      codec: "mp4a.40.2",
      numberOfChannels: Math.min(2, audioBuffer.numberOfChannels),
      sampleRate: 48000,
      bitrate: options.quality === "small" ? 192_000 : options.quality === "balanced" ? 256_000 : 320_000,
    });

    const channels = Math.min(2, audioBuffer.numberOfChannels);
    const offline = new OfflineAudioContext(channels, Math.ceil(48000 * duration), 48000);
    const src = offline.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(offline.destination);
    src.start();
    const rendered = await offline.startRendering();

    const frameSize = 1024;
    const total = rendered.length;
    for (let offset = 0; offset < total; offset += frameSize) {
      if (options.signal?.aborted) throw new StudioError("export_cancelled", "Export cancelled.");
      if (encoderError) throw encoderError;

      const count = Math.min(frameSize, total - offset);
      const data = new Float32Array(count * channels);
      for (let ch = 0; ch < channels; ch += 1) {
        const plane = rendered.getChannelData(ch);
        for (let i = 0; i < count; i += 1) data[i * channels + ch] = plane[offset + i] ?? 0;
      }
      const audioData = new AudioData({
        format: "f32",
        sampleRate: 48000,
        numberOfFrames: count,
        numberOfChannels: channels,
        timestamp: Math.round((offset / 48000) * 1e6),
        data,
      });
      audioEncoder.encode(audioData);
      audioData.close();
    }
    await audioEncoder.flush();
    audioEncoder.close();
  }

  // Encode video frames
  const started = performance.now();
  for (let i = 0; i < totalFrames; i += 1) {
    if (options.signal?.aborted) throw new StudioError("export_cancelled", "Export cancelled.");
    if (encoderError) throw encoderError;

    // Safe backpressure: poll instead of relying on ondequeue
    await waitForQueueDrain(videoEncoder, 8);

    const timeSec = i / fps;
    const frameAssets: ResolvedAssets = {
      ...assets,
      spectrum: options.spectrumFrames?.[i] ?? assets.spectrum,
    };

    try {
      drawFrame(ctx as unknown as Parameters<typeof drawFrame>[0], project, timeSec, frameAssets);
    } catch (err) {
      console.warn(`drawFrame skipped at frame ${i} (t=${timeSec.toFixed(3)}s):`, err);
    }

    const frame = new VideoFrame(canvas, {
      timestamp: Math.round((i * 1e6) / fps),
      duration: Math.round(1e6 / fps),
    });
    videoEncoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();

    if (i % 4 === 0 || i === totalFrames - 1) {
      options.onProgress?.({
        frame: i + 1,
        total: totalFrames,
        pct: (i + 1) / totalFrames,
        elapsedMs: performance.now() - started,
      });
    }
  }

  await videoEncoder.flush();
  videoEncoder.close();

  if (encoderError) throw encoderError;

  muxer.finalize();
  const buffer = target.buffer;
  if (!buffer) throw new Error("Muxer produced an empty buffer.");

  options.onProgress?.({
    frame: totalFrames,
    total: totalFrames,
    pct: 1,
    elapsedMs: performance.now() - started,
  });

  return new Blob([buffer], { type: "video/mp4" });
}
