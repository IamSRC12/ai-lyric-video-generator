"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, Repeat, Volume2, VolumeX, Maximize2, SkipBack, SkipForward, RotateCcw, RotateCw, Activity } from "lucide-react";
import { drawFrame, asFrameContext, type ResolvedAssets } from "@/render-engine";
import { LottiePlayer } from "@/lib/lottie-renderer";
import { formatTimecode } from "@/lib/time";
import { useStudio } from "@/store/studio-store";
import { Tooltip } from "../ui-kit";

export function PreviewCanvas({
  audioUrl,
  albumUrl,
}: {
  audioUrl: string | null;
  albumUrl: string;
}) {
  const studio = useStudio();
  const studioRef = useRef(studio);
  useEffect(() => {
    studioRef.current = studio;
  }, [studio]);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const artRef = useRef<HTMLImageElement | null>(null);
  const ctxClock = useRef<AudioContext | null>(null);
  const lottiePlayerRef = useRef<LottiePlayer | null>(null);

  const startedAt = useRef(0);
  const offset = useRef(0);
  const raf = useRef(0);
  const playbackRequest = useRef(0);
  const lastPublishedPlayhead = useRef<number | null>(null);
  const [fps, setFps] = useState(60);
  const [dropped, setDropped] = useState(0);
  const lastTs = useRef(0);
  const frames = useRef(0);
  const lastStateSync = useRef(0);

  const customBgRef = useRef<HTMLImageElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const freqDataRef = useRef<Uint8Array | null>(null);

  // Load Album Art
  useEffect(() => {
    const img = new Image();
    img.src = albumUrl;
    img.onload = () => { artRef.current = img; };
  }, [albumUrl]);

  // Load Custom Background Image from IDB
  useEffect(() => {
    const assetId = studio.project.media?.background?.imageAssetId;
    if (assetId && assetId.startsWith("bg-")) {
      import("@/lib/idb").then(({ getBlob }) => {
        getBlob(assetId).then((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.src = url;
            img.onload = () => { customBgRef.current = img; };
          }
        });
      }).catch(() => undefined);
    } else {
      customBgRef.current = null;
    }
  }, [studio.project.media?.background?.imageAssetId]);

  // Manage Lottie Player
  useEffect(() => {
    const overlay = studio.project.media?.background?.overlay;
    if (overlay?.type === "lottie" && overlay.lottieJson) {
      if (!lottiePlayerRef.current) { lottiePlayerRef.current = new LottiePlayer(640, 360); }
      lottiePlayerRef.current.load(overlay.lottieJson);
    } else {
      if (lottiePlayerRef.current) { lottiePlayerRef.current.destroy(); lottiePlayerRef.current = null; }
    }
  }, [studio.project.media?.background?.overlay?.type, studio.project.media?.background?.overlay?.lottieJson]);

  const latestSpectrumRef = useRef<number[] | null>(null);
  const errorCountRef = useRef(0);
  const lastDrawKeyRef = useRef("");

  // Main render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!ctx) return;

    let cancelled = false;

    const loop = (now: number) => {
      if (!cancelled) raf.current = requestAnimationFrame(loop);

      try {
        const s = studioRef.current;
        const audio = audioRef.current;
        let t = s.playhead;

        if (s.playing) {
          // The media element is the authoritative clock, including while it is
          // buffering/paused for a seek. Only synthesize time when no audio exists.
          if (audio && Number.isFinite(audio.currentTime)) {
            t = audio.currentTime;
          } else if (ctxClock.current) {
            t = offset.current + ctxClock.current.currentTime - startedAt.current;
          }

          const mediaDuration = audio && Number.isFinite(audio.duration) ? audio.duration : s.project.meta.durationSec;
          if (mediaDuration > 0 && t >= mediaDuration - 0.01) {
            if (s.loop) {
              t = 0; offset.current = 0;
              if (ctxClock.current) startedAt.current = ctxClock.current.currentTime;
              if (audio) audio.currentTime = 0;
            } else {
              s.setPlaying(false); t = s.project.meta.durationSec;
            }
          }

          if (now - lastStateSync.current > 50) {
            lastPublishedPlayhead.current = t;
            s.setPlayhead(t);
            lastStateSync.current = now;
          }
        }

        const draft = s.project.settings.previewQuality === "draft";
        const [rw, rh] = (s.project.meta.resolution || "1920x1080").split("x").map(Number);
        const capW = draft ? 960 : 1600;
        const nativeW = rw || 1920;
        const nativeH = rh || 1080;
        const k = Math.min(1, capW / nativeW);
        const w = Math.round(nativeW * k);
        const h = Math.round(nativeH * k);
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w; canvas.height = h;
          lastDrawKeyRef.current = "";
        }

        let lottieFrame: HTMLCanvasElement | undefined;
        if (lottiePlayerRef.current?.isReady()) {
          lottieFrame = lottiePlayerRef.current.renderFrame(t) ?? undefined;
        }

        let spectrum: number[] | undefined;
        if (analyserRef.current && freqDataRef.current && s.playing) {
          analyserRef.current.getByteFrequencyData(freqDataRef.current as Uint8Array<ArrayBuffer>);
          spectrum = [];
          for (let i = 0; i < 48; i++) spectrum.push((freqDataRef.current[i] ?? 0) / 255);
          latestSpectrumRef.current = spectrum;
        }

        if (!s.playing) {
          const key = `${t.toFixed(3)}|${s.project.updatedAt}|${w}x${h}|${lottieFrame ? "L" : ""}`;
          if (key === lastDrawKeyRef.current) return;
          lastDrawKeyRef.current = key;
        }

        const assets: ResolvedAssets = {
          albumArt: artRef.current ?? undefined,
          backgroundImage: customBgRef.current ?? artRef.current ?? undefined,
          lottieFrame,
          spectrum,
        };

        drawFrame(asFrameContext(ctx), s.project, t, assets);
        errorCountRef.current = 0;

        frames.current += 1;
        if (lastTs.current && now - lastTs.current > 1000) {
          setFps(frames.current);
          setDropped(Math.max(0, Math.round((s.project.meta.fps || 60) - frames.current)));
          frames.current = 0; lastTs.current = now;
        } else if (!lastTs.current) {
          lastTs.current = now;
        }
      } catch (err) {
        if (errorCountRef.current < 5) {
          errorCountRef.current += 1;
          console.error("[preview] drawFrame failed:", err);
        }
      }
    };

    raf.current = requestAnimationFrame(loop);
    return () => {
      cancelled = true; cancelAnimationFrame(raf.current);
      if (lottiePlayerRef.current) { lottiePlayerRef.current.destroy(); lottiePlayerRef.current = null; }
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = studio.volume;
  }, [studio.volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const request = ++playbackRequest.current;

    if (studio.playing) {
      if (!ctxClock.current) { try { ctxClock.current = new AudioContext(); } catch { ctxClock.current = null; } }
      const ac = ctxClock.current;
      if (ac) {
        void ac.resume();
        if (!analyserRef.current) {
          try {
            const source = ac.createMediaElementSource(audio);
            const analyser = ac.createAnalyser();
            analyser.fftSize = 128; analyser.smoothingTimeConstant = 0.72;
            source.connect(analyser); analyser.connect(ac.destination);
            analyserRef.current = analyser;
            freqDataRef.current = new Uint8Array(analyser.frequencyBinCount);
          } catch (err) { console.warn("[preview] analyser unavailable:", err); }
        }
        startedAt.current = ac.currentTime;
      }
      offset.current = studioRef.current.playhead;
      audio.currentTime = Math.max(0, Math.min(audio.duration || Infinity, offset.current));
      void audio.play().catch((e) => {
        if (request !== playbackRequest.current) return;
        console.warn("[preview] play blocked:", e);
        studioRef.current.setPlaying(false);
      });
    } else {
      audio.pause();
      if (Number.isFinite(audio.currentTime)) {
        lastPublishedPlayhead.current = audio.currentTime;
        studioRef.current.setPlayhead(audio.currentTime);
      }
    }
  }, [studio.playing]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const internallyPublished = lastPublishedPlayhead.current;
    if (internallyPublished !== null && Math.abs(internallyPublished - studio.playhead) < 0.002) {
      lastPublishedPlayhead.current = null;
      return;
    }

    // A transport/timeline seek must update the media clock even while playing.
    const target = Math.max(0, Math.min(audio.duration || studio.project.meta.durationSec || Infinity, studio.playhead));
    if (Math.abs(audio.currentTime - target) > 0.015) audio.currentTime = target;
    offset.current = target;
    if (ctxClock.current) startedAt.current = ctxClock.current.currentTime;
  }, [studio.playhead, studio.project.meta.durationSec]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) { void document.exitFullscreen(); } else { void containerRef.current.requestFullscreen(); }
  };

  const aspect = (studio.project.meta.aspectRatio || "16:9").replace(":", " / ");
  const duration = studio.project.meta.durationSec || 0;
  const progress = duration > 0 ? (studio.playhead / duration) * 100 : 0;

  return (
    <div ref={containerRef} className="flex h-full w-full flex-col bg-[#07080c] min-h-0 overflow-hidden">
      {/* Canvas Area */}
      <div className="relative grid flex-1 min-h-0 place-items-center overflow-hidden lf-grid p-2.5">
        <div className="relative max-h-full max-w-full lf-safe shadow-2xl rounded-xl overflow-hidden" style={{ aspectRatio: aspect, width: "min(100%, 1050px)" }}>
          <canvas ref={canvasRef} className="h-full w-full rounded-xl shadow-2xl object-contain" />
        </div>
        {audioUrl ? <audio ref={audioRef} src={audioUrl} preload="auto" /> : null}
      </div>

      {/* Transport Bar */}
      <div className="flex items-center gap-3 border-t border-[var(--line)] bg-[#0c101a] px-4 py-2 shrink-0 shadow-lg z-10">
        {/* Playback controls */}
        <div className="flex items-center gap-1.5">
          <Tooltip label="Go to start (Home)">
            <button type="button" className="lf-btn-icon" onClick={() => studio.setPlayhead(0)}>
              <SkipBack size={15} />
            </button>
          </Tooltip>
          <Tooltip label="Skip back 5s">
            <button type="button" className="lf-btn-icon" onClick={() => studio.setPlayhead(Math.max(0, studio.playhead - 5))}>
              <RotateCcw size={15} />
            </button>
          </Tooltip>
          <Tooltip label={studio.playing ? "Pause (Space)" : "Play (Space)"} shortcut="Space">
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-tr from-[var(--accent)] to-red-600 text-[var(--accent-ink)] shadow-[0_0_16px_rgba(239,68,68,0.4)] hover:scale-105 active:scale-95 transition-all"
              onClick={() => studio.setPlaying(!studio.playing)}
            >
              {studio.playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
            </button>
          </Tooltip>
          <Tooltip label="Skip forward 5s">
            <button type="button" className="lf-btn-icon" onClick={() => studio.setPlayhead(Math.min(studio.project.meta.durationSec || 9999, studio.playhead + 5))}>
              <RotateCw size={15} />
            </button>
          </Tooltip>
          <Tooltip label="Go to end (End)">
            <button type="button" className="lf-btn-icon" onClick={() => studio.setPlayhead(studio.project.meta.durationSec || 0)}>
              <SkipForward size={15} />
            </button>
          </Tooltip>
        </div>

        {/* Time display + scrub progress */}
        <div className="flex items-center gap-3 flex-1 max-w-[360px] ml-2">
          <span className="font-mono text-xs tabular-nums text-[var(--ink)] font-semibold min-w-[4.8rem] bg-[#05070a] px-2 py-1 rounded-md border border-[var(--line)]">{formatTimecode(studio.playhead)}</span>
          <div
            className="flex-1 h-2 cursor-pointer rounded-full bg-[#182030] relative group"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              studio.setPlayhead(pct * (studio.project.meta.durationSec || 1));
            }}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-amber-300 transition-all duration-75"
              style={{ width: `${progress}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full bg-[var(--accent)] shadow-[0_0_10px_rgba(239,68,68,0.8)] opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ left: `calc(${progress}% - 7px)` }}
            />
          </div>
          <span className="font-mono text-xs tabular-nums text-[var(--faint)] min-w-[4.8rem]">{formatTimecode(duration)}</span>
        </div>

        {/* Volume */}
        <div className="flex items-center gap-2 ml-2">
          <button
            type="button"
            className="lf-btn-icon !min-w-[32px] !min-h-[32px]"
            onClick={() => studio.setVolume(studio.volume > 0 ? 0 : 0.9)}
          >
            {studio.volume > 0 ? <Volume2 size={16} /> : <VolumeX size={16} className="text-red-400" />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={studio.volume}
            onChange={(e) => studio.setVolume(Number(e.target.value))}
            className="w-20"
          />
        </div>

        {/* Loop */}
        <Tooltip label="Toggle Loop">
          <button type="button" className={`lf-btn-icon ${studio.loop ? "active" : ""}`} onClick={() => studio.setLoop(!studio.loop)}>
            <Repeat size={16} />
          </button>
        </Tooltip>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Stats & Quality */}
        <div className="flex items-center gap-2.5 text-xs text-[var(--faint)]">
          {studio.playing && (
            <span className="flex items-center gap-1 text-emerald-400 font-mono text-[11px]">
              <Activity size={12} className="animate-pulse" /> Live
            </span>
          )}
          <span className="font-mono tabular-nums text-[11px] bg-[#05070a] px-2 py-0.5 rounded border border-[var(--line)]">{fps} fps</span>
          <button
            type="button"
            className="lf-btn-ghost text-[10px] py-1 px-2 uppercase font-mono"
            onClick={() => studio.commit((d) => { d.settings.previewQuality = d.settings.previewQuality === "draft" ? "full" : "draft"; })}
          >
            {studio.project.settings.previewQuality}
          </button>
          <Tooltip label="Fullscreen">
            <button type="button" className="lf-btn-icon !min-w-[32px] !min-h-[32px]" onClick={toggleFullscreen}>
              <Maximize2 size={14} />
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

