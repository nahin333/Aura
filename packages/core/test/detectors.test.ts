import { describe, expect, it } from "vitest";

import { detectText, passesLuhn } from "../src";

describe("built-in text detectors", () => {
  it("detects the Phase-0 privacy and secret categories", () => {
    const githubToken = `ghp_${"a".repeat(36)}`;
    const openAiToken = `sk-proj-${"b".repeat(32)}`;
    const slackToken = ["xoxb", "123456789012", "abcdefghijklmnop"].join("-");
    const jwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnopqrstuvwxyzABCDE";
    const text = [
      "Email alice@example.com",
      "Phone +1 (415) 555-2671",
      "Host 192.168.10.42",
      "Reset https://example.test/reset?code=super-secret-value&mode=1",
      `JWT ${jwt}`,
      "AWS AKIAIOSFODNN7EXAMPLE",
      `GitHub ${githubToken}`,
      `OpenAI ${openAiToken}`,
      `Slack ${slackToken}`,
      "Card 4111 1111 1111 1111",
    ].join("\n");

    const findings = detectText(text);
    const detectorIds = new Set(findings.map((finding) => finding.detectorId));
    const categories = new Set(findings.map((finding) => finding.category));

    expect(categories).toEqual(
      new Set([
        "email_address",
        "phone_number",
        "ip_address",
        "sensitive_url_parameter",
        "authentication_token",
        "payment_card",
      ]),
    );
    expect(detectorIds.size).toBeGreaterThanOrEqual(9);
    expect(detectorIds).toContain("secret.jwt");
    expect(detectorIds).toContain("secret.aws-access-key-id");
    expect(detectorIds).toContain("secret.github-token");
    expect(detectorIds).toContain("secret.openai-token");
    expect(detectorIds).toContain("secret.common-token");

    for (const finding of findings) {
      const rawValue = text.slice(finding.start, finding.end);
      expect(rawValue.length).toBeGreaterThan(0);
      expect(finding.maskedPreview).not.toContain(rawValue);
      expect(finding.maskedPreview).not.toMatch(/[A-Za-z0-9@._+-]{8,}/);
      expect(finding.confidence).toBeGreaterThanOrEqual(0);
      expect(finding.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("validates payment-card-like numbers with Luhn", () => {
    expect(passesLuhn("4111 1111 1111 1111")).toBe(true);
    expect(passesLuhn("4111 1111 1111 1112")).toBe(false);

    const findings = detectText(
      "valid=4111-1111-1111-1111 invalid=4111-1111-1111-1112",
    );
    expect(findings.filter((finding) => finding.category === "payment_card")).toHaveLength(
      1,
    );
  });

  it("rejects invalid IPv4 octets", () => {
    const findings = detectText("valid 10.20.30.40 invalid 999.20.30.40");
    expect(findings.filter((finding) => finding.category === "ip_address")).toHaveLength(1);
  });
});
