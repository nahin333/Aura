import { detectText } from "./detect";
import { summarizeFindings } from "./summarize";
import type { DetectTextOptions, VerificationReport } from "./types";

/** Re-scans the supplied sanitized text instead of trusting pre-redaction state. */
export function verifyText(
  sanitizedText: string,
  options: DetectTextOptions = {},
): VerificationReport {
  const findings = detectText(sanitizedText, options);
  const passed = findings.length === 0;
  return {
    status: passed ? "pass" : "fail",
    passed,
    remainingFindingCount: findings.length,
    counts: summarizeFindings(findings),
    findings,
  };
}
