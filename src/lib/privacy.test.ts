import { describe, expect, it } from "vitest";

import { PROTECTED_TERM_DETECTOR_ID } from "../../packages/core/src";
import { canonicalFindingValue, maskValue } from "./privacy";

describe("privacy-safe finding helpers", () => {
  it("canonicalizes only case-insensitive protected terms", () => {
    expect(canonicalFindingValue("CAFÉ", PROTECTED_TERM_DETECTOR_ID)).toBe(
      "café",
    );
    expect(canonicalFindingValue("Alice@Example.test", "pii.email")).toBe(
      "Alice@Example.test",
    );
    expect(canonicalFindingValue("οσ", PROTECTED_TERM_DETECTOR_ID)).toBe(
      canonicalFindingValue("ΟΣ", PROTECTED_TERM_DETECTOR_ID),
    );
    expect(canonicalFindingValue("οσ", PROTECTED_TERM_DETECTOR_ID)).toBe(
      canonicalFindingValue("ος", PROTECTED_TERM_DETECTOR_ID),
    );
    expect(canonicalFindingValue("ß", PROTECTED_TERM_DETECTOR_ID)).not.toBe(
      canonicalFindingValue("ss", PROTECTED_TERM_DETECTOR_ID),
    );
    expect(canonicalFindingValue("i", PROTECTED_TERM_DETECTOR_ID)).not.toBe(
      canonicalFindingValue("ı", PROTECTED_TERM_DETECTOR_ID),
    );
    expect(canonicalFindingValue("é", PROTECTED_TERM_DETECTOR_ID)).not.toBe(
      canonicalFindingValue("e\u0301", PROTECTED_TERM_DETECTOR_ID),
    );
  });

  it("never exposes a custom protected term in its preview", () => {
    expect(maskValue("Project-Cinder-8842", "custom")).toBe("••••••••");
  });
});
