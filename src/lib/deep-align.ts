import type { AsrWord, Caption, Word } from "@/schema";
import { defaultAnim } from "@/schema";
import { createId } from "@/lib/ids";
import { distributeWordsInLine } from "@/align-engine";

export interface DeepAlignLine {
  lineIndex: number; // vocal-line ordinal (0-based)
  startSec: number;
  endSec: number;
  confidence: number;
  matchedText?: string;
}

export interface DeepAlignResult {
  alignedLines: DeepAlignLine[];
  instrumentalBreaks?: { startSec: number; endSec: number; label?: string }[];
}

export interface DeepAlignPromptInput {
  lines: { index: number; text: string; section?: string }[];
  segments: { index: number; start: number; end: number; text: string }[];
  durationSec: number;
}

export const DEEP_ALIGN_SYSTEM = `You are an expert audio-to-lyric synchronization and song structure alignment AI.
Your task is to accurately map each lyric line to its exact heard time interval [startSec, endSec] in the audio based on the ASR speech transcript segments.

Rules:
1. Every lyric line sung in the audio must be mapped with its real [startSec, endSec] timestamps.
2. Timestamps must be strictly non-decreasing (monotonic). Line N+1 cannot start before Line N starts.
3. If an instrumental intro exists (e.g. 0s to 18s), the first lyric line MUST start when singing actually begins, NOT at 0s!
4. If an instrumental solo, break, or interlude occurs between verses/choruses, the next lyric line must start after the break ends.
5. If a line is repeated in the lyrics (e.g. chorus), match it to the corresponding audio timestamp where that repetition occurs.
6. A single line should have a realistic singing duration (typically 1.5s to 6.0s depending on line length). NEVER crush multiple lines into a single second.
7. Cover EVERY lyric line. Do not skip lines: a missed line breaks the whole timeline.
8. Output strictly valid JSON:
{
  "alignedLines": [
    { "lineIndex": 0, "startSec": 15.2, "endSec": 18.5, "confidence": 0.95, "matchedText": "heard words" }
  ],
  "instrumentalBreaks": [
    { "startSec": 0, "endSec": 15.2, "label": "Intro" }
  ]
}`;

export function buildDeepAlignPrompts(input: DeepAlignPromptInput): { system: string; user: string } {
  return {
    system: DEEP_ALIGN_SYSTEM,
    user: JSON.stringify({
      totalDurationSec: input.durationSec,
      lyricLines: input.lines,
      heardAudioSegments: input.segments,
    }),
  };
}

/**
 * Validates an LLM deep-alignment response.
 * Rejects anything non-monotonic, out of bounds, or with crushed line spans.
 */
export function parseDeepAlign(raw: unknown, durationSec: number): DeepAlignResult | null {
  if (!raw || typeof raw !== "object") return null;
  const rows = (raw as { alignedLines?: unknown }).alignedLines;
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const lines: DeepAlignLine[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") return null;
    const r = row as Record<string, unknown>;
    const lineIndex = Number(r.lineIndex);
    const startSec = Number(r.startSec);
    const endSec = Number(r.endSec);
    const confidence = Number(r.confidence ?? 0.6);
    if (!Number.isInteger(lineIndex) || lineIndex < 0) return null;
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) return null;
    if (startSec < -0.5 || endSec > durationSec + 0.75) return null;
    if (endSec - startSec < 0.5 || endSec - startSec > 15) return null;
    lines.push({
      lineIndex,
      startSec: Math.max(0, startSec),
      endSec: Math.min(endSec, durationSec),
      confidence: Math.max(0, Math.min(1, confidence)),
      matchedText: typeof r.matchedText === "string" ? r.matchedText : undefined,
    });
  }
  lines.sort((a, b) => a.lineIndex - b.lineIndex);
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i]!.lineIndex <= lines[i - 1]!.lineIndex) return null;
    if (lines[i]!.startSec < lines[i - 1]!.startSec - 0.25) return null; // monotonic order guard
  }

  const breaks = (raw as { instrumentalBreaks?: unknown }).instrumentalBreaks;
  const instrumentalBreaks = Array.isArray(breaks)
    ? breaks
        .map((b) => {
          if (!b || typeof b !== "object") return null;
          const r = b as Record<string, unknown>;
          const s = Number(r.startSec);
          const e = Number(r.endSec);
          if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return null;
          return { startSec: Math.max(0, s), endSec: Math.min(e, durationSec), label: typeof r.label === "string" ? r.label : undefined };
        })
        .filter((b): b is { startSec: number; endSec: number; label: string | undefined } => b !== null)
    : [];

  return { alignedLines: lines, instrumentalBreaks };
}

/**
 * Repairs caption envelopes with LLM deep-alignment results.
 * Only touches lines where the LLM is at least as confident as the current
 * estimate, or the current line is weak (<0.65). Re-distributes words inside
 * each repaired window using the ASR words that fall in it, then re-enforces
 * global monotonic ordering and rebuilds instrumental gaps.
 *
 * Returns the repaired captions plus how many lines were moved.
 */
export function applyDeepAlignRepair(
  captions: Caption[],
  deep: DeepAlignResult,
  asrWords: AsrWord[],
  durationSec: number,
): { captions: Caption[]; repaired: number } {
  const deepByOrdinal = new Map(deep.alignedLines.map((l) => [l.lineIndex, l]));

  // Work on vocal captions in their current order; ordinal = vocal order,
  // matching the indices the LLM was given.
  const vocals: Caption[] = captions.filter((c) => !c.instrumental).map((c) => ({ ...c, words: c.words.map((w) => ({ ...w })) }));

  let repaired = 0;
  vocals.forEach((cap, ordinal) => {
    const d = deepByOrdinal.get(ordinal);
    if (!d) return;
    const shouldFix = d.confidence >= cap.confidence - 0.05 || cap.confidence < 0.65;
    if (!shouldFix) return;

    const start = Math.max(0, Math.min(d.startSec, durationSec - 0.7));
    const end = Math.min(durationSec, Math.max(start + 0.7, d.endSec));
    const windowWords = asrWords.filter((w) => w.start >= start - 0.35 && w.end <= end + 0.5);

    const redistributed = distributeWordsInLine(cap.text, start, end, windowWords);
    const words: Word[] = redistributed.map((w) => ({
      id: w.id ?? createId("w"),
      text: w.text,
      startSec: w.startSec ?? 0,
      endSec: w.endSec ?? 0,
      start: w.startSec ?? 0,
      end: w.endSec ?? 0,
      syllableStarts: w.syllableStarts ?? [],
      confidence: Math.max(w.confidence, 0.55),
      source: w.source,
    }));

    cap.startSec = start;
    cap.endSec = end;
    cap.start = start;
    cap.end = end;
    cap.words = words;
    cap.confidence = Math.max(cap.confidence, Math.min(0.92, d.confidence));
    repaired += 1;
  });

  // Re-enforce monotonic song order (cap N starts after cap N-1 starts,
  // overlaps resolved forward).
  for (let i = 1; i < vocals.length; i += 1) {
    const prev = vocals[i - 1]!;
    const curr = vocals[i]!;
    if (curr.startSec < prev.startSec) {
      curr.startSec = prev.startSec;
      curr.start = curr.startSec;
      curr.endSec = Math.max(curr.startSec + 0.7, curr.endSec);
      curr.end = curr.endSec;
    }
    if (prev.endSec > curr.startSec - 0.04) {
      prev.endSec = Math.max(prev.startSec + 0.5, curr.startSec - 0.04);
      prev.end = prev.endSec;
      if (prev.words.length > 0) {
        const last = prev.words[prev.words.length - 1]!;
        if (last.endSec > prev.endSec) {
          const scale = (prev.endSec - prev.words[0]!.startSec) / Math.max(0.01, last.endSec - prev.words[0]!.startSec);
          let cursor = prev.words[0]!.startSec;
          prev.words = prev.words.map((w) => {
            const ns = cursor;
            const nd = Math.max(0.08, (w.endSec - w.startSec) * Math.max(0.1, Math.min(1, scale)));
            const ne = Math.min(prev.endSec, ns + nd);
            cursor = ne;
            return { ...w, startSec: ns, endSec: ne, start: ns, end: ne };
          });
        }
      }
    }
  }

  // Rebuild instrumental gap markers from the repaired envelopes.
  const out: Caption[] = [];
  vocals.forEach((cap, i) => {
    const prev = vocals[i - 1];
    if (prev && cap.startSec - prev.endSec > 3.5) {
      out.push({
        id: createId("gap"),
        index: out.length,
        text: "♪",
        startSec: prev.endSec,
        endSec: cap.startSec,
        start: prev.endSec,
        end: cap.startSec,
        words: [],
        animation: {
          in: defaultAnim("fade"),
          out: defaultAnim("fade"),
          highlight: { style: "color", intensity: 0.4 },
        },
        confidence: 1,
        locked: false,
        instrumental: true,
      });
    }
    out.push({ ...cap, index: out.length });
  });

  // Leading intro gap if the first line starts late.
  const first = vocals[0];
  if (first && first.startSec > 3.5) {
    out.unshift({
      id: createId("gap"),
      index: 0,
      text: "♪",
      startSec: 0,
      endSec: first.startSec,
      start: 0,
      end: first.startSec,
      words: [],
      animation: {
        in: defaultAnim("fade"),
        out: defaultAnim("fade"),
        highlight: { style: "color", intensity: 0.4 },
      },
      confidence: 1,
      locked: false,
      instrumental: true,
    });
  }
  out.forEach((c, i) => {
    c.index = i;
  });

  return { captions: out, repaired };
}
