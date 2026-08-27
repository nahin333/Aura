export interface NormalizedOcrText {
  text: string;
  /** Maps each normalized UTF-16 code-unit index back to the source index. */
  sourceIndex: number[];
}
const JOINING_PUNCTUATION = new Set([
  "@",
  ".",
  "_",
  "-",
  ":",
  "/",
  "?",
  "=",
  "&",
]);

function nextNonWhitespace(source: string, start: number): string | undefined {
  for (let index = start; index < source.length; index += 1) {
    if (!/\s/.test(source[index])) return source[index];
  }
  return undefined;
}

/**
 * Repairs a narrow class of OCR spacing artifacts around machine punctuation
 * while preserving a map back to the original line for redaction geometry.
 */
export function normalizeOcrText(source: string): NormalizedOcrText {
  let text = "";
  const sourceIndex: number[] = [];

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (/\s/.test(character)) {
      const previous = text.at(-1);
      const next = nextNonWhitespace(source, index + 1);
      if (
        (previous && JOINING_PUNCTUATION.has(previous)) ||
        (next && JOINING_PUNCTUATION.has(next))
      ) {
        continue;
      }
      if (text.endsWith(" ")) continue;
      text += " ";
      sourceIndex.push(index);
      continue;
    }
    text += character;
    sourceIndex.push(index);
  }

  return { text, sourceIndex };
}

export function sourceRangeForNormalizedRange(
  normalized: NormalizedOcrText,
  start: number,
  end: number,
): { start: number; end: number } {
  if (end <= start || normalized.sourceIndex.length === 0) {
    return { start, end };
  }
  return {
    start: normalized.sourceIndex[start] ?? start,
    end: (normalized.sourceIndex[end - 1] ?? end - 1) + 1,
  };
}
