import { describe, expect, it } from "vitest";
import { appendWithCap } from "../adapters/utils.js";

function hasLoneSurrogate(value: string) {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
    if (code >= 0xd800 && code <= 0xdbff) {
      const nextCode = value.charCodeAt(i + 1);
      if (nextCode < 0xdc00 || nextCode > 0xdfff) {
        return true;
      }
      i += 1;
    }
  }
  return false;
}

describe("appendWithCap", () => {
  it("truncates by byte length", () => {
    const value = appendWithCap("a", "b".repeat(200), 10);
    expect(Buffer.byteLength(value, "utf8")).toBe(10);
  });

  it("preserves UTF-16 integrity when truncating", () => {
    const value = appendWithCap("a", "😀😀", 3);
    expect(hasLoneSurrogate(value)).toBe(false);
  });
});

