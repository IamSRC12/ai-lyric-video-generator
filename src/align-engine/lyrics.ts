import type { ParsedLyrics } from "@/schema";

const SECTION_RE = /^\[(.+)\]\s*$/;
const HEADER_RE = /^##\s*(title|artist)\s*:\s*(.+)$/i;
const LRC_RE = /^\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]\s*(.*)$/;

export function parseLyrics(source: string): ParsedLyrics {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const parsed: ParsedLyrics = { lines: [] };
  let section: string | undefined;
  let index = 0;
  for (const raw of lines) {
    const header = raw.match(HEADER_RE);
    if (header) {
      const key = header[1]!.toLowerCase();
      const value = header[2]!.trim();
      if (key === "title") parsed.title = value;
      if (key === "artist") parsed.artist = value;
      continue;
    }
    const sec = raw.match(SECTION_RE);
    if (sec) {
      section = sec[1]!.trim();
      continue;
    }
    const lrc = raw.match(LRC_RE);
    const text = lrc ? lrc[4] ?? "" : raw;
    if (text.trim() === "") {
      if (parsed.lines.length > 0) {
        parsed.lines.push({
          index,
          text: "",
          section,
          instrumental: true,
        });
        index += 1;
      }
      continue;
    }
    parsed.lines.push({
      index,
      text: text.trim(),
      section,
      instrumental: false,
    });
    index += 1;
  }
  while (parsed.lines.length && parsed.lines[parsed.lines.length - 1]?.instrumental) {
    parsed.lines.pop();
  }
  parsed.lines = parsed.lines.map((line, i) => ({ ...line, index: i }));
  return parsed;
}

export function lyricsPromptWindow(lines: string[], startIndex: number, tokenBudget = 220): string {
  const parts: string[] = [];
  let used = 0;
  for (let i = startIndex; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const tokens = line.split(/\s+/).filter(Boolean).length;
    if (used + tokens > tokenBudget) break;
    parts.push(line);
    used += tokens;
  }
  return parts.join(" ");
}
