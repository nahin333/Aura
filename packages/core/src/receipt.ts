import { BUILT_IN_DETECTOR_IDS } from "./detectors";
import { resolveFindingOverlaps } from "./overlap";
import { summarizeFindings } from "./summarize";
import {
  FINDING_CATEGORIES,
  FINDING_SEVERITIES,
  type BuildReceiptInput,
  type Finding,
  type FindingCategory,
  type FindingCounts,
  type FindingSeverity,
  type PreflightReceipt,
  type ReceiptArtifactSummary,
} from "./types";

const KNOWN_CATEGORIES = new Set<string>(FINDING_CATEGORIES);
const KNOWN_SEVERITIES = new Set<string>(FINDING_SEVERITIES);
const KNOWN_DETECTOR_IDS = new Set<string>(BUILT_IN_DETECTOR_IDS);

function nonNegativeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function canonicalTimestamp(value: string | Date | undefined): string {
  const date = value === undefined ? new Date() : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("createdAt must be a valid timestamp");
  }
  return date.toISOString();
}

function canonicalSha256(value: string | undefined, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw new RangeError(`${label} must contain exactly 64 hexadecimal characters`);
  }
  return value.toLowerCase();
}

function artifactSummary(
  characterCount: number,
  sha256: string | undefined,
): ReceiptArtifactSummary {
  return sha256 === undefined ? { characterCount } : { characterCount, sha256 };
}

/**
 * Reduces findings to a closed, aggregate-only vocabulary before serialization.
 * Positions, previews, confidence values, and matched text cannot enter a receipt.
 */
function receiptSafeFindings(findings: readonly Finding[]): Finding[] {
  return resolveFindingOverlaps(findings).map((finding) => ({
    category: (KNOWN_CATEGORIES.has(finding.category)
      ? finding.category
      : "authentication_token") as FindingCategory,
    severity: (KNOWN_SEVERITIES.has(finding.severity)
      ? finding.severity
      : "critical") as FindingSeverity,
    start: finding.start,
    end: finding.end,
    maskedPreview: "",
    detectorId: KNOWN_DETECTOR_IDS.has(finding.detectorId)
      ? finding.detectorId
      : "custom.detector",
    confidence: finding.confidence,
  }));
}

function receiptCounts(findings: readonly Finding[]): FindingCounts {
  return summarizeFindings(receiptSafeFindings(findings));
}

function countsMatch(left: FindingCounts, right: FindingCounts): boolean {
  const equalRecord = (
    first: Readonly<Record<string, number | undefined>>,
    second: Readonly<Record<string, number | undefined>>,
  ) => {
    const keys = new Set([...Object.keys(first), ...Object.keys(second)]);
    return [...keys].every((key) => (first[key] ?? 0) === (second[key] ?? 0));
  };
  return (
    left.total === right.total &&
    equalRecord(left.byCategory, right.byCategory) &&
    equalRecord(left.bySeverity, right.bySeverity) &&
    equalRecord(left.byDetector, right.byDetector)
  );
}

export function buildReceipt(input: BuildReceiptInput): PreflightReceipt {
  const redaction = receiptCounts(input.acceptedFindings);
  const remainingCounts = receiptCounts(input.verification.findings);
  const passed =
    input.verification.passed &&
    input.verification.status === "pass" &&
    remainingCounts.total === 0 &&
    input.verification.remainingFindingCount === remainingCounts.total &&
    countsMatch(input.verification.counts, remainingCounts);
  const observedFindingCount = nonNegativeInteger(
    input.observedFindingCount ?? input.verification.findings.length,
    "observedFindingCount",
  );
  if (observedFindingCount < remainingCounts.total) {
    throw new RangeError(
      "observedFindingCount cannot be smaller than remainingFindingCount",
    );
  }

  return {
    schema: "aura.preflight.receipt/v1",
    createdAt: canonicalTimestamp(input.createdAt),
    mediaType: "text/plain",
    source: artifactSummary(
      nonNegativeInteger(input.sourceCharacterCount, "sourceCharacterCount"),
      undefined,
    ),
    output: artifactSummary(
      nonNegativeInteger(input.outputCharacterCount, "outputCharacterCount"),
      canonicalSha256(input.outputSha256, "outputSha256"),
    ),
    redaction,
    verification: {
      status: passed ? "pass" : "fail",
      remainingFindingCount: remainingCounts.total,
      observedFindingCount,
      counts: remainingCounts,
    },
    properties: [
      "raw-sensitive-values-excluded",
      "sanitized-text-re-scanned",
    ],
  };
}
