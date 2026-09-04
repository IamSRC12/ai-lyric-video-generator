export interface NormToken {
  raw: string;
  norm: string;
  metaphone: string;
  syllables: number;
}

const ONES = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

const SYMBOLS: Record<string, string> = {
  "&": "and",
  "+": "plus",
  "%": "percent",
  "@": "at",
  "#": "number",
  "$": "dollar",
};

const CONTRACTIONS: Record<string, string> = {
  dont: "do not",
  cant: "cannot",
  wont: "will not",
  im: "i am",
  ive: "i have",
  id: "i would",
  ill: "i will",
  youre: "you are",
  youve: "you have",
  youll: "you will",
  theyre: "they are",
  theyve: "they have",
  weve: "we have",
  thats: "that is",
  theres: "there is",
  heres: "here is",
  whats: "what is",
  whos: "who is",
  lets: "let us",
  aint: "is not",
  yall: "you all",
  gonna: "going to",
  wanna: "want to",
  gotta: "got to",
  kinda: "kind of",
  sorta: "sort of",
  outta: "out of",
  innit: "is it not",
};

export function expandNumber(n: number): string {
  if (n < 0) return `minus ${expandNumber(-n)}`;
  if (n < 20) return ONES[n] ?? String(n);
  if (n < 100) {
    const ten = TENS[Math.floor(n / 10)] ?? "";
    const one = n % 10;
    return one ? `${ten} ${ONES[one]}` : ten;
  }
  if (n < 1000) {
    const hun = `${ONES[Math.floor(n / 100)]} hundred`;
    const rest = n % 100;
    return rest ? `${hun} ${expandNumber(rest)}` : hun;
  }
  if (n < 1_000_000) {
    const thou = `${expandNumber(Math.floor(n / 1000))} thousand`;
    const rest = n % 1000;
    return rest ? `${thou} ${expandNumber(rest)}` : thou;
  }
  return String(n);
}

export function collapseRepeats(word: string): string {
  return word.replace(/(.)\1{2,}/g, "$1$1");
}

export function stripPunctuation(word: string): string {
  return word.replace(/[^\p{L}\p{N}'’-]/gu, "");
}

export function normalizeWord(raw: string): string {
  let s = raw.normalize("NFKC").toLowerCase().trim();
  if (SYMBOLS[s]) s = SYMBOLS[s]!;
  if (/^\d+$/.test(s)) s = expandNumber(Number(s));
  s = s.replace(/(\d+)/g, (m) => expandNumber(Number(m)));
  s = stripPunctuation(s);
  s = collapseRepeats(s);
  s = s.replace(/’/g, "'");
  const compact = s.replace(/'/g, "");
  if (CONTRACTIONS[compact]) s = CONTRACTIONS[compact]!;
  return s.trim();
}

export function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 1;
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups?.length ?? 1);
}

/**
 * Compact Double Metaphone. Covers English pop-lyric vocabulary well enough
 * for substitution scoring; not a drop-in of the full 1990 algorithm.
 */
export function doubleMetaphone(input: string): string {
  const word = input.toUpperCase().replace(/[^A-Z]/g, "");
  if (!word) return "";
  let i = 0;
  let primary = "";
  const len = word.length;
  const char = (k: number) => word[k] ?? "";
  const at = (k: number, set: string) => set.includes(char(k));

  if (word.startsWith("KN") || word.startsWith("GN") || word.startsWith("PN") || word.startsWith("AE") || word.startsWith("WR")) {
    i = 1;
  }
  if (char(0) === "X") {
    primary += "S";
    i = 1;
  }
  while (i < len && primary.length < 6) {
    const c = char(i);
    switch (c) {
      case "A":
      case "E":
      case "I":
      case "O":
      case "U":
      case "Y":
        if (i === 0) primary += "A";
        i += 1;
        break;
      case "B":
        primary += "P";
        i += char(i + 1) === "B" ? 2 : 1;
        break;
      case "C":
        if (char(i + 1) === "H") {
          primary += "X";
          i += 2;
        } else if (at(i + 1, "EIY")) {
          primary += "S";
          i += 2;
        } else {
          primary += "K";
          i += 1;
        }
        break;
      case "D":
        if (char(i + 1) === "G" && at(i + 2, "EIY")) {
          primary += "J";
          i += 3;
        } else {
          primary += "T";
          i += char(i + 1) === "D" ? 2 : 1;
        }
        break;
      case "F":
        primary += "F";
        i += char(i + 1) === "F" ? 2 : 1;
        break;
      case "G":
        if (char(i + 1) === "H") {
          primary += i > 0 && !at(i - 1, "AEIOU") ? "" : "K";
          i += 2;
        } else if (at(i + 1, "EIY")) {
          primary += "J";
          i += 2;
        } else {
          primary += "K";
          i += char(i + 1) === "G" ? 2 : 1;
        }
        break;
      case "H":
        if (i === 0 || at(i - 1, "AEIOU")) {
          if (at(i + 1, "AEIOU")) primary += "H";
        }
        i += 1;
        break;
      case "J":
        primary += "J";
        i += char(i + 1) === "J" ? 2 : 1;
        break;
      case "K":
        primary += "K";
        i += char(i + 1) === "K" ? 2 : 1;
        break;
      case "L":
        primary += "L";
        i += char(i + 1) === "L" ? 2 : 1;
        break;
      case "M":
        primary += "M";
        i += char(i + 1) === "M" ? 2 : 1;
        break;
      case "N":
        primary += "N";
        i += char(i + 1) === "N" ? 2 : 1;
        break;
      case "P":
        if (char(i + 1) === "H") {
          primary += "F";
          i += 2;
        } else {
          primary += "P";
          i += char(i + 1) === "P" ? 2 : 1;
        }
        break;
      case "Q":
        primary += "K";
        i += 1;
        break;
      case "R":
        primary += "R";
        i += char(i + 1) === "R" ? 2 : 1;
        break;
      case "S":
        if (char(i + 1) === "H") {
          primary += "X";
          i += 2;
        } else if (char(i + 1) === "I" && at(i + 2, "OA")) {
          primary += "X";
          i += 3;
        } else {
          primary += "S";
          i += char(i + 1) === "S" ? 2 : 1;
        }
        break;
      case "T":
        if (char(i + 1) === "H") {
          primary += "0";
          i += 2;
        } else if (char(i + 1) === "I" && at(i + 2, "OA")) {
          primary += "X";
          i += 3;
        } else {
          primary += "T";
          i += char(i + 1) === "T" ? 2 : 1;
        }
        break;
      case "V":
        primary += "F";
        i += char(i + 1) === "V" ? 2 : 1;
        break;
      case "W":
        if (at(i + 1, "AEIOU")) primary += "A";
        i += 1;
        break;
      case "X":
        primary += "KS";
        i += 1;
        break;
      case "Z":
        primary += "S";
        i += char(i + 1) === "Z" ? 2 : 1;
        break;
      default:
        i += 1;
    }
  }
  return primary;
}

export function tokenizeLine(text: string): NormToken[] {
  const parts = text
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const tokens: NormToken[] = [];
  for (const raw of parts) {
    const expanded = normalizeWord(raw).split(/\s+/).filter(Boolean);
    for (const norm of expanded) {
      tokens.push({
        raw,
        norm,
        metaphone: doubleMetaphone(norm),
        syllables: countSyllables(norm),
      });
    }
  }
  return tokens;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min((curr[j - 1] ?? 0) + 1, (prev[j] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j] ?? 0;
  }
  return prev[b.length] ?? 0;
}

export function normalizedLevenshtein(a: string, b: string): number {
  const max = Math.max(a.length, b.length, 1);
  return 1 - levenshtein(a, b) / max;
}
