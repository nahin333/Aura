import { describe, expect, it } from "vitest";
// @ts-expect-error -- Node's Web Crypto is installed only for this Vitest file.
import { webcrypto } from "node:crypto";

import {
  buildReceipt,
  createProtectedTermDetector,
  detectText,
  MAX_PROTECTED_TERMS,
  MAX_TEXT_FINDINGS,
  PROTECTED_TERM_DETECTOR_ID,
  redactText,
  verifyText,
} from "../src";

Object.defineProperty(globalThis, "crypto", {
  configurable: true,
  value: webcrypto,
});

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

describe("protected-term detector", () => {
  it("matches escaped literals case-insensitively with exact UTF-16 offsets", () => {
    const text = "Prefix A+B.(C)? then CAFÉ and 😀TAG suffix";
    const detector = createProtectedTermDetector([
      "a+b.(c)?",
      "café",
      "😀tag",
    ]);
    const findings = detector.detect(text);

    expect(findings.map((finding) => text.slice(finding.start, finding.end))).toEqual([
      "A+B.(C)?",
      "CAFÉ",
      "😀TAG",
    ]);
    expect(findings.map((finding) => finding.start)).toEqual([7, 21, 30]);
    for (const finding of findings) {
      expect(finding).toMatchObject({
        category: "custom_sensitive",
        severity: "high",
        detectorId: PROTECTED_TERM_DETECTOR_ID,
        maskedPreview: "••••••••",
        confidence: 1,
      });
      expect(finding.maskedPreview).not.toContain(
        text.slice(finding.start, finding.end),
      );
    }
  });

  it("trims entries and deduplicates equivalent casing", () => {
    const detector = createProtectedTermDetector([
      "  Secret.Name  ",
      "secret.name",
      "SECRET.NAME",
    ]);

    expect(detector.detect("SECRET.NAME and secret.name")).toHaveLength(2);
    expect(JSON.stringify(detector)).toBe(
      JSON.stringify({ id: PROTECTED_TERM_DETECTOR_ID }),
    );
  });

  it("deduplicates Unicode simple-case variants consistently", () => {
    const detector = createProtectedTermDetector(["οσ", "ΟΣ", "ος"]);

    expect(detector.detect("οσ ΟΣ ος")).toHaveLength(3);
  });

  it("resolves overlapping protected literals without losing the wider span", () => {
    const text = "Customer Acme-123 requested help";
    const detector = createProtectedTermDetector(["Acme", "Acme-123"]);
    const unresolved = detectText(text, {
      detectors: [detector],
      resolveOverlaps: false,
    });
    const resolved = detectText(text, { detectors: [detector] });

    expect(unresolved).toHaveLength(2);
    expect(resolved).toHaveLength(1);
    expect(text.slice(resolved[0].start, resolved[0].end)).toBe("Acme-123");
  });

  it("enforces count and Unicode character limits without echoing input", () => {
    expect(() => createProtectedTermDetector(["a"])).toThrow(
      "must contain 2–80 characters",
    );
    expect(() => createProtectedTermDetector(["😀x"])).not.toThrow();
    expect(() => createProtectedTermDetector(["😀".repeat(80)])).not.toThrow();
    expect(() => createProtectedTermDetector(["😀".repeat(81)])).toThrow(
      "must contain 2–80 characters",
    );
    expect(() =>
      createProtectedTermDetector(
        Array.from({ length: MAX_PROTECTED_TERMS + 1 }, (_, index) =>
          `term-${index}`,
        ),
      ),
    ).toThrow(`limited to ${MAX_PROTECTED_TERMS} entries`);

    const raw = "do-not-repeat-this-private-term";
    let message = "";
    try {
      createProtectedTermDetector([raw.repeat(4)]);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).not.toContain(raw);
  });

  it("fails closed before repeated protected terms can overwhelm review", () => {
    const detector = createProtectedTermDetector(["aa"]);

    expect(() =>
      detector.detect("a".repeat((MAX_TEXT_FINDINGS + 1) * 2)),
    ).toThrow(`more than ${MAX_TEXT_FINDINGS.toLocaleString("en-US")}`);
  });

  it("uses one detector snapshot for destructive redaction and verification", () => {
    const raw = "Aurora-Delta";
    const detector = createProtectedTermDetector([raw]);
    const detectors = Object.freeze([detector]);
    const source = `Project ${raw}; repeated AURORA-DELTA.`;
    const findings = detectText(source, { detectors });
    const redaction = redactText(source, {
      findings,
      replacementForFinding: ({ category, detectorId }) => {
        expect(category).toBe("custom_sensitive");
        expect(detectorId).toBe(PROTECTED_TERM_DETECTOR_ID);
        return "[PROTECTED]";
      },
    });
    const verification = verifyText(redaction.sanitizedText, { detectors });

    expect(redaction.redactedCount).toBe(2);
    expect(redaction.sanitizedText).toBe(
      "Project [PROTECTED]; repeated [PROTECTED].",
    );
    expect(verification.passed).toBe(true);
    expect(verifyText(source, { detectors }).passed).toBe(false);
  });

  it("keeps protected terms and their hashes out of aggregate receipts", async () => {
    const raw = "Aurora-Delta";
    const detector = createProtectedTermDetector([raw]);
    const detectors = [detector];
    const source = `Customer project: ${raw}`;
    const findings = detectText(source, { detectors });
    const redaction = redactText(source, { findings });
    const verification = verifyText(redaction.sanitizedText, { detectors });
    const receipt = buildReceipt({
      sourceCharacterCount: source.length,
      outputCharacterCount: redaction.sanitizedText.length,
      acceptedFindings: redaction.acceptedFindings,
      verification,
      createdAt: "2026-08-28T12:00:00.000Z",
    });
    const serialized = JSON.stringify(receipt);

    expect(receipt.redaction.byCategory.custom_sensitive).toBe(1);
    expect(receipt.redaction.byDetector[PROTECTED_TERM_DETECTOR_ID]).toBe(1);
    expect(serialized).not.toContain(raw);
    expect(serialized).not.toContain(raw.toLowerCase());
    expect(serialized).not.toContain(await sha256(raw));
    expect(serialized).not.toContain("maskedPreview");
    expect(serialized).not.toContain("valueHash");
  });
});
