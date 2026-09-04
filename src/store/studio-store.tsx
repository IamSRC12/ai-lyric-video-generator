"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { produce } from "immer";
import { defaultAnim, type Caption, type CaptionStyle, type Project, type RippleMode } from "@/schema";
import { applyEdit, heuristicSync, mergeCaptions, parseLyrics, realignSingleLine, splitCaption, tokenizeLine } from "@/align-engine";
import { applyPreset, applyTemplateToProject } from "@/render-engine";
import { mirrorProject } from "@/lib/idb";
import { createId } from "@/lib/ids";

const HISTORY_LIMIT = 100;

interface HistoryState {
  past: Project[];
  future: Project[];
}

interface StudioState {
  project: Project;
  selectedIds: string[];
  playhead: number;
  playing: boolean;
  loop: boolean;
  volume: number;
  zoom: number;
  leftOpen: boolean;
  rightOpen: boolean;
  bottomOpen: boolean;
  leftWidth: number;
  rightWidth: number;
  bottomHeight: number;
  toast: { id: number; text: string } | null;
  dirty: boolean;
  saving: boolean;
}

export interface StudioApi extends StudioState {
  canUndo: boolean;
  canRedo: boolean;
  _openLyricsModal?: () => void;
  _openResyncModal?: () => void;
  openLyricsModal: () => void;
  openResyncModal: () => void;
  setProject: (project: Project, record?: boolean) => void;
  commit: (recipe: (draft: Project) => void, label?: string) => void;
  undo: () => void;
  redo: () => void;
  select: (ids: string[], additive?: boolean) => void;
  setPlayhead: (t: number) => void;
  setPlaying: (v: boolean) => void;
  setLoop: (v: boolean) => void;
  setVolume: (v: number) => void;
  setZoom: (v: number) => void;
  setRippleMode: (mode: RippleMode) => void;
  updateStyle: (patch: Partial<CaptionStyle>, scope: "default" | "selected") => void;
  applyStylePreset: (id: string) => void;
  applyTemplate: (id: string) => void;
  realignCaption: (id: string, audioSignal?: Float32Array, sampleRate?: number) => void;
  updateWordTiming: (captionId: string, wordIndex: number, startSec: number, endSec: number) => void;
  resizeCaption: (id: string, edge: "in" | "out", nextSec: number) => void;
  moveCaption: (id: string, nextStart: number) => void;
  rollCaption: (leftId: string, nextBoundary: number) => void;
  relinkCaption: (id: string, startSec: number) => void;
  splitAtPlayhead: () => void;
  mergeSelected: () => void;
  deleteSelected: () => void;
  duplicateSelected: () => void;
  nudge: (frames: number) => void;
  updateCaptionText: (id: string, text: string) => void;
  updateCaptionTiming: (id: string, startSec: number, endSec: number) => void;
  addCaption: (text?: string, startSec?: number, endSec?: number) => void;
  replaceLyrics: (rawLyrics: string) => void;
  setPanel: (which: "left" | "right" | "bottom", open: boolean) => void;
  setPanelSize: (which: "left" | "right" | "bottom", size: number) => void;
  notify: (text: string) => void;
  markSaved: () => void;
}

const StudioContext = createContext<StudioApi | null>(null);

export function StudioProvider({ initial, children }: { initial: Project; children: ReactNode }) {
  const [project, setProjectState] = useState<Project>(initial);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(false);
  const [volume, setVolume] = useState(0.9);
  const [zoom, setZoom] = useState(1);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [bottomOpen, setBottomOpen] = useState(true);
  const [leftWidth, setLeftWidth] = useState(300);
  const [rightWidth, setRightWidth] = useState(330);
  const [bottomHeight, setBottomHeight] = useState(230);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const history = useRef<HistoryState>({ past: [], future: [] });
  const [histSizes, setHistSizes] = useState({ past: 0, future: 0 });
  const toastId = useRef(0);

  const notify = useCallback((text: string) => {
    toastId.current += 1;
    setToast({ id: toastId.current, text });
  }, []);

  const pushHistory = useCallback((prev: Project) => {
    history.current = {
      past: [...history.current.past.slice(-(HISTORY_LIMIT - 1)), prev],
      future: [],
    };
    setHistSizes({ past: history.current.past.length, future: 0 });
  }, []);

  const setProject = useCallback(
    (next: Project, record = true) => {
      setProjectState((prev) => {
        if (record) pushHistory(prev);
        const updated = { ...next, updatedAt: new Date().toISOString() };
        void mirrorProject(updated.id, updated, updated.updatedAt);
        return updated;
      });
      setDirty(true);
    },
    [pushHistory],
  );

  const commit = useCallback(
    (recipe: (draft: Project) => void) => {
      setProjectState((prev) => {
        pushHistory(prev);
        const next = produce(prev, (draft) => {
          recipe(draft);
          draft.updatedAt = new Date().toISOString();
        });
        void mirrorProject(next.id, next, next.updatedAt);
        return next;
      });
      setDirty(true);
    },
    [pushHistory],
  );

  const undo = useCallback(() => {
    const prev = history.current.past.pop();
    if (!prev) return;
    setProjectState((curr) => {
      history.current.future.push(curr);
      setHistSizes({ past: history.current.past.length, future: history.current.future.length });
      return prev;
    });
    setDirty(true);
  }, []);

  const redo = useCallback(() => {
    const nxt = history.current.future.pop();
    if (!nxt) return;
    setProjectState((curr) => {
      history.current.past.push(curr);
      setHistSizes({ past: history.current.past.length, future: history.current.future.length });
      return nxt;
    });
    setDirty(true);
  }, []);

  const select = useCallback((ids: string[], additive = false) => {
    setSelectedIds((curr) => (additive ? Array.from(new Set([...curr, ...ids])) : ids));
  }, []);

  const applyCaptions = useCallback(
    (captions: Caption[], message?: string) => {
      commit((draft) => {
        draft.captions = captions;
      });
      if (message) notify(message);
    },
    [commit, notify],
  );

  const resizeCaption = useCallback(
    (id: string, edge: "in" | "out", nextSec: number) => {
      setProjectState((prev) => {
        pushHistory(prev);
        const result = applyEdit(
          prev.captions,
          { mode: prev.settings.rippleMode, durationSec: prev.meta.durationSec, fps: prev.meta.fps, selectedIds },
          { kind: "resize", id, edge, nextSec },
        );
        const next = produce(prev, (draft) => {
          draft.captions = result.captions;
          draft.updatedAt = new Date().toISOString();
        });
        void mirrorProject(next.id, next, next.updatedAt);
        if (result.message) notify(result.message);
        return next;
      });
      setDirty(true);
    },
    [selectedIds, pushHistory, notify],
  );

  const moveCaption = useCallback(
    (id: string, nextStart: number) => {
      setProjectState((prev) => {
        pushHistory(prev);
        const result = applyEdit(
          prev.captions,
          { mode: prev.settings.rippleMode, durationSec: prev.meta.durationSec, fps: prev.meta.fps, selectedIds },
          { kind: "move", id, nextStart },
        );
        const next = produce(prev, (draft) => {
          draft.captions = result.captions;
          draft.updatedAt = new Date().toISOString();
        });
        void mirrorProject(next.id, next, next.updatedAt);
        if (result.message) notify(result.message);
        return next;
      });
      setDirty(true);
    },
    [selectedIds, pushHistory, notify],
  );

  const rollCaption = useCallback(
    (leftId: string, nextBoundary: number) => {
      setProjectState((prev) => {
        pushHistory(prev);
        const result = applyEdit(
          prev.captions,
          { mode: "roll", durationSec: prev.meta.durationSec, fps: prev.meta.fps, selectedIds },
          { kind: "roll", leftId, nextBoundary },
        );
        const next = produce(prev, (draft) => {
          draft.captions = result.captions;
          draft.updatedAt = new Date().toISOString();
        });
        void mirrorProject(next.id, next, next.updatedAt);
        if (result.message) notify(result.message);
        return next;
      });
      setDirty(true);
    },
    [selectedIds, pushHistory, notify],
  );

  const relinkCaption = useCallback(
    (id: string, startSec: number) => {
      setProjectState((prev) => {
        pushHistory(prev);
        const result = applyEdit(
          prev.captions,
          { mode: "relink", durationSec: prev.meta.durationSec, fps: prev.meta.fps, selectedIds },
          { kind: "relink", target: { captionId: id, startSec } },
        );
        const next = produce(prev, (draft) => {
          draft.captions = result.captions;
          draft.updatedAt = new Date().toISOString();
        });
        void mirrorProject(next.id, next, next.updatedAt);
        return next;
      });
      setDirty(true);
    },
    [selectedIds, pushHistory],
  );

  const api = useMemo<StudioApi>(
    () => ({
      project,
      selectedIds,
      playhead,
      playing,
      loop,
      volume,
      zoom,
      leftOpen,
      rightOpen,
      bottomOpen,
      leftWidth,
      rightWidth,
      bottomHeight,
      toast,
      dirty,
      saving,
      canUndo: histSizes.past > 0,
      canRedo: histSizes.future > 0,
      setProject,
      commit,
      undo,
      redo,
      select,
      setPlayhead,
      setPlaying,
      setLoop,
      setVolume,
      setZoom,
      setRippleMode: (mode) => commit((d) => { d.settings.rippleMode = mode; }),
      updateStyle: (patch, scope) => {
        commit((d) => {
          if (scope === "default") Object.assign(d.defaultStyle, patch);
          else {
            for (const id of selectedIds) {
              const cap = d.captions.find((c) => c.id === id);
              if (cap) cap.styleOverride = { ...(cap.styleOverride ?? {}), ...patch };
            }
          }
        });
      },
      applyStylePreset: (id) => setProject(applyTemplateToProject(project, id)),
      applyTemplate: (id) => setProject(applyTemplateToProject(project, id)),
      realignCaption: (id, audioSignal, sampleRate) => {
        commit((d) => {
          const cap = d.captions.find((c) => c.id === id);
          if (!cap || cap.instrumental) return;
          const refinedWords = realignSingleLine(cap.text, cap.startSec, cap.endSec, [], audioSignal, sampleRate ?? 44100);
          cap.words = refinedWords.map((w) => ({
            text: w.text,
            startSec: w.start,
            endSec: w.end,
            start: w.start,
            end: w.end,
            syllableStarts: w.syllableStarts,
            confidence: w.confidence,
            source: w.source,
          }));
          cap.confidence = refinedWords.length > 0
            ? refinedWords.reduce((s, w) => s + w.confidence, 0) / refinedWords.length
            : cap.confidence;
        });
        notify("Re-aligned line timings with audio onsets");
      },
      updateWordTiming: (captionId, wordIndex, startSec, endSec) => {
        commit((d) => {
          const cap = d.captions.find((c) => c.id === captionId);
          if (!cap || !cap.words || !cap.words[wordIndex]) return;
          const w = cap.words[wordIndex]!;
          w.startSec = Math.max(cap.startSec, startSec);
          w.endSec = Math.min(cap.endSec, Math.max(w.startSec + 0.05, endSec));
          w.start = w.startSec;
          w.end = w.endSec;
          w.source = "manual";
        });
      },
      resizeCaption,
      moveCaption,
      rollCaption,
      relinkCaption,
      splitAtPlayhead: () => {
        const id = selectedIds[0];
        if (!id) return;
        applyCaptions(splitCaption(project.captions, id, playhead));
      },
      mergeSelected: () => applyCaptions(mergeCaptions(project.captions, selectedIds)),
      deleteSelected: () => {
        applyCaptions(project.captions.filter((c) => !selectedIds.includes(c.id)).map((c, i) => ({ ...c, index: i })));
        setSelectedIds([]);
      },
      duplicateSelected: () => {
        const copies = project.captions
          .filter((c) => selectedIds.includes(c.id))
          .map((c) => ({
            ...c,
            id: `${c.id}_copy_${Date.now()}`,
            startSec: c.endSec + 0.04,
            endSec: c.endSec + 0.04 + (c.endSec - c.startSec),
            words: c.words.map((w) => ({
              ...w,
              startSec: w.startSec + (c.endSec - c.startSec) + 0.04,
              endSec: w.endSec + (c.endSec - c.startSec) + 0.04,
            })),
          }));
        applyCaptions([...project.captions, ...copies].sort((a, b) => a.startSec - b.startSec).map((c, i) => ({ ...c, index: i })));
      },
      nudge: (frames) => {
        const delta = frames / (project.meta.fps || 30);
        const id = selectedIds[0];
        if (!id) return;
        const cap = project.captions.find((c) => c.id === id);
        if (!cap) return;
        moveCaption(id, cap.startSec + delta);
      },
      updateCaptionText: (id, text) => {
        commit((d) => {
          const cap = d.captions.find((c) => c.id === id);
          if (!cap || cap.text === text) return;
          cap.text = text;
          // Redistribute words across the caption span but keep the envelope —
          // never clobber a hand-tuned or ASR-derived line boundary here.
          const words = tokenizeLine(text);
          const span = Math.max(0.04, cap.endSec - cap.startSec);
          const wspan = span / Math.max(1, words.length);
          cap.words = words.map((t, i) => ({
            text: t.raw,
            startSec: cap.startSec + i * wspan,
            endSec: cap.startSec + (i + 1) * wspan,
            confidence: 0.8,
          }));
        });
      },
      updateCaptionTiming: (id, startSec, endSec) => {
        commit((d) => {
          const cap = d.captions.find((c) => c.id === id);
          if (!cap) return;
          const start = Math.max(0, Math.min(startSec, endSec - 0.05));
          const end = Math.min(d.meta.durationSec > 0 ? d.meta.durationSec : 9999, Math.max(endSec, start + 0.05));
          if (cap.startSec === start && cap.endSec === end) return;
          const oldStart = cap.startSec;
          const oldSpan = Math.max(1e-4, cap.endSec - cap.startSec);
          const newSpan = end - start;
          cap.startSec = start;
          cap.endSec = end;
          // Scale existing word timestamps into the new window instead of
          // wiping them — preserves relative karaoke rhythm on resize.
          cap.words = cap.words.map((w) => ({
            ...w,
            startSec: start + ((w.startSec - oldStart) / oldSpan) * newSpan,
            endSec: start + ((w.endSec - oldStart) / oldSpan) * newSpan,
          }));
        });
      },
      addCaption: (text = "New lyric line", startSec, endSec) => {
        const start = startSec !== undefined ? startSec : playhead;
        const duration = project.meta.durationSec > 0 ? project.meta.durationSec : 60;
        const end = endSec !== undefined ? endSec : Math.min(duration, start + 2.5);
        const words = tokenizeLine(text);
        const wspan = Math.max(0.05, (end - start) / Math.max(1, words.length));
        const newCap: Caption = {
          id: createId("cap"),
          index: project.captions.length,
          text,
          startSec: start,
          endSec: Math.max(start + 0.1, end),
          words: words.map((t, i) => ({
            text: t.raw,
            startSec: start + i * wspan,
            endSec: start + (i + 1) * wspan,
            confidence: 0.8,
          })),
          animation: {
            in: defaultAnim("fade"),
            out: defaultAnim("fade"),
            highlight: { style: "color", intensity: 1 },
          },
          confidence: 0.8,
          instrumental: false,
          locked: false,
        };
        applyCaptions([...project.captions, newCap].sort((a, b) => a.startSec - b.startSec).map((c, i) => ({ ...c, index: i })));
        setSelectedIds([newCap.id]);
      },
      replaceLyrics: (rawLyrics: string) => {
        const parsed = parseLyrics(rawLyrics);
        const vocalLines = parsed.lines.filter((l) => !l.instrumental);
        if (vocalLines.length === 0) {
          notify("No lyric lines found in sheet.");
          return;
        }
        commit((d) => {
          const existingVocal = d.captions.filter((c) => !c.instrumental);
          if (existingVocal.length === vocalLines.length) {
            // Preserving existing line boundaries and timestamps
            let vIdx = 0;
            for (let i = 0; i < d.captions.length; i++) {
              const cap = d.captions[i]!;
              if (cap.instrumental) continue;
              const newL = vocalLines[vIdx]!;
              vIdx++;
              cap.text = newL.text;
              const words = tokenizeLine(newL.text);
              const span = Math.max(0.04, cap.endSec - cap.startSec);
              const wspan = span / Math.max(1, words.length);
              cap.words = words.map((t, wi) => ({
                text: t.raw,
                startSec: cap.startSec + wi * wspan,
                endSec: cap.startSec + (wi + 1) * wspan,
                confidence: cap.confidence ?? 0.8,
              }));
            }
            if (parsed.title && (!d.meta.title || d.meta.title === "Midnight Atlas")) d.meta.title = parsed.title;
            if (parsed.artist && (!d.meta.artist || d.meta.artist === "Northline")) d.meta.artist = parsed.artist;
            return;
          }

          // Line count changed -> full re-sync
          const dur = d.meta.durationSec > 0 ? d.meta.durationSec : Math.max(30, vocalLines.length * 3.6);
          const synced = heuristicSync(parsed.lines, dur);
          if (parsed.title) d.meta.title = parsed.title;
          else if (d.meta.title === "Midnight Atlas" || !d.meta.title) {
            d.meta.title = vocalLines[0]?.text.slice(0, 32) || "Custom Lyrics";
          }
          if (parsed.artist) d.meta.artist = parsed.artist;
          else if (d.meta.artist === "Northline") {
            d.meta.artist = "";
          }
          d.captions = synced.captions;
        });
        setPlayhead(0);
        setSelectedIds(project.captions[0] ? [project.captions[0].id] : []);
        notify(`Updated lyrics sheet.`);
      },
      setPanel: (which, open) => {
        if (which === "left") setLeftOpen(open);
        if (which === "right") setRightOpen(open);
        if (which === "bottom") setBottomOpen(open);
      },
      setPanelSize: (which, size) => {
        if (which === "left") setLeftWidth(size);
        if (which === "right") setRightWidth(size);
        if (which === "bottom") setBottomHeight(size);
      },
      notify,
      markSaved: () => {
        setDirty(false);
        setSaving(false);
      },
      _openLyricsModal: undefined,
      _openResyncModal: undefined,
      openLyricsModal: () => {
        if (api._openLyricsModal) api._openLyricsModal();
      },
      openResyncModal: () => {
        if (api._openResyncModal) api._openResyncModal();
      },
    }),
    [
      project,
      selectedIds,
      playhead,
      playing,
      loop,
      volume,
      zoom,
      leftOpen,
      rightOpen,
      bottomOpen,
      leftWidth,
      rightWidth,
      bottomHeight,
      toast,
      dirty,
      saving,
      histSizes,
      setProject,
      commit,
      undo,
      redo,
      select,
      resizeCaption,
      moveCaption,
      rollCaption,
      relinkCaption,
      applyCaptions,
      notify,
    ],
  );

  return <StudioContext.Provider value={api}>{children}</StudioContext.Provider>;
}

export function useStudio(): StudioApi {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error("useStudio must be used within StudioProvider");
  return ctx;
}

