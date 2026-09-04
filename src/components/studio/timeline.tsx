"use client";

import React, { useMemo, useRef, useState, useEffect } from "react";
import { formatTimecode } from "@/lib/time";
import { useStudio } from "@/store/studio-store";
import {
  Maximize2,
  Minus,
  Music2,
  Plus,
  Scissors,
  Unlink,
  Volume2,
  Magnet,
  CircleAlert,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Tooltip } from "../ui-kit";
import type { Caption } from "@/schema";

const SNAP_SEC = 8 / 90; // snap radius ≈ 8px at base zoom

/** Snap a raw time to nearby caption edges / playhead / grid. */
function snapTime(raw: number, targets: number[], zoom: number): number {
  const radius = SNAP_SEC / Math.max(0.35, Math.min(3, zoom));
  let best = raw;
  let bestDist = radius;
  for (const t of targets) {
    const d = Math.abs(t - raw);
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  return Math.max(0, best);
}

function wordConfidenceColor(confidence: number) {
  if (confidence >= 0.85) return "bg-emerald-500/25 text-emerald-300 border-emerald-500/40";
  if (confidence >= 0.6) return "bg-amber-500/25 text-amber-300 border-amber-500/40";
  return "bg-rose-500/25 text-rose-300 border-rose-500/40";
}

const CaptionBlock = React.memo(function CaptionBlock({
  cap,
  pxPerSec,
  selected,
  isActive,
  rippleMode,
  snapTargets,
  zoom,
  onSelect,
  onMove,
  onRoll,
  onResize,
  onTextCommit,
}: {
  cap: Caption;
  pxPerSec: number;
  selected: boolean;
  isActive: boolean;
  rippleMode: string;
  snapTargets: number[];
  zoom: number;
  onSelect: (ids: string[], shift?: boolean) => void;
  onMove: (id: string, nextStart: number) => void;
  onRoll: (id: string, nextBoundary: number) => void;
  onResize: (id: string, edge: "in" | "out", nextSec: number) => void;
  onTextCommit: (id: string, text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(cap.text);
  const dur = Math.max(0.05, cap.endSec - cap.startSec);
  const w = Math.round(Math.max(28, dur * pxPerSec));
  const isMusic = Boolean(
    cap.instrumental ||
      !cap.text ||
      cap.text.trim() === "♪",
  );
  const lowConf = !isMusic && cap.confidence < 0.6;

  let bgColor: string;
  let borderColor: string;
  let tagColor: string;

  if (isMusic) {
    bgColor = "linear-gradient(135deg, rgba(139, 92, 246, 0.30) 0%, rgba(99, 102, 241, 0.16) 100%)";
    borderColor = "rgba(167, 139, 250, 0.55)";
    tagColor = "bg-purple-500/30 text-purple-200";
  } else if (cap.confidence < 0.35) {
    bgColor = "linear-gradient(135deg, rgba(244, 63, 94, 0.26) 0%, rgba(225, 29, 72, 0.13) 100%)";
    borderColor = "rgba(251, 113, 133, 0.65)";
    tagColor = "bg-rose-500/30 text-rose-200";
  } else if (cap.confidence < 0.6) {
    bgColor = "linear-gradient(135deg, rgba(239, 68, 68, 0.24) 0%, rgba(217, 119, 6, 0.12) 100%)";
    borderColor = "rgba(251, 191, 36, 0.60)";
    tagColor = "bg-amber-500/30 text-amber-200";
  } else {
    bgColor = "linear-gradient(135deg, rgba(16, 185, 129, 0.22) 0%, rgba(5, 150, 105, 0.10) 100%)";
    borderColor = "rgba(52, 211, 153, 0.50)";
    tagColor = "bg-emerald-500/25 text-emerald-200";
  }

  useEffect(() => {
    if (!editing) {
      setDraft(cap.text);
    }
  }, [cap.text, editing]);

  const left = Math.round(cap.startSec * pxPerSec);

  const startDrag = (
    e: React.MouseEvent,
    kind: "move" | "in" | "out" | "roll",
  ) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect([cap.id], e.shiftKey);
    const startX = e.clientX;
    const initialStart = cap.startSec;
    const initialEnd = cap.endSec;

    const onMouseMove = (ev: MouseEvent) => {
      const deltaSec = (ev.clientX - startX) / pxPerSec;
      if (kind === "move") {
        const raw = initialStart + deltaSec;
        const snapped = snapTime(raw, snapTargets, zoom);
        onMove(cap.id, snapped);
      } else if (kind === "in") {
        const raw = initialStart + deltaSec;
        const snapped = snapTime(raw, snapTargets, zoom);
        onResize(cap.id, "in", Math.min(snapped, initialEnd - 0.04));
      } else if (kind === "out") {
        const raw = initialEnd + deltaSec;
        const snapped = snapTime(raw, snapTargets, zoom);
        onResize(cap.id, "out", Math.max(snapped, initialStart + 0.04));
      } else if (kind === "roll") {
        const raw = initialEnd + deltaSec;
        const snapped = snapTime(raw, snapTargets, zoom);
        onRoll(cap.id, snapped);
      }
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const showWordPills = !isMusic && cap.words && cap.words.length > 0 && w > 80;

  return (
    <div
      data-block="1"
      className={`group absolute rounded-xl border backdrop-blur-md transition-all shadow-md overflow-hidden ${
        selected
          ? "ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-black z-30 shadow-xl"
          : isActive
          ? "ring-1 ring-[var(--accent)]/60 z-20"
          : "hover:border-white/40 z-10"
      }`}
      style={{
        left,
        width: w,
        top: 66,
        height: 54,
        background: bgColor,
        borderColor: selected ? "var(--accent)" : isActive ? "var(--accent)" : borderColor,
      }}
      onMouseDown={(e) => startDrag(e, rippleMode === "roll" ? "roll" : "move")}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (!isMusic) setEditing(true);
      }}
    >
      {/* Left resize handle */}
      <span
        data-block="1"
        className="absolute inset-y-0 left-0 w-3 cursor-ew-resize rounded-l-xl bg-white/0 hover:bg-white/30 transition-colors z-10"
        onMouseDown={(e) => startDrag(e, "in")}
      >
        <span className="h-4 w-0.5 rounded-full bg-white/40 opacity-0 group-hover:opacity-100 transition-opacity" />
      </span>

      {/* Content */}
      <div className="flex h-full flex-col justify-between p-2 pl-3 pr-3 pointer-events-none">
        <div className="flex items-center justify-between gap-1.5 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold shrink-0 ${tagColor}`}>
              #{cap.index + 1}
            </span>
            {isMusic && <Music2 size={11} className="text-purple-300 shrink-0" />}
            {lowConf && <CircleAlert size={11} className="text-amber-300 shrink-0" />}
            {editing ? (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => {
                  setEditing(false);
                  if (draft.trim() && draft !== cap.text) onTextCommit(cap.id, draft.trim());
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setEditing(false);
                    if (draft.trim() && draft !== cap.text) onTextCommit(cap.id, draft.trim());
                  }
                  if (e.key === "Escape") setEditing(false);
                  e.stopPropagation();
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className="pointer-events-auto w-full min-w-20 rounded bg-black/60 border border-[var(--accent)] px-1 text-[11px] font-semibold text-white outline-none"
              />
            ) : (
              <span className="truncate font-semibold text-white text-[11px]">
                {cap.text || "♪ Instrumental Gap ♪"}
              </span>
            )}
          </div>

          {!editing && (
            <span
              className={`h-2 w-2 rounded-full shrink-0 ${
                isMusic
                  ? "bg-purple-400 shadow-[0_0_6px_rgba(167,139,250,0.8)]"
                  : cap.confidence >= 0.6
                  ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"
                  : cap.confidence >= 0.35
                  ? "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]"
                  : "bg-rose-400 shadow-[0_0_6px_rgba(244,63,94,0.8)]"
              }`}
            />
          )}
        </div>

        {/* Sub-word confidence segments indicator */}
        {showWordPills ? (
          <div className="flex items-center gap-0.5 overflow-hidden my-0.5">
            {cap.words.map((wrd, wi) => {
              const spanRatio = Math.max(0.01, (wrd.endSec - wrd.startSec) / dur);
              return (
                <div
                  key={wi}
                  className={`h-1.5 rounded-full border ${wordConfidenceColor(wrd.confidence)}`}
                  style={{ flexGrow: Math.round(spanRatio * 100) }}
                  title={`${wrd.text} (${(wrd.confidence * 100).toFixed(0)}% sync)`}
                />
              );
            })}
          </div>
        ) : null}

        <div className="flex items-center justify-between text-[10px] text-[var(--faint)] font-mono">
          <span>{formatTimecode(cap.startSec, 30, false)}</span>
          <span className="rounded bg-black/40 px-1 py-0.5 text-[9px] text-[var(--muted)]">
            {dur.toFixed(2)}s
          </span>
        </div>
      </div>

      {/* Right resize handle */}
      <span
        data-block="1"
        className="absolute inset-y-0 right-0 w-3 cursor-ew-resize rounded-r-xl bg-white/0 hover:bg-white/30 transition-colors flex items-center justify-center z-10"
        onMouseDown={(e) => startDrag(e, "out")}
      >
        <span className="h-4 w-0.5 rounded-full bg-white/40 opacity-0 group-hover:opacity-100 transition-opacity" />
      </span>
    </div>
  );
});

export function Timeline({ peaks }: { peaks: number[] }) {
  const studio = useStudio();
  const ref = useRef<HTMLDivElement>(null);
  const duration = Math.max(0.1, studio.project.meta.durationSec);
  const pxPerSec = 90 * studio.zoom;
  const width = Math.max(900, duration * pxPerSec);
  const playheadPx = studio.playhead * pxPerSec;
  const [magnetOn, setMagnetOn] = useState(true);

  const ticks = useMemo(() => {
    const step = studio.zoom > 5 ? 0.5 : studio.zoom > 2 ? 1 : studio.zoom > 0.8 ? 2 : 5;
    const out: number[] = [];
    for (let t = 0; t <= duration + step; t += step) out.push(t);
    return out;
  }, [duration, studio.zoom]);

  const snapTargets = useMemo(() => {
    if (!magnetOn) return [];
    const ts = [0];
    for (const c of studio.project.captions) {
      ts.push(c.startSec, c.endSec);
    }
    return ts;
  }, [studio.project.captions, magnetOn]);

  const waveformElements = useMemo(() => {
    if (!peaks || peaks.length === 0) {
      return (
        <div className="flex h-full w-full items-center justify-center text-xs text-[var(--faint)] italic font-mono">
          <Volume2 size={13} className="mr-1.5 opacity-50" /> Master Audio Track Envelope
        </div>
      );
    }
    const playFrac = duration > 0 ? Math.min(1, studio.playhead / duration) : 0;
    return (
      <div className="flex h-full w-full items-end gap-px px-0.5">
        {peaks.map((p, i) => {
          const frac = peaks.length > 1 ? i / (peaks.length - 1) : 0;
          const played = frac <= playFrac;
          return (
            <span
              key={i}
              className="flex-1 rounded-t-sm"
              style={{
                height: `${Math.round(Math.max(8, p * 100))}%`,
                background: played
                  ? "linear-gradient(to top, rgba(239, 68, 68, 0.85), rgba(253, 230, 138, 1))"
                  : "linear-gradient(to top, rgba(239, 68, 68, 0.22), rgba(251, 191, 36, 0.45))",
              }}
            />
          );
        })}
      </div>
    );
  }, [peaks, studio.playhead, duration]);

  function timeFromEvent(e: React.MouseEvent) {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return 0;
    const x = e.clientX - box.left + (ref.current?.scrollLeft ?? 0);
    return Math.max(0, Math.min(duration, x / pxPerSec));
  }

  const modeButtons = [
    { mode: "independent" as const, label: "Free Move" },
    { mode: "ripple" as const, label: "Ripple" },
    { mode: "roll" as const, label: "Roll Boundary" },
    { mode: "relink" as const, label: "Relink" },
  ];

  const handleFitZoom = () => {
    if (!ref.current) return;
    const containerWidth = ref.current.clientWidth - 80;
    if (containerWidth > 0 && duration > 0) {
      const calculated = containerWidth / (duration * 90);
      studio.setZoom(Math.max(0.2, Math.min(10, calculated)));
    }
  };

  const commitInlineText = (id: string, text: string) => studio.updateCaptionText(id, text);

  // Selected line for micro word timing view
  const selectedCaption = studio.project.captions.find((c) => c.id === studio.selectedIds[0]);

  return (
    <div className="flex h-full flex-col bg-[#07090e] select-none">
      {/* ===== TIMELINE TOOLBAR ===== */}
      <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] bg-[#0c101a] px-4 py-2 flex-wrap shadow-md">
        {/* Left: Mode Buttons & Actions */}
        <div className="flex items-center gap-2">
          {/* Edit modes */}
          <div className="flex items-center gap-0.5 bg-[#05070a] border border-[var(--line)] rounded-lg p-0.5">
            {modeButtons.map((item) => (
              <button
                key={item.mode}
                type="button"
                onClick={() => studio.setRippleMode(item.mode)}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                  studio.project.settings.rippleMode === item.mode
                    ? "bg-gradient-to-r from-[var(--accent)] to-red-600 text-[var(--accent-ink)] shadow-md font-bold"
                    : "text-[var(--muted)] hover:text-white hover:bg-white/5"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <Tooltip label={magnetOn ? "Snapping ON — blocks cling to neighbors" : "Snapping OFF — free placement"}>
            <button
              type="button"
              onClick={() => setMagnetOn((v) => !v)}
              className={`lf-btn-icon !min-w-[28px] !min-h-[28px] ${magnetOn ? "active" : ""}`}
            >
              <Magnet size={14} />
            </button>
          </Tooltip>

          <div className="h-5 w-px bg-[var(--line)]" />

          {/* Quick Operations */}
          <div className="flex items-center gap-1">
            <Tooltip label="Split line at playhead (S)" shortcut="S">
              <button type="button" className="lf-btn-ghost text-xs py-1 px-2.5" onClick={() => studio.splitAtPlayhead()}>
                <Scissors size={13} className="text-amber-400" /> Split Line
              </button>
            </Tooltip>
            <Tooltip label="Merge selected lines (M)" shortcut="M">
              <button type="button" className="lf-btn-ghost text-xs py-1 px-2.5" onClick={() => studio.mergeSelected()}>
                <Unlink size={13} className="text-cyan-400" /> Merge
              </button>
            </Tooltip>
            {selectedCaption && !selectedCaption.instrumental && (
              <Tooltip label="Re-align this line using acoustic onset detection">
                <button
                  type="button"
                  className="lf-btn-ghost text-xs py-1 px-2.5 !text-amber-300 !border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20"
                  onClick={() => studio.realignCaption(selectedCaption.id)}
                >
                  <RefreshCw size={12} className="animate-spin-slow text-amber-400" /> Re-align Line
                </button>
              </Tooltip>
            )}
          </div>

          {/* Nudge Frame Controls */}
          <div className="flex items-center gap-0.5 bg-[#05070a] border border-[var(--line)] rounded-lg p-0.5">
            <Tooltip label="Nudge -5 frames">
              <button type="button" className="px-1.5 py-0.5 text-[10px] font-mono text-[var(--muted)] hover:text-white" onClick={() => studio.nudge(-5)}>
                -5f
              </button>
            </Tooltip>
            <Tooltip label="Nudge -1 frame">
              <button type="button" className="px-1.5 py-0.5 text-[10px] font-mono text-[var(--muted)] hover:text-white" onClick={() => studio.nudge(-1)}>
                -1f
              </button>
            </Tooltip>
            <Tooltip label="Nudge +1 frame">
              <button type="button" className="px-1.5 py-0.5 text-[10px] font-mono text-[var(--muted)] hover:text-white" onClick={() => studio.nudge(1)}>
                +1f
              </button>
            </Tooltip>
            <Tooltip label="Nudge +5 frames">
              <button type="button" className="px-1.5 py-0.5 text-[10px] font-mono text-[var(--muted)] hover:text-white" onClick={() => studio.nudge(5)}>
                +5f
              </button>
            </Tooltip>
          </div>
        </div>

        {/* Center: Active Playhead Info */}
        <div className="flex items-center gap-2 font-mono text-xs text-[var(--muted)]">
          <span className="text-[var(--accent)] font-bold">{formatTimecode(studio.playhead)}</span>
          <span>/</span>
          <span>{formatTimecode(duration)}</span>
        </div>

        {/* Right: Zoom & Track Fit Controls */}
        <div className="flex items-center gap-2">
          {/* Confidence legend */}
          <div className="hidden xl:flex items-center gap-2 mr-1 text-[9px] font-mono text-[var(--faint)]">
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> &gt;85%</span>
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> 60-85%</span>
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-rose-400" /> &lt;60%</span>
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-purple-400" /> music</span>
          </div>

          <div className="flex items-center gap-1">
            <Tooltip label="Zoom Out (-)">
              <button
                type="button"
                className="lf-btn-icon !min-w-[28px] !min-h-[28px] !p-1"
                onClick={() => studio.setZoom(Math.max(0.25, studio.zoom * 0.8))}
              >
                <Minus size={13} />
              </button>
            </Tooltip>
            <span className="font-mono text-xs font-bold text-white min-w-[3.2rem] text-center">
              {studio.zoom.toFixed(1)}×
            </span>
            <Tooltip label="Zoom In (+)">
              <button
                type="button"
                className="lf-btn-icon !min-w-[28px] !min-h-[28px] !p-1"
                onClick={() => studio.setZoom(Math.min(50, studio.zoom * 1.25))}
              >
                <Plus size={13} />
              </button>
            </Tooltip>
          </div>

          <Tooltip label="Fit entire track to timeline width">
            <button
              type="button"
              className="lf-btn-ghost text-xs py-1 px-2.5"
              onClick={handleFitZoom}
            >
              <Maximize2 size={12} /> Fit Track
            </button>
          </Tooltip>

          <div className="flex items-center gap-0.5 bg-[#05070a] border border-[var(--line)] rounded-lg p-0.5">
            {[1, 2, 5].map((z) => (
              <button
                key={z}
                type="button"
                onClick={() => studio.setZoom(z)}
                className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded ${
                  Math.abs(studio.zoom - z) < 0.2 ? "bg-[var(--accent)] text-black" : "text-[var(--faint)] hover:text-white"
                }`}
              >
                {z}x
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ===== TRACKS CONTAINER ===== */}
      <div
        ref={ref}
        className="lf-scroll flex-1 overflow-auto bg-[#07090e] relative"
        onWheel={(e) => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const next = Math.max(0.25, Math.min(200, studio.zoom * (e.deltaY < 0 ? 1.12 : 0.88)));
            studio.setZoom(next);
          }
        }}
        onMouseDown={(e) => {
          if ((e.target as HTMLElement).dataset.block) return;
          studio.setPlayhead(snapTime(timeFromEvent(e), magnetOn ? snapTargets : [], studio.zoom));
        }}
      >
        <div className="relative min-h-[190px]" style={{ width, height: 190 }}>
          {/* Track 1: Time Ruler */}
          <div className="sticky top-0 z-10 flex h-7 border-b border-[var(--line)] bg-[#090d16]/95 backdrop-blur-md">
            {ticks.map((t) => (
              <div
                key={t}
                className="absolute top-0 flex flex-col justify-end border-l border-white/10 pl-1 pb-0.5 text-[9px] font-mono text-[var(--faint)]"
                style={{ left: t * pxPerSec, height: "100%" }}
              >
                <span>{formatTimecode(t, 30, false)}</span>
              </div>
            ))}
          </div>

          {/* Track 2: Audio Waveform Band */}
          <div className="absolute left-0 right-0 top-7 h-8 border-b border-[var(--line)]/50 bg-[#05070a]/80">
            {waveformElements}
          </div>

          {/* Track 3: Captions / Lyrics blocks */}
          <div className="absolute left-0 right-0 top-16 h-28">
            {studio.project.captions.map((cap) => (
              <CaptionBlock
                key={cap.id}
                cap={cap}
                pxPerSec={pxPerSec}
                selected={studio.selectedIds.includes(cap.id)}
                isActive={studio.playhead >= cap.startSec && studio.playhead <= cap.endSec}
                rippleMode={studio.project.settings.rippleMode}
                snapTargets={snapTargets}
                zoom={studio.zoom}
                onSelect={(ids, shift) => studio.select(ids, shift)}
                onMove={(id, nextStart) => studio.moveCaption(id, nextStart)}
                onRoll={(id, nextBoundary) => studio.rollCaption(id, nextBoundary)}
                onResize={(id, edge, nextSec) => studio.resizeCaption(id, edge, nextSec)}
                onTextCommit={commitInlineText}
              />
            ))}
          </div>

          {/* Playhead Red Cursor */}
          <div
            className="pointer-events-none absolute top-0 bottom-0 z-40 w-0.5 bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.9)]"
            style={{ left: playheadPx }}
          >
            <div className="sticky top-0 -ml-1.5 h-3 w-3.5 rounded-b-sm bg-rose-500 shadow-md" />
          </div>
        </div>
      </div>

      {/* Sub-Word Micro Tuning Strip (When a single caption is selected) */}
      {selectedCaption && !selectedCaption.instrumental && selectedCaption.words && selectedCaption.words.length > 0 && (
        <div className="shrink-0 border-t border-[var(--line)] bg-[#090d16] px-4 py-2 flex items-center justify-between gap-3 overflow-x-auto lf-scroll text-xs">
          <div className="flex items-center gap-2 shrink-0">
            <Sparkles size={12} className="text-[var(--accent)]" />
            <span className="font-bold text-white">Line #{selectedCaption.index + 1} Words:</span>
          </div>

          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            {selectedCaption.words.map((wrd, wi) => (
              <div
                key={wi}
                className={`flex items-center gap-1 rounded-md px-2 py-1 border text-[11px] font-mono shrink-0 ${wordConfidenceColor(wrd.confidence)}`}
              >
                <span className="font-sans font-semibold text-white">{wrd.text}</span>
                <span className="text-[9px] text-[var(--faint)]">
                  {wrd.startSec.toFixed(2)}s - {wrd.endSec.toFixed(2)}s
                </span>
                <button
                  type="button"
                  onClick={() => studio.updateWordTiming(selectedCaption.id, wi, wrd.startSec - 0.05, wrd.endSec - 0.05)}
                  className="hover:text-white px-0.5 font-bold"
                  title="Nudge word earlier"
                >
                  ◀
                </button>
                <button
                  type="button"
                  onClick={() => studio.updateWordTiming(selectedCaption.id, wi, wrd.startSec + 0.05, wrd.endSec + 0.05)}
                  className="hover:text-white px-0.5 font-bold"
                  title="Nudge word later"
                >
                  ▶
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => studio.realignCaption(selectedCaption.id)}
            className="flex items-center gap-1 text-[10px] bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 font-bold px-2 py-1 rounded-md border border-amber-500/30 transition-all shrink-0"
          >
            <RefreshCw size={11} /> Auto Re-align Line
          </button>
        </div>
      )}
    </div>
  );
}
