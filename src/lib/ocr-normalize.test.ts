import { describe, expect, it } from "vitest";
import {
  normalizeOcrText,
  sourceRangeForNormalizedRange,
} from "./ocr-normalize";

describe("OCR text normalization", () => {
  it("joins OCR whitespace around machine punctuation", () => {
    const normalized = normalizeOcrText(
      "alice @ example. com reset ? token = demo",
    );
    expect(normalized.text).toBe("alice@example.com reset?token=demo");
  });

  it("keeps ordinary word boundaries", () => {
    expect(normalizeOcrText("hello   private world").text).toBe(
      "hello private world",
    );
  });

  it("maps a normalized match back over removed source whitespace", () => {
    const source = "alice@example. com";
    const normalized = normalizeOcrText(source);
    expect(
      sourceRangeForNormalizedRange(
        normalized,
        0,
        normalized.text.length,
      ),
    ).toEqual({ start: 0, end: source.length });
  });
});
