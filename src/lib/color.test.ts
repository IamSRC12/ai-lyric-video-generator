import { describe, expect, it } from "vitest";
import { normalizeHex, parseHexColor } from "./color";

describe("hex color parse", () => {
  it("round-trips #RGB, #RRGGBB and #RRGGBBAA", () => {
    expect(normalizeHex("#abc")).toBe("#AABBCC");
    expect(normalizeHex("abc")).toBe("#AABBCC");
    expect(normalizeHex("#AABBCC")).toBe("#AABBCC");
    const eight = parseHexColor("#AABBCC80");
    expect(eight?.hex).toBe("#AABBCC");
    expect(eight?.alpha).toBeCloseTo(128 / 255, 2);
    expect(parseHexColor("not-a-color")).toBeNull();
    expect(normalizeHex("#gg0000")).toBeNull();
  });
});
