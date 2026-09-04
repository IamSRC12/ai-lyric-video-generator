import {
  defaultAnim,
  type AnchorHit,
  type AsrResult,
  type AsrWord,
  type Caption,
  type LineTiming,
  type LyricLine,
  type Word,
  type WordTiming,
} from "@/schema";
import { createId } from "@/lib/ids";
import { needlemanWunsch } from "./needleman-wunsch";
import { countSyllables, tokenizeLine, type NormToken } from "./normalize";
import { parseLyrics } from "./lyrics";
import { sanitizeAsrWords } from "./sanitize";
import { detectOnsets, refineSyllableStarts, snapWordToOnset } from "@/dsp";

export interface TimedLyricWord {
  lineIndex: number;
  tokenIndex: number;
  text: string; // "" = expansion fragment, merged into previous word
  startSec: number;
  endSec: number;
  confidence: number;
  matched: boolean;
  syllableStarts?: number[];
  source?: "whisper" | "aligned" | "snapped" | "manual";
}

export interface SyncResult {
  captions: Caption[];
  flagged: number;
  meanConfidence: number;
  droppedAsrWords: number;
}

const MIN_WORD_DUR = 0.08;
const MAX_INTERP_WORD_DUR = 1.25;
const MIN_CAPTION_DUR = 0.7;

interface Owner {
  line: number;
  token: number;
  text: string;
  fragment: boolean;
}

function flattenLyrics(lines: LyricLine[]): { tokens: NormToken[]; owners: Owner[] } {
  const tokens: NormToken[] = [];
  const owners: Owner[] = [];
  for (const line of lines) {
    if (line.instrumental) continue;
    let tokenIndex = 0;
    for (const raw of line.text.trim().split(/\s+/).filter(Boolean)) {
      const parts = tokenizeLine(raw); // expands contractions: "I'm" -> i, am
      parts.forEach((t, k) => {
        tokens.push(t);
        owners.push({
          line: line.index,
          token: tokenIndex,
          text: k === 0 ? raw : "", // fragments carry "" and merge later
          fragment: k > 0,
        });
      });
      tokenIndex += 1;
    }
  }
  return { tokens, owners };
}

function interpolate(start: number, end: number, weights: number[]) {
  const total = weights.reduce((s, w) => s + w, 0) || weights.length || 1;
  const span = Math.max(0.04, end - start);
  let cursor = start;
  return weights.map((w) => {
    const dur = (w / total) * span;
    const item = { startSec: cursor, endSec: cursor + dur };
    cursor += dur;
    return item;
  });
}

/**
 * Distributes words inside a single line window [lineStart, lineEnd]
 * using Whisper relative positions as priors and syllable/character weights.
 */
export function distributeWordsInLine(
  lineText: string,
  lineStart: number,
  lineEnd: number,
  candidateAsrWords: AsrWord[] = [],
): WordTiming[] {
  const rawWords = lineText.trim().split(/\s+/).filter(Boolean);
  if (rawWords.length === 0) return [];

  const lineSpan = Math.max(0.2, lineEnd - lineStart);
  const lyricTokens = rawWords.map((w) => tokenizeLine(w)[0] ?? { raw: w, norm: w.toLowerCase(), metaphone: "", syllables: countSyllables(w) });

  // 1. If we have candidate ASR words, align them locally with NW
  const asrTokens = candidateAsrWords.map((w) => tokenizeLine(w.word)[0] ?? { raw: w.word, norm: w.word.toLowerCase(), metaphone: "", syllables: 1 });
  const alignment = needlemanWunsch(lyricTokens, asrTokens);

  const matchedAsr = new Map<number, AsrWord>();
  for (const cell of alignment.path) {
    if (cell.op === "match") {
      const asr = candidateAsrWords[cell.asrIndex];
      if (asr) matchedAsr.set(cell.lyricIndex, asr);
    }
  }

  // 2. Compute weights from syllable count and character length
  const weights = lyricTokens.map((t) => Math.max(1, (t.syllables || 1) * 1.2 + Math.min(3, t.norm.length * 0.15)));
  const totalWeight = weights.reduce((s, w) => s + w, 0) || 1;

  // 3. Assign initial timestamps using matches and interpolation
  const words: WordTiming[] = [];
  let cursor = lineStart;

  for (let i = 0; i < rawWords.length; i++) {
    const text = rawWords[i]!;
    const asr = matchedAsr.get(i);
    const weightFraction = weights[i]! / totalWeight;
    const naturalDuration = Math.max(MIN_WORD_DUR, weightFraction * lineSpan);

    let start: number;
    let end: number;
    let confidence: number;
    let source: WordTiming["source"];

    if (asr && asr.start >= lineStart - 0.2 && asr.end <= lineEnd + 0.2) {
      start = Math.max(lineStart, asr.start);
      end = Math.min(lineEnd, Math.max(start + MIN_WORD_DUR, asr.end));
      confidence = 0.85;
      source = "whisper";
    } else {
      start = cursor;
      end = Math.min(lineEnd, start + naturalDuration);
      confidence = 0.45;
      source = "aligned";
    }

    cursor = Math.max(cursor + 0.04, end);

    words.push({
      id: createId("w"),
      text,
      start,
      end,
      startSec: start,
      endSec: end,
      confidence,
      source,
    });
  }

  // 4. Smooth & ensure monotonicity
  for (let i = 0; i < words.length; i++) {
    const curr = words[i]!;
    const prev = i > 0 ? words[i - 1] : null;

    if (prev && curr.start < prev.end) {
      const mid = (prev.end + curr.start) / 2;
      prev.end = mid;
      curr.start = mid;
    }
    if (curr.end - curr.start < MIN_WORD_DUR) {
      curr.end = Math.min(lineEnd, curr.start + MIN_WORD_DUR);
    }
  }

  return words;
}

/**
 * Redistributes a line using preserved ASR timings. Acoustic onset snapping is
 * applied only when decoded audio samples are explicitly supplied.
 */
export function realignSingleLine(
  lineText: string,
  currentStart: number,
  currentEnd: number,
  candidateAsrWords: AsrWord[] = [],
  audioSignal?: Float32Array,
  sampleRate = 44100,
): WordTiming[] {
  const words = distributeWordsInLine(lineText, currentStart, currentEnd, candidateAsrWords);

  let onsets: number[] = [];
  if (audioSignal && sampleRate > 0) {
    onsets = detectOnsets(audioSignal, sampleRate);
  }

  const snapped = words.map((w) => {
    let wordSnap = w;
    if (onsets.length > 0) {
      wordSnap = snapWordToOnset(w, onsets, 120, { start: currentStart, end: currentEnd });
    }
    const syllables = countSyllables(w.text);
    const syllableStarts = refineSyllableStarts(wordSnap, syllables, audioSignal, sampleRate);
    return {
      ...wordSnap,
      syllableStarts,
    };
  });

  return snapped;
}

export function assignTimestamps(
  lyricTokens: NormToken[],
  owners: Owner[],
  asrWords: AsrWord[],
  path: { op: string; lyricIndex: number; asrIndex: number; score: number }[],
  durationSec: number,
): TimedLyricWord[] {
  const timed: Array<TimedLyricWord | null> = lyricTokens.map((t, i) => ({
    lineIndex: owners[i]?.line ?? 0,
    tokenIndex: owners[i]?.token ?? 0,
    text: owners[i]?.text ?? t.raw,
    startSec: -1,
    endSec: -1,
    confidence: 0,
    matched: false,
    source: "aligned",
  }));

  for (const cell of path) {
    if (cell.op !== "match") continue;
    const asr = asrWords[cell.asrIndex];
    const slot = timed[cell.lyricIndex];
    if (!asr || !slot) continue;
    slot.startSec = asr.start;
    slot.endSec = Math.max(asr.start + MIN_WORD_DUR, asr.end);
    slot.confidence = Math.max(0.15, Math.min(1, cell.score));
    slot.matched = true;
    slot.source = "whisper";
  }

  // Outlier rejection: matched words must be monotonic in match order.
  let lastStart = -Infinity;
  for (const t of timed) {
    if (!t || !t.matched) continue;
    if (t.startSec < lastStart - 0.02) {
      t.startSec = -1;
      t.endSec = -1;
      t.matched = false;
      t.confidence = 0;
    } else {
      lastStart = t.startSec;
    }
  }

  // Fill unmatched runs with syllable-weighted interpolation
  let i = 0;
  while (i < timed.length) {
    if ((timed[i]?.startSec ?? -1) >= 0) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < timed.length && (timed[j]?.startSec ?? -1) < 0) j += 1;
    let prev = i - 1;
    while (prev >= 0 && (timed[prev]?.startSec ?? -1) < 0) prev -= 1;

    const leftT = prev >= 0 ? timed[prev]!.endSec : 0;
    const rightT = j < timed.length ? timed[j]!.startSec : durationSec;
    const gap = timed.slice(i, j);
    const weights = gap.map((_, k) => {
      const tok = lyricTokens[i + k];
      return tok ? tok.syllables || Math.max(1, tok.norm.length / 3) : 1;
    });

    const available = Math.max(0.2, rightT - leftT);
    const naturalTotal = weights.reduce((s, w) => s + w, 0) || 1;
    const naturalDurPerWeight = 0.28;
    const naturalBlock = naturalTotal * naturalDurPerWeight;

    let blockStart = leftT + 0.08;
    let blockDur = Math.min(available - 0.1, Math.max(naturalBlock, gap.length * MIN_WORD_DUR));
    if (blockDur < naturalBlock) blockDur = Math.max(gap.length * MIN_WORD_DUR, available - 0.1);
    if (available > naturalBlock * 2.2) {
      blockStart = leftT + (available - naturalBlock) * 0.35;
      blockDur = naturalBlock;
    }
    blockDur = Math.max(blockDur, gap.length * MIN_WORD_DUR);

    const spans = interpolate(blockStart, blockStart + blockDur, weights);
    gap.forEach((g, k) => {
      if (!g) return;
      const s = spans[k]!;
      g.startSec = s.startSec;
      g.endSec = Math.max(s.startSec + MIN_WORD_DUR, Math.min(s.endSec, s.startSec + MAX_INTERP_WORD_DUR));
      g.confidence = 0.28;
      g.source = "aligned";
    });
    i = j;
  }

  // Final monotonic sweep
  for (let k = 0; k < timed.length; k += 1) {
    const curr = timed[k]!;
    const prev = k > 0 ? timed[k - 1]! : null;
    if (prev && curr.startSec < prev.endSec) {
      const mid = (prev.endSec + curr.startSec) / 2;
      prev.endSec = mid;
      curr.startSec = mid;
    }
    if (curr.endSec - curr.startSec < MIN_WORD_DUR) {
      curr.endSec = curr.startSec + MIN_WORD_DUR;
    }
    if (prev && curr.startSec < prev.startSec + 0.02) {
      curr.startSec = prev.startSec + 0.02;
      curr.endSec = Math.max(curr.endSec, curr.startSec + MIN_WORD_DUR);
    }
  }

  return timed.filter((t): t is TimedLyricWord => t !== null);
}

export function assembleLines(
  lines: LyricLine[],
  words: TimedLyricWord[],
  durationSec: number,
): Caption[] {
  const byLine = new Map<number, TimedLyricWord[]>();
  for (const w of words) {
    const list = byLine.get(w.lineIndex) ?? [];
    list.push(w);
    byLine.set(w.lineIndex, list);
  }

  const captions: Caption[] = [];
  const vocalLines = lines.filter((l) => !l.instrumental);

  vocalLines.forEach((line, order) => {
    const group = (byLine.get(line.index) ?? []).sort((a, b) => a.startSec - b.startSec);

    // Merge contraction fragments ("i","am" -> one "I'm" word)
    const mergedWords: Word[] = [];
    for (const g of group) {
      if (g.text === "" && mergedWords.length > 0) {
        mergedWords[mergedWords.length - 1]!.endSec = g.endSec;
        continue;
      }
      mergedWords.push({
        id: createId("w"),
        text: g.text,
        startSec: g.startSec,
        endSec: g.endSec,
        start: g.startSec,
        end: g.endSec,
        syllableStarts: g.syllableStarts,
        confidence: g.confidence,
        source: g.source ?? (g.matched ? "whisper" : "aligned"),
      });
    }

    const first = mergedWords[0];
    const last = mergedWords[mergedWords.length - 1];
    let start = first ? Math.max(0, first.startSec - 0.06) : 0;
    let end = last ? last.endSec + 0.12 : start + 1;
    if (end - start < MIN_CAPTION_DUR) end = start + MIN_CAPTION_DUR;
    end = Math.min(end, durationSec);

    const matched = group.filter((g) => g.matched).length;
    const conf =
      group.length === 0
        ? 0.2
        : 0.55 * (matched / group.length) +
          0.45 * (group.reduce((s, g) => s + g.confidence, 0) / group.length);

    captions.push({
      id: createId("cap"),
      index: order,
      text: line.text,
      startSec: start,
      endSec: end,
      start,
      end,
      words: mergedWords,
      animation: {
        in: defaultAnim("fade"),
        out: { ...defaultAnim("fade"), durationSec: 0.25 },
        highlight: { style: "color", intensity: 1 },
      },
      confidence: Math.max(0, Math.min(1, conf)),
      instrumental: false,
      locked: false,
      section: line.section,
    });
  });

  captions.sort((a, b) => a.startSec - b.startSec);

  // Overlap resolution
  for (let i = 0; i < captions.length; i += 1) {
    const curr = captions[i]!;
    const next = captions[i + 1];
    if (next && curr.endSec > next.startSec - 0.04) {
      const floor = curr.startSec + 0.3;
      curr.endSec = Math.max(floor, next.startSec - 0.04);
    }
    curr.endSec = Math.min(curr.endSec, durationSec);
    curr.start = curr.startSec;
    curr.end = curr.endSec;
    curr.index = i;
  }

  // Instrumental gap markers
  const withGaps: Caption[] = [];
  for (let i = 0; i < captions.length; i += 1) {
    const curr = captions[i]!;
    const prev = withGaps[withGaps.length - 1];
    if (prev && curr.startSec - prev.endSec > 3.5) {
      withGaps.push({
        id: createId("gap"),
        index: withGaps.length,
        text: "♪",
        startSec: prev.endSec,
        endSec: curr.startSec,
        start: prev.endSec,
        end: curr.startSec,
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
    withGaps.push({ ...curr, index: withGaps.length });
  }
  return withGaps;
}

export function snapToSegments(captions: Caption[], asr: AsrResult): Caption[] {
  return refineLinesWithSegments(captions, asr);
}

export function scoreLine(caption: Caption, anchors: AnchorHit[]): number {
  if (caption.instrumental) return 1;
  const words = caption.words;
  if (words.length === 0) return 0.2;
  const density = words.filter((w) => w.confidence >= 0.45).length / words.length;
  const gaps = words.filter((w) => w.confidence < 0.3).length / words.length;
  const anchor = anchors.find((a) => a.lineIndex === caption.index);
  const anchorAgree = anchor ? anchor.peakConfidence : 0.5;
  return Math.max(0, Math.min(1, 0.45 * density + 0.2 * (1 - gaps) + 0.2 * anchorAgree + 0.15 * caption.confidence));
}

export function refineLinesWithSegments(captions: Caption[], asr: AsrResult): Caption[] {
  const segs = [...(asr.segments ?? [])].sort((a, b) => a.start - b.start);
  if (segs.length === 0) return captions;
  const firstVocal = segs[0]!.start;

  return captions.map((cap) => {
    if (cap.instrumental || cap.words.length === 0) {
      const start = Math.max(firstVocal - 0.35, cap.startSec);
      return {
        ...cap,
        startSec: Math.max(0, start),
        endSec: Math.max(start + 1.2, cap.endSec),
        start: Math.max(0, start),
        end: Math.max(start + 1.2, cap.endSec),
      };
    }

    const mid = cap.words.reduce((s, w) => s + (w.startSec + w.endSec) / 2, 0) / cap.words.length;
    let seg = segs.find((sg) => mid >= sg.start && mid <= sg.end);
    if (!seg) seg = segs.reduce((best, sg) => (Math.abs(sg.start - mid) < Math.abs(best.start - mid) ? sg : best));

    const wFirst = cap.words[0]!;
    const wLast = cap.words[cap.words.length - 1]!;
    const start = Math.max(0, Math.min(wFirst.startSec - 0.08, seg.start));
    const end = Math.max(wLast.endSec + 0.15, Math.min(seg.end, start + 12));
    return { ...cap, startSec: start, endSec: end, start, end };
  });
}

export function applyAnchorWarp(captions: Caption[], anchors: AnchorHit[]): Caption[] {
  // An FFT anchor is the absolute master-media time where the mapped lyric line
  // begins. Convert it to a correction from that line's current timing; treating
  // it as a raw delta would shift an already-correct 30s line by another 30s.
  const captionByLine = new Map(captions.filter((c) => !c.instrumental).map((c, order) => [order, c]));
  const hits = anchors
    .filter((a) => Number.isFinite(a.offsetSec) && a.peakConfidence >= 0.35)
    .map((a) => {
      const caption = captionByLine.get(a.lineIndex);
      return caption ? { t: caption.startSec, correction: a.offsetSec - caption.startSec } : null;
    })
    .filter((hit): hit is { t: number; correction: number } => hit !== null)
    .sort((a, b) => a.t - b.t);
  if (hits.length === 0) return captions;

  const correctionAt = (t: number) => {
    if (hits.length === 1) return hits[0]!.correction;
    if (t <= hits[0]!.t) return hits[0]!.correction;
    if (t >= hits[hits.length - 1]!.t) return hits[hits.length - 1]!.correction;
    for (let i = 0; i < hits.length - 1; i += 1) {
      const a = hits[i]!;
      const b = hits[i + 1]!;
      if (t >= a.t && t <= b.t) {
        return a.correction + ((b.correction - a.correction) * (t - a.t)) / Math.max(1e-6, b.t - a.t);
      }
    }
    return 0;
  };

  const warp = (t: number) => Math.max(0, t + correctionAt(t));
  return captions.map((cap) => {
    const startSec = warp(cap.startSec);
    const endSec = Math.max(startSec + 0.04, warp(cap.endSec));
    return {
      ...cap,
      startSec,
      endSec,
      start: startSec,
      end: endSec,
      words: cap.words.map((w) => {
        const wordStart = warp(w.startSec);
        const wordEnd = Math.max(wordStart + MIN_WORD_DUR, warp(w.endSec));
        return { ...w, startSec: wordStart, endSec: wordEnd, start: wordStart, end: wordEnd };
      }),
    };
  });
}

/**
 * CapCut-style 2-level alignment pipeline:
 * 1. Normalize user lyrics into lines/phrases.
 * 2. LINE-level Needleman-Wunsch alignment of user lyrics ↔ Whisper candidate windows.
 * 3. WORD-level distribution inside each line window (Whisper relative positions prior + phoneme/syllable length weighting).
 * 4. DSP onset/energy snap within ±120ms (clamped inside line window).
 * 5. Syllable refine & confidence tags.
 */
export function runAlignment(input: {
  userLyrics: string | LyricLine[];
  whisperResult?: AsrResult;
  audio?: Float32Array;
  sampleRate?: number;
  durationSec?: number;
  anchors?: AnchorHit[];
}): LineTiming[] {
  const lines: LyricLine[] =
    typeof input.userLyrics === "string"
      ? parseLyrics(input.userLyrics).lines
      : input.userLyrics;

  const durationSec = input.durationSec ?? input.whisperResult?.duration ?? 180;
  const asr = input.whisperResult ?? { text: "", words: [], segments: [] };

  // Detect audio onsets if audio is provided
  let onsets: number[] = [];
  if (input.audio && input.audio.length > 0) {
    onsets = detectOnsets(input.audio, input.sampleRate ?? 44100);
  }

  // 1. Align using sequence alignment
  const syncRes = runSync({
    lines,
    asr,
    durationSec,
    anchors: input.anchors,
  });

  // 2. Perform onset snap and syllable refinement on every line's words
  const refinedLines: LineTiming[] = syncRes.captions.map((cap) => {
    if (cap.instrumental || cap.words.length === 0) {
      return {
        id: cap.id,
        text: cap.text,
        start: cap.startSec,
        end: cap.endSec,
        startSec: cap.startSec,
        endSec: cap.endSec,
        words: [],
        confidence: cap.confidence,
        instrumental: true,
        section: cap.section,
        index: cap.index,
      };
    }

    const snappedWords: WordTiming[] = cap.words.map((w) => {
      let wordObj: WordTiming = {
        id: w.id ?? createId("w"),
        text: w.text,
        start: w.startSec,
        end: w.endSec,
        startSec: w.startSec,
        endSec: w.endSec,
        confidence: w.confidence,
        source: (w.source as WordTiming["source"]) ?? "aligned",
      };

      if (onsets.length > 0) {
        wordObj = snapWordToOnset(wordObj, onsets, 120, { start: cap.startSec, end: cap.endSec });
      }

      const sylCount = countSyllables(w.text);
      wordObj.syllableStarts = refineSyllableStarts(wordObj, sylCount, input.audio, input.sampleRate);
      return wordObj;
    });

    return {
      id: cap.id,
      text: cap.text,
      start: cap.startSec,
      end: cap.endSec,
      startSec: cap.startSec,
      endSec: cap.endSec,
      words: snappedWords,
      confidence: cap.confidence,
      instrumental: false,
      section: cap.section,
      index: cap.index,
    };
  });

  return refinedLines;
}

export function runSync(input: {
  lines: LyricLine[];
  asr: AsrResult;
  durationSec: number;
  anchors?: AnchorHit[];
}): SyncResult {
  const { tokens: lyricTokens, owners } = flattenLyrics(input.lines);

  const sanitized = sanitizeAsrWords(input.asr);
  const asrWords = sanitized.words;
  const asrTokens: NormToken[] = [];
  const asrWordOwner: AsrWord[] = [];
  for (const w of asrWords) {
    const parts = tokenizeLine(w.word);
    if (parts.length === 0) continue;
    asrTokens.push(parts[0]!);
    asrWordOwner.push(w);
  }

  const aligned = needlemanWunsch(lyricTokens, asrTokens, []);
  const timed = assignTimestamps(lyricTokens, owners, asrWordOwner, aligned.path, input.durationSec);
  let captions = assembleLines(input.lines, timed, input.durationSec);

  captions = refineLinesWithSegments(captions, input.asr);
  // Clip mapping uses parsed lyric indices (including blank/instrumental rows),
  // while assembled vocal captions use compact vocal indices. Normalize once so
  // anchors cannot attach to the wrong line after an instrumental break.
  const vocalOrderByLine = new Map(
    input.lines.filter((line) => !line.instrumental).map((line, order) => [line.index, order]),
  );
  const normalizedAnchors = (input.anchors ?? []).flatMap((anchor) => {
    const lineIndex = vocalOrderByLine.get(anchor.lineIndex);
    return lineIndex === undefined ? [] : [{ ...anchor, lineIndex }];
  });
  if (normalizedAnchors.length > 0) {
    captions = applyAnchorWarp(captions, normalizedAnchors);
  }

  const finalCaptions = captions.map((c) => ({
    ...c,
    confidence: scoreLine(c, normalizedAnchors),
  }));

  const flagged = captions.filter((c) => !c.instrumental && c.confidence < 0.6).length;
  const vocal = captions.filter((c) => !c.instrumental);
  const meanConfidence = vocal.length ? vocal.reduce((s, c) => s + c.confidence, 0) / vocal.length : 0;

  return { captions: finalCaptions, flagged, meanConfidence, droppedAsrWords: sanitized.droppedWords };
}

export function heuristicSync(lines: LyricLine[], durationSec: number): SyncResult {
  const vocal = lines.filter((l) => !l.instrumental);
  const weights = vocal.map((l) => Math.max(1, countSyllables(l.text.replace(/\s+/g, "")) || l.text.length / 4));
  const lead = Math.min(2.4, durationSec * 0.06);
  const tail = Math.min(2.8, durationSec * 0.08);
  const usable = Math.max(1, durationSec - lead - tail);
  const total = weights.reduce((s, w) => s + w, 0) || 1;
  let cursor = lead;
  const captions: Caption[] = vocal.map((line, order) => {
    const span = (weights[order]! / total) * usable;
    const start = cursor;
    const end = Math.max(cursor + span * 0.82, start + MIN_CAPTION_DUR);
    cursor += span;
    const words = tokenizeLine(line.text);
    const wspan = Math.max(0.08, (end - start) / Math.max(1, words.length));
    return {
      id: createId("cap"),
      index: order,
      text: line.text,
      startSec: start,
      endSec: end,
      start,
      end,
      words: words.map((t, i) => {
        const wStart = start + i * wspan;
        const wEnd = start + (i + 1) * wspan;
        return {
          id: createId("w"),
          text: t.raw,
          startSec: wStart,
          endSec: wEnd,
          start: wStart,
          end: wEnd,
          confidence: 0.4,
          source: "aligned" as const,
        };
      }),
      animation: {
        in: defaultAnim("fade"),
        out: defaultAnim("fade"),
        highlight: { style: "color", intensity: 1 },
      },
      confidence: 0.4,
      instrumental: false,
      locked: false,
      section: line.section,
    };
  });
  return { captions, flagged: captions.length, meanConfidence: 0.4, droppedAsrWords: 0 };
}

export { countSyllables };
