import { MAX_TEXT_FINDINGS, tooManyTextFindingsError } from "./limits";
import type { Finding, TextDetector } from "./types";

export const PROTECTED_TERM_DETECTOR_ID = "custom.protected-term";
export const MAX_PROTECTED_TERMS = 20;
export const MIN_PROTECTED_TERM_CHARACTERS = 2;
export const MAX_PROTECTED_TERM_CHARACTERS = 80;

const PROTECTED_TERM_PREVIEW = "••••••••";

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function unicodeCharacterCount(value: string): number {
  return Array.from(value).length;
}

/**
 * Produces a stable identity for Unicode case-insensitive literal matches.
 * Folding one code point at a time mirrors simple case folding and deliberately
 * avoids expansions such as sharp-s to "ss".
 */
export function canonicalProtectedTermValue(value: string): string {
  return Array.from(value, (character) => {
    const pattern = new RegExp(
      `^(?:${escapeRegularExpression(character)})$`,
      "iu",
    );
    const uppercaseThenLowercase = character.toUpperCase().toLowerCase();
    if (pattern.test(uppercaseThenLowercase)) {
      return uppercaseThenLowercase;
    }
    const lowercase = character.toLowerCase();
    return pattern.test(lowercase) ? lowercase : character;
  }).join("");
}

function sameLiteralIgnoringCase(left: string, right: string): boolean {
  return (
    canonicalProtectedTermValue(left) === canonicalProtectedTermValue(right) &&
    new RegExp(`^(?:${escapeRegularExpression(left)})$`, "iu").test(right)
  );
}

function canonicalTerms(terms: readonly string[]): string[] {
  if (terms.length > MAX_PROTECTED_TERMS) {
    throw new RangeError(
      `Protected terms are limited to ${MAX_PROTECTED_TERMS} entries.`,
    );
  }

  const accepted: string[] = [];
  for (const [index, candidate] of terms.entries()) {
    if (typeof candidate !== "string") {
      throw new TypeError(`Protected term ${index + 1} must be a string.`);
    }
    const term = candidate.trim();
    const length = unicodeCharacterCount(term);
    if (
      length < MIN_PROTECTED_TERM_CHARACTERS ||
      length > MAX_PROTECTED_TERM_CHARACTERS
    ) {
      throw new RangeError(
        `Protected term ${index + 1} must contain ${MIN_PROTECTED_TERM_CHARACTERS}–${MAX_PROTECTED_TERM_CHARACTERS} characters.`,
      );
    }
    if (
      !accepted.some((existing) => sameLiteralIgnoringCase(existing, term))
    ) {
      accepted.push(term);
    }
  }
  return accepted;
}

/**
 * Builds a session-scoped, case-insensitive exact-literal detector.
 *
 * The returned object exposes only its stable detector identifier and detection
 * function. Protected terms are escaped into regular-expression sources held by
 * the function closure; findings never retain a term or a term-derived preview.
 */
export function createProtectedTermDetector(
  terms: readonly string[],
): TextDetector {
  const patternSources = Object.freeze(
    canonicalTerms(terms).map(escapeRegularExpression),
  );

  return Object.freeze({
    id: PROTECTED_TERM_DETECTOR_ID,
    detect(text: string): readonly Finding[] {
      const findings: Finding[] = [];
      for (const source of patternSources) {
        const pattern = new RegExp(source, "giu");
        for (const match of text.matchAll(pattern)) {
          if (match.index === undefined || match[0].length === 0) continue;
          if (findings.length >= MAX_TEXT_FINDINGS) {
            throw tooManyTextFindingsError();
          }
          findings.push({
            category: "custom_sensitive",
            severity: "high",
            start: match.index,
            end: match.index + match[0].length,
            maskedPreview: PROTECTED_TERM_PREVIEW,
            detectorId: PROTECTED_TERM_DETECTOR_ID,
            confidence: 1,
          });
        }
      }
      return findings.sort(
        (left, right) => left.start - right.start || left.end - right.end,
      );
    },
  });
}
