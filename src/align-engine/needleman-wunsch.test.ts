import { describe, expect, it } from "vitest";
import { needlemanWunsch } from "./needleman-wunsch";
import { tokenizeLine } from "./normalize";

function toks(s: string) {
  return tokenizeLine(s);
}

describe("Needleman–Wunsch", () => {
  it("aligns a perfect ASR transcript", () => {
    const lyric = toks("city lights fold over the river");
    const asr = toks("city lights fold over the river");
    const res = needlemanWunsch(lyric, asr);
    const matches = res.path.filter((p) => p.op === "match");
    expect(matches.length).toBe(lyric.length);
    matches.forEach((m, i) => {
      expect(m.lyricIndex).toBe(i);
      expect(m.asrIndex).toBe(i);
    });
  });

  it("inserts lyric-gaps when ASR drops words", () => {
    const lyric = toks("if the night is a map");
    const asr = toks("if night is map");
    const res = needlemanWunsch(lyric, asr);
    const gaps = res.path.filter((p) => p.op === "lyric-gap");
    expect(gaps.length).toBeGreaterThanOrEqual(1);
    const matches = res.path.filter((p) => p.op === "match");
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  it("cheaply skips a hallucinated extra ASR line", () => {
    const lyric = toks("we only glow when we almost arrive");
    const asr = toks("we only glow yeah when we almost arrive");
    const res = needlemanWunsch(lyric, asr);
    const asrGaps = res.path.filter((p) => p.op === "asr-gap");
    expect(asrGaps.length).toBeGreaterThanOrEqual(1);
    const matches = res.path.filter((p) => p.op === "match");
    expect(matches.length).toBe(lyric.length);
  });

  it("handles large intro offset without dropping subsequent verses", () => {
    const lyric = toks("first line in the chorus and second line here");
    const asr = toks("intro instrumental talk yeah oh baby first line in the chorus and second line here");
    const res = needlemanWunsch(lyric, asr);
    const matches = res.path.filter((p) => p.op === "match");
    expect(matches.length).toBe(lyric.length);
  });

  it("phonetically aligns homophones and slurred words", () => {
    const lyric = toks("through the dark night we find courage");
    const asr = toks("thru the dark nite we find curage");
    const res = needlemanWunsch(lyric, asr);
    const matches = res.path.filter((p) => p.op === "match");
    expect(matches.length).toBe(lyric.length);
  });
});
