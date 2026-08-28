import { describe, expect, it } from "vitest";

import {
  BUILT_IN_TEXT_DETECTORS,
  createProtectedTermDetector,
  detectText,
  redactText,
  verifyText,
} from "../../packages/core/src";
import {
  chooseOpaqueReplacement,
  collisionSafeTypedAlias,
} from "./replacements";

describe("collision-safe output markers", () => {
  it("avoids protected terms that overlap Aura's usual marker words", () => {
    const detectors = [
      ...BUILT_IN_TEXT_DETECTORS,
      createProtectedTermDetector(["redacted", "protected", "**"]),
    ];
    const opaque = chooseOpaqueReplacement(detectors);

    expect(opaque).toBe("█");
    expect(collisionSafeTypedAlias("[PROTECTED_1]", detectors, opaque)).toBe(
      opaque,
    );
    expect(collisionSafeTypedAlias("[EMAIL_1]", detectors, opaque)).toBe(
      "[EMAIL_1]",
    );
  });

  it("re-scans a collision-prone protected term with the same detector snapshot", () => {
    const detectors = [
      ...BUILT_IN_TEXT_DETECTORS,
      createProtectedTermDetector(["redacted", "**"]),
    ];
    const source = "Please remove redacted from this note.";
    const findings = detectText(source, { detectors });
    const output = redactText(source, {
      findings,
      replacement: chooseOpaqueReplacement(detectors),
    });

    expect(output.sanitizedText).toBe("Please remove █ from this note.");
    expect(verifyText(output.sanitizedText, { detectors }).passed).toBe(true);
  });
});
