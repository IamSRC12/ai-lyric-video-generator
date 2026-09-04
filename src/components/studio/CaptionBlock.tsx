"use client";

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import { formatTimecode } from "@/lib/time";
import { Music2, CircleAlert } from "lucide-react";
import type { Caption } from "@/schema";

/**
 * CaptionBlock — redesigned for sample-accurate audio sync.
 *
 * Timing-critical rules enforced here:
 *   • No Math.round on SECONDS. Only on final CSS pixel values.
 *   • All drag deltas computed in floating-point seconds.
 *   • Store commits throttled to one per animation frame via rAF.
 *   • Edge drags trigger a live 500ms audio loop around the boundary.
 *   • Collision clamping happens HERE, before the store is ever touched,
 *     so the store can trust the value it receives.
 */

// ─── Strict 5-layer color tokens ──────────────────────────────────────────
const C = {
  maroon45: "#DF253173", // Layer 1
  red65:    "#DF2531A6", // Layer 2
  red:      "#DF2531",   // Layer 3
  white:    "#FFFFFF",   // Layer 4
  black:    "#000000",   // Layer 5
} as const;

const MIN_CAPTION_SEC = 0.04; // 40ms — shortest editable caption
const MIN_GAP_SEC     = 0.02; // 20ms gap between adjacent captions
const SNAP_PX         = 8;    // snap radius in SCREEN pixels (never seconds)
const FRAME_SEC       = 1 / 30;

export interface SnapTargets {
  times: number[]; // recomputed by parent whenever captions change
}

interface CaptionBlockProps {
  cap: Caption;
  prevEndSec: number | null;    // end of previous caption, null if first
  nextStartSec: number | null;  // start of next caption, null if last
  pxPerSec: number;             // zoom — MUST be > 0
  selected: boolean;
  isActive: boolean;            // playhead is inside this caption
  snapTargets: SnapTargets;
  allowTouching: boolean;       // Alt held — disables min-gap
  onSelect: (ids: string[], additive?: boolean) => void;
  onMove: (id: string, nextStartSec: number) => void;
  onResize: (id: string, edge: "in" | "out", nextSec: number) => void;
  onRoll: (id: string, nextBoundarySec: number) => void;
  onTextCommit: (id: string, text: string) => void;
  onGestureStart: (label: string) => void; // ONE undo entry per gesture
  audio: {
    startBoundaryLoop: (t: number) => void;
    updateBoundaryLoop: (t: number) => void;
    stopBoundaryLoop: () => void;
    seekPlayhead: (t: number) => void;
  };
}

/** Snap `raw` to the nearest target within SNAP_PX screen pixels. */
function snapTime(raw: number, targets: number[], pxPerSec: number): number {
  // Convert the pixel radius to seconds using CURRENT zoom.
  // This is the fix for the original bug of a fixed seconds constant.
  const radiusSec = SNAP_PX / pxPerSec;
  let best = raw;
  let bestDist = radiusSec;
  for (const t of targets) {
    const d = Math.abs(t - raw);
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  return Math.max(0, best); // never negative
}

const CaptionBlock = React.memo(function CaptionBlock({
  cap,
  prevEndSec,
  nextStartSec,
  pxPerSec,
  selected,
  isActive,
  snapTargets,
  allowTouching,
  onSelect,
  onMove,
  onResize,
  onRoll,
  onTextCommit,
  onGestureStart,
  audio,
}: CaptionBlockProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(cap.text);

  // Live drag state in a REF so pointermove never triggers a React render.
  const dragRef = useRef<{
    kind: "move" | "in" | "out" | "roll";
    startClientX: number;
    initialStart: number;
    initialEnd: number;
    rafId: number | null;
    pendingSec: number | null;
  } | null>(null);

  useEffect(() => {
    if (!editing) setDraft(cap.text);
  }, [cap.text, editing]);

  const isMusic = Boolean(
    cap.instrumental || !cap.text || cap.text.trim() === "♪",
  );
  const lowConf = !isMusic && cap.confidence < 0.6;

  // ─── Derived geometry — floating point internally, round ONLY for CSS ───
  const durSec = Math.max(MIN_CAPTION_SEC, cap.endSec - cap.startSec);
  const leftPx = Math.round(cap.startSec * pxPerSec); // round at CSS boundary only
  const widthPx = Math.max(18, Math.round(durSec * pxPerSec));

  // ─── Visual style under the strict 5-color system ────────────────────────
  const { bg, border, borderStyle } = useMemo(() => {
    if (isMusic) {
      return {
        bg: `linear-gradient(180deg, ${C.red65} 0%, ${C.maroon45} 100%)`,
        border: C.red,
        borderStyle: "solid" as const,
      };
    }
    if (cap.confidence < 0.6) {
      // Low confidence: DASHED Layer-2 border — the only differentiator
      // allowed since traffic-light hues are forbidden.
      return {
        bg: C.maroon45,
        border: C.red65,
        borderStyle: "dashed" as const,
      };
    }
    if (cap.confidence < 0.85) {
      return {
        bg: C.maroon45,
        border: C.red65,
        borderStyle: "solid" as const,
      };
    }
    return {
      bg: C.maroon45,
      border: C.red,
      borderStyle: "solid" as const,
    };
  }, [isMusic, cap.confidence]);

  // ─── rAF-throttled commit pipeline ───────────────────────────────────────

  const commitPending = useCallback(() => {
    const d = dragRef.current;
    if (!d || d.pendingSec === null) return;
    const t = d.pendingSec;
    d.pendingSec = null;

    // One store commit per frame — never more.
    if (d.kind === "move") onMove(cap.id, t);
    else if (d.kind === "in") onResize(cap.id, "in", t);
    else if (d.kind === "out") onResize(cap.id, "out", t);
    else if (d.kind === "roll") onRoll(cap.id, t);

    // Live-update the audition loop for edge drags so the user HEARS
    // the exact boundary move in real time.
    if (d.kind === "in" || d.kind === "out" || d.kind === "roll") {
      audio.updateBoundaryLoop(t);
    }
  }, [cap.id, onMove, onResize, onRoll, audio]);

  const scheduleCommit = useCallback(() => {
    const d = dragRef.current;
    if (!d || d.rafId !== null) return;
    d.rafId = requestAnimationFrame(() => {
      if (dragRef.current) dragRef.current.rafId = null;
      commitPending();
    });
  }, [commitPending]);

  // ─── Unified pointer drag (move / in / out / roll) ───────────────────────

  const startDrag = useCallback(
    (e: React.PointerEvent, kind: "move" | "in" | "out" | "roll") => {
      if (e.button !== 0) return; // primary button only
      e.stopPropagation();
      e.preventDefault();

      onSelect([cap.id], e.shiftKey);

      // ONE history entry for the whole gesture.
      const labels = {
        move: "Move caption",
        in: "Trim caption start",
        out: "Trim caption end",
        roll: "Roll caption boundary",
      };
      onGestureStart(labels[kind]);

      dragRef.current = {
        kind,
        startClientX: e.clientX,
        initialStart: cap.startSec,
        initialEnd: cap.endSec,
        rafId: null,
        pendingSec: null,
      };

      // Start the 500ms boundary loop immediately so the user hears the
      // current cut point BEFORE they even move the pointer.
      if (kind === "in") audio.startBoundaryLoop(cap.startSec);
      if (kind === "out") audio.startBoundaryLoop(cap.endSec);
      if (kind === "roll") audio.startBoundaryLoop(cap.endSec);

      // Anchor the playhead to the boundary being edited so visual + audio
      // stay glued together.
      if (kind === "in") audio.seekPlayhead(cap.startSec);
      if (kind === "out" || kind === "roll") audio.seekPlayhead(cap.endSec);

      const gap = allowTouching ? 0 : MIN_GAP_SEC;

      const onPointerMove = (ev: PointerEvent) => {
        const d = dragRef.current;
        if (!d) return;

        const deltaSec = (ev.clientX - d.startClientX) / pxPerSec;
        let raw: number;
        if (d.kind === "move") raw = d.initialStart + deltaSec;
        else if (d.kind === "in") raw = d.initialStart + deltaSec;
        else raw = d.initialEnd + deltaSec; // out or roll

        let snapped = snapTime(raw, snapTargets.times, pxPerSec);

        // ─── Collision clamping — the exact-sync guarantee ──────────────
        if (d.kind === "move") {
          const dur = d.initialEnd - d.initialStart;
          const minStart = prevEndSec !== null ? prevEndSec + gap : 0;
          const maxStart =
            nextStartSec !== null ? nextStartSec - gap - dur : Infinity;
          snapped = Math.max(minStart, Math.min(snapped, maxStart));
        } else if (d.kind === "in") {
          const minIn = prevEndSec !== null ? prevEndSec + gap : 0;
          const maxIn = d.initialEnd - MIN_CAPTION_SEC;
          snapped = Math.max(minIn, Math.min(snapped, maxIn));
        } else if (d.kind === "out") {
          const minOut = d.initialStart + MIN_CAPTION_SEC;
          const maxOut =
            nextStartSec !== null ? nextStartSec - gap : Infinity;
          snapped = Math.max(minOut, Math.min(snapped, maxOut));
        } else if (d.kind === "roll") {
          // Roll moves the shared boundary between this and the next caption.
          // Both sides must keep at least MIN_CAPTION_SEC duration.
          const minRoll = d.initialStart + MIN_CAPTION_SEC;
          const maxRoll =
            nextStartSec !== null ? nextStartSec - MIN_CAPTION_SEC : Infinity;
          snapped = Math.max(minRoll, Math.min(snapped, maxRoll));
        }

        snapped = Math.max(0, snapped); // never negative

        d.pendingSec = snapped;
        scheduleCommit();
      };

      const onPointerUp = () => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerUp);

        // Flush any pending commit synchronously so the FINAL position is
        // exact — not one frame behind.
        commitPending();

        audio.stopBoundaryLoop();
        dragRef.current = null;
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
    },
    [
      cap.id, cap.startSec, cap.endSec,
      prevEndSec, nextStartSec,
      pxPerSec, snapTargets, allowTouching,
      onSelect, onGestureStart,
      scheduleCommit, commitPending, audio,
    ],
  );

  // ─── Keyboard nudge for frame-accurate adjustment ────────────────────────
  useEffect(() => {
    if (!selected) return;

    const onKey = (e: KeyboardEvent) => {
      if (editing) return;

      let delta = 0;
      if (e.key === "ArrowLeft") delta = -1;
      else if (e.key === "ArrowRight") delta = 1;
      else return;

      e.preventDefault();

      let step: number;
      if (e.altKey) step = 0.001;      // ±1ms — sample-accurate territory
      else if (e.shiftKey) step = 0.1; // ±100ms
      else step = FRAME_SEC;           // ±1 frame @30fps

      onGestureStart("Nudge caption");
      onMove(cap.id, Math.max(0, cap.startSec + delta * step));
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, editing, cap.id, cap.startSec, onMove, onGestureStart]);

  // ─── Word-proportional inner layout ──────────────────────────────────────
  // Percentage left/width — NOT flexGrow with rounded ints — so each word
  // boundary lands EXACTLY on its true time position.
  const wordSpans = useMemo(() => {
    if (!cap.words || cap.words.length === 0 || isMusic) return null;
    return cap.words.map((w, i) => ({
      key: i,
      text: w.text,
      confidence: w.confidence,
      leftPct: ((w.startSec - cap.startSec) / durSec) * 100,
      widthPct: ((w.endSec - w.startSec) / durSec) * 100,
    }));
  }, [cap.words, cap.startSec, durSec, isMusic]);

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div
      data-block="1"
      className={`group absolute rounded-lg border backdrop-blur-sm overflow-hidden select-none transition-shadow ${
        selected
          ? "z-30 shadow-[0_0_0_2px_#DF2531,0_0_0_3px_#FFFFFF]"
          : isActive
          ? "z-20 shadow-[0_0_0_1px_#DF2531]"
          : "z-10 hover:shadow-[0_0_0_1px_#DF2531A6]"
      }`}
      style={{
        left: leftPx,
        width: widthPx,
        top: 0,
        height: "100%",
        background: bg,
        backgroundColor: C.black, // black base so translucent red reads correctly
        borderColor: border,
        borderStyle,
        touchAction: "none", // required for Pointer Events on touch
      }}
      onPointerDown={(e) => startDrag(e, "move")}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (!isMusic) setEditing(true);
      }}
    >
      {/* Left trim handle */}
      <span
        data-block="1"
        aria-label="Trim start"
        className="absolute inset-y-0 left-0 w-2.5 cursor-ew-resize z-20 flex items-center justify-center"
        onPointerDown={(e) => startDrag(e, "in")}
      >
        <span
          className="h-5 w-[3px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: C.white }}
        />
      </span>

      {/* Right trim handle */}
      <span
        data-block="1"
        aria-label="Trim end"
        className="absolute inset-y-0 right-0 w-2.5 cursor-ew-resize z-20 flex items-center justify-center"
        onPointerDown={(e) => startDrag(e, "out")}
      >
        <span
          className="h-5 w-[3px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: C.white }}
        />
      </span>

      {/* Content */}
      <div className="flex h-full flex-col justify-between px-3 py-1.5 pointer-events-none">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="px-1 py-0.5 rounded text-[9px] font-mono font-bold shrink-0"
            style={{ background: C.red, color: C.white }}
          >
            #{cap.index + 1}
          </span>
          {isMusic && (
            <Music2 size={11} style={{ color: C.white }} className="shrink-0" />
          )}
          {lowConf && (
            <CircleAlert size={11} style={{ color: C.red }} className="shrink-0" />
          )}

          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => {
                setEditing(false);
                if (draft.trim() && draft !== cap.text)
                  onTextCommit(cap.id, draft.trim());
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setEditing(false);
                  if (draft.trim() && draft !== cap.text)
                    onTextCommit(cap.id, draft.trim());
                }
                if (e.key === "Escape") setEditing(false);
                e.stopPropagation();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="pointer-events-auto w-full min-w-16 rounded px-1 text-[11px] font-semibold outline-none"
              style={{
                background: C.black,
                border: `1px solid ${C.red}`,
                color: C.white,
              }}
            />
          ) : (
            <span
              className={`truncate font-semibold text-[11px] ${isMusic ? "italic" : ""}`}
              style={{ color: C.white }}
            >
              {cap.text || "♪ Instrumental ♪"}
            </span>
          )}
        </div>

        {/* Word timing strip — percentage positions = exact time alignment */}
        {wordSpans && widthPx > 60 && (
          <div
            className="relative h-1 my-0.5 rounded-full overflow-hidden"
            style={{ background: `${C.black}80` }}
          >
            {wordSpans.map((ws) => (
              <div
                key={ws.key}
                className="absolute top-0 h-full"
                style={{
                  left: `${ws.leftPct}%`,
                  width: `${ws.widthPct}%`,
                  background:
                    ws.confidence >= 0.85
                      ? C.red
                      : ws.confidence >= 0.6
                      ? C.red65
                      : `${C.red}40`,
                }}
                title={`${ws.text} — ${(ws.confidence * 100).toFixed(0)}%`}
              />
            ))}
          </div>
        )}

        <div
          className="flex items-center justify-between text-[9px] font-mono"
          style={{ color: `${C.white}99` }}
        >
          <span>{formatTimecode(cap.startSec, 30, false)}</span>
          <span
            className="rounded px-1 py-0.5"
            style={{ background: `${C.black}CC`, color: `${C.white}B3` }}
          >
            {durSec.toFixed(3)}s
          </span>
          <span>{formatTimecode(cap.endSec, 30, false)}</span>
        </div>
      </div>
    </div>
  );
});

export default CaptionBlock;
