import { normalizedLevenshtein, type NormToken } from "./normalize";

export type AlignOp = "match" | "lyric-gap" | "asr-gap";

export interface AlignCell {
  op: AlignOp;
  lyricIndex: number;
  asrIndex: number;
  score: number;
}

export interface AlignResult {
  path: AlignCell[];
  score: number;
}

const MATCH_WEIGHT_LEV = 0.65;
const MATCH_WEIGHT_PHONE = 0.35;
const GAP_OPEN_ASR = -0.15; // cheap gap for ASR ad-libs/hallucinations/instrumental noise
const GAP_EXT_ASR = -0.02;
const GAP_OPEN_LYRIC = -0.40; // lyric skipping
const GAP_EXT_LYRIC = -0.08;

export function substitutionScore(a: NormToken, b: NormToken): number {
  if (a.norm === b.norm) {
    return 2.0 + (a.norm.length >= 4 ? 0.4 : 0);
  }
  const lev = normalizedLevenshtein(a.norm, b.norm);
  const phone =
    a.metaphone && a.metaphone === b.metaphone
      ? 1
      : a.metaphone && b.metaphone && a.metaphone[0] === b.metaphone[0]
      ? 0.4
      : 0;

  let prefixBonus = 0;
  if (
    a.norm.length >= 3 &&
    b.norm.length >= 3 &&
    (a.norm.startsWith(b.norm.slice(0, 3)) || b.norm.startsWith(a.norm.slice(0, 3)))
  ) {
    prefixBonus = 0.15;
  }

  const rawSim = MATCH_WEIGHT_LEV * lev + MATCH_WEIGHT_PHONE * phone + prefixBonus;

  if (rawSim >= 0.65) {
    return 1.0 + (rawSim - 0.65) * 2.0;
  } else if (rawSim >= 0.35) {
    return 0.15 + (rawSim - 0.35) * 1.5;
  } else {
    // Mismatch penalty: Ensures NW prefers opening gaps over matching distinct words
    return -0.8 - (0.35 - rawSim) * 1.5;
  }
}

interface AnchorPair {
  lyricIndex: number;
  asrIndex: number;
}

/**
 * Needleman–Wunsch with affine gaps (Gotoh).
 * Fully unconstrained dynamic programming search space to prevent drift lockout
 * when songs have instrumental intros, interludes, or repeat sections.
 * Supports anchor pair landmarks with additive rewards.
 */
export function needlemanWunsch(
  lyric: NormToken[],
  asr: NormToken[],
  anchors: AnchorPair[] = [],
): AlignResult {
  const n = lyric.length;
  const m = asr.length;
  if (n === 0 && m === 0) return { path: [], score: 0 };
  if (n === 0) {
    return {
      path: asr.map((_, j) => ({ op: "asr-gap", lyricIndex: 0, asrIndex: j, score: 0 })),
      score: GAP_OPEN_ASR + (m - 1) * GAP_EXT_ASR,
    };
  }
  if (m === 0) {
    return {
      path: lyric.map((_, i) => ({ op: "lyric-gap", lyricIndex: i, asrIndex: 0, score: 0 })),
      score: GAP_OPEN_LYRIC + (n - 1) * GAP_EXT_LYRIC,
    };
  }

  const NEG = -1e9;
  const M = Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(NEG));
  const X = Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(NEG));
  const Y = Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(NEG));
  const ptr = Array.from({ length: n + 1 }, () => new Int8Array(m + 1));

  M[0]![0] = 0;
  X[0]![0] = GAP_OPEN_LYRIC;
  Y[0]![0] = GAP_OPEN_ASR;
  for (let i = 1; i <= n; i += 1) {
    X[i]![0] = GAP_OPEN_LYRIC + (i - 1) * GAP_EXT_LYRIC;
    M[i]![0] = X[i]![0]!;
    ptr[i]![0] = 2;
  }
  for (let j = 1; j <= m; j += 1) {
    Y[0]![j] = GAP_OPEN_ASR + (j - 1) * GAP_EXT_ASR;
    M[0]![j] = Y[0]![j]!;
    ptr[0]![j] = 3;
  }

  const forced = new Map<number, number>();
  for (const a of anchors) {
    if (a.lyricIndex >= 0 && a.lyricIndex < n && a.asrIndex >= 0 && a.asrIndex < m) {
      forced.set(a.lyricIndex, a.asrIndex);
    }
  }

  for (let i = 1; i <= n; i += 1) {
    const lTok = lyric[i - 1]!;
    for (let j = 1; j <= m; j += 1) {
      const aTok = asr[j - 1]!;
      const sub = substitutionScore(lTok, aTok);
      const anchorReward = forced.get(i - 1) === j - 1 ? 4.0 : 0;
      const diag = Math.max(M[i - 1]![j - 1]!, X[i - 1]![j - 1]!, Y[i - 1]![j - 1]!) + sub + anchorReward;
      const delOpen = Math.max(M[i - 1]![j]!, Y[i - 1]![j]!) + GAP_OPEN_LYRIC;
      const delExt = X[i - 1]![j]! + GAP_EXT_LYRIC;
      const del = Math.max(delOpen, delExt);
      const insOpen = Math.max(M[i]![j - 1]!, X[i]![j - 1]!) + GAP_OPEN_ASR;
      const insExt = Y[i]![j - 1]! + GAP_EXT_ASR;
      const ins = Math.max(insOpen, insExt);

      M[i]![j] = diag;
      X[i]![j] = del;
      Y[i]![j] = ins;
      const best = Math.max(diag, del, ins);
      ptr[i]![j] = best === diag ? 1 : best === del ? 2 : 3;
    }
  }

  const path: AlignCell[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const dir = ptr[i]?.[j] ?? (i > 0 ? 2 : 3);
    if (dir === 1 && i > 0 && j > 0) {
      path.push({
        op: "match",
        lyricIndex: i - 1,
        asrIndex: j - 1,
        score: substitutionScore(lyric[i - 1]!, asr[j - 1]!),
      });
      i -= 1;
      j -= 1;
    } else if (dir === 2 && i > 0) {
      path.push({ op: "lyric-gap", lyricIndex: i - 1, asrIndex: Math.max(0, j - 1), score: 0 });
      i -= 1;
    } else if (j > 0) {
      path.push({ op: "asr-gap", lyricIndex: Math.max(0, i - 1), asrIndex: j - 1, score: 0 });
      j -= 1;
    } else {
      break;
    }
  }
  path.reverse();
  const score = Math.max(M[n]![m]!, X[n]![m]!, Y[n]![m]!);
  return { path, score };
}
