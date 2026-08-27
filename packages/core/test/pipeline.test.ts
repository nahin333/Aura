import { describe, expect, it } from "vitest";

import {
  buildReceipt,
  detectText,
  redactText,
  resolveFindingOverlaps,
  verifyText,
} from "../src";

describe("text privacy pipeline", () => {
  it("prefers a specific detector when findings overlap", () => {
    const token = `sk-proj-${"z".repeat(32)}`;
    const text = `api_key=${token}`;
    const unresolved = detectText(text, { resolveOverlaps: false });
    const tokenFindings = unresolved.filter(
      (finding) => text.slice(finding.start, finding.end) === token,
    );

    expect(tokenFindings.length).toBeGreaterThanOrEqual(2);
    const resolved = resolveFindingOverlaps(tokenFindings);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].detectorId).toBe("secret.openai-token");
  });

  it("redacts the union when a higher-severity overlap is narrower", () => {
    const source = "prefix-wide-sensitive-value-suffix";
    const broad = {
      category: "email_address" as const,
      severity: "high" as const,
      start: 7,
      end: 27,
      maskedPreview: "broad",
      detectorId: "pii.email",
      confidence: 0.9,
    };
    const narrow = {
      ...broad,
      category: "authentication_token" as const,
      severity: "critical" as const,
      start: 12,
      end: 20,
      detectorId: "secret.generic-assignment",
    };
    const redaction = redactText(source, { findings: [broad, narrow] });

    expect(redaction.acceptedFindings).toHaveLength(1);
    expect(redaction.acceptedFindings[0]).toMatchObject({
      detectorId: "secret.generic-assignment",
      start: 7,
      end: 27,
    });
    expect(redaction.sanitizedText).toBe("prefix-[REDACTED]-suffix");
  });

  it("destructively redacts all accepted spans and verifies the new text", () => {
    const rawEmail = "alice@example.com";
    const rawCard = "4111 1111 1111 1111";
    const rawUrlSecret = "one-time-reset-secret";
    const source =
      `Contact ${rawEmail}; card ${rawCard}; ` +
      `link https://example.test/reset?token=${rawUrlSecret}`;

    const redaction = redactText(source);

    expect(redaction.redactedCount).toBe(3);
    expect(redaction.sanitizedText).not.toContain(rawEmail);
    expect(redaction.sanitizedText).not.toContain(rawCard);
    expect(redaction.sanitizedText).not.toContain(rawUrlSecret);
    expect(redaction.sanitizedText).toContain("[REDACTED]");

    const verification = verifyText(redaction.sanitizedText);
    expect(verification.status).toBe("pass");
    expect(verification.passed).toBe(true);
    expect(verification.remainingFindingCount).toBe(0);
    expect(verification.counts.total).toBe(0);
  });

  it("fails verification when a non-selected finding remains", () => {
    const source = "email alice@example.com card 4111 1111 1111 1111";
    const findings = detectText(source);
    const emailOnly = findings.filter((finding) => finding.category === "email_address");
    const redaction = redactText(source, { findings: emailOnly });
    const verification = verifyText(redaction.sanitizedText);

    expect(verification.status).toBe("fail");
    expect(verification.remainingFindingCount).toBe(1);
    expect(verification.counts.byCategory.payment_card).toBe(1);
  });

  it("builds an aggregate receipt without raw values or masked previews", () => {
    const secret = `ghp_${"c".repeat(36)}`;
    const email = "reporter@example.com";
    const source = `email=${email} token=${secret}`;
    const redaction = redactText(source);
    const verification = verifyText(redaction.sanitizedText);
    const receipt = buildReceipt({
      sourceCharacterCount: source.length,
      outputCharacterCount: redaction.sanitizedText.length,
      outputSha256: "b".repeat(64),
      acceptedFindings: redaction.acceptedFindings,
      verification,
      createdAt: "2026-08-26T12:00:00.000Z",
    });
    const serialized = JSON.stringify(receipt);

    expect(receipt.verification.status).toBe("pass");
    expect(receipt.verification.observedFindingCount).toBe(0);
    expect(receipt.redaction.total).toBe(2);
    expect(receipt.source).toEqual({ characterCount: source.length });
    expect(receipt.output.sha256).toBe("b".repeat(64));
    expect(serialized).not.toContain(email);
    expect(serialized).not.toContain(secret);
    const forbiddenKeys = new Set([
      "start",
      "end",
      "maskedPreview",
      "preview",
      "valueHash",
      "box",
      "evidence",
    ]);
    const visit = (value: unknown): void => {
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        expect(forbiddenKeys.has(key)).toBe(false);
        visit(child);
      }
    };
    visit(receipt);
  });

  it("records intentionally retained findings separately from selected residue", () => {
    const source = "email alice@example.com card 4111 1111 1111 1111";
    const findings = detectText(source);
    const emailOnly = findings.filter(
      (finding) => finding.category === "email_address",
    );
    const redaction = redactText(source, { findings: emailOnly });
    const observed = verifyText(redaction.sanitizedText);
    const selectedVerification = {
      ...observed,
      status: "pass" as const,
      passed: true,
      remainingFindingCount: 0,
      counts: {
        total: 0,
        byCategory: {},
        bySeverity: {},
        byDetector: {},
      },
      findings: [],
    };
    const receipt = buildReceipt({
      sourceCharacterCount: source.length,
      outputCharacterCount: redaction.sanitizedText.length,
      acceptedFindings: redaction.acceptedFindings,
      verification: selectedVerification,
      observedFindingCount: observed.remainingFindingCount,
    });

    expect(receipt.verification.status).toBe("pass");
    expect(receipt.verification.remainingFindingCount).toBe(0);
    expect(receipt.verification.observedFindingCount).toBe(1);
  });

  it("fails closed when a verification object is inconsistent", () => {
    const verification = verifyText("safe text");
    const receipt = buildReceipt({
      sourceCharacterCount: 9,
      outputCharacterCount: 9,
      acceptedFindings: [],
      verification: { ...verification, passed: false },
    });

    expect(receipt.verification.status).toBe("fail");
  });

  it("fails closed when supplied verification counts contradict findings", () => {
    const verification = verifyText("safe text");
    const receipt = buildReceipt({
      sourceCharacterCount: 9,
      outputCharacterCount: 9,
      acceptedFindings: [],
      verification: {
        ...verification,
        remainingFindingCount: 1,
        counts: { ...verification.counts, total: 1 },
      },
    });

    expect(receipt.verification.status).toBe("fail");
  });
});
