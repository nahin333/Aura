import { PROTECTED_TERM_DETECTOR_ID } from "./literal";
import type { Finding, FindingSeverity } from "./types";

const SEVERITY_PRIORITY: Readonly<Record<FindingSeverity, number>> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

function isValidFinding(finding: Finding): boolean {
  return (
    Number.isInteger(finding.start) &&
    Number.isInteger(finding.end) &&
    finding.start >= 0 &&
    finding.end > finding.start &&
    Number.isFinite(finding.confidence) &&
    finding.confidence >= 0 &&
    finding.confidence <= 1
  );
}

function compareRank(left: Finding, right: Finding): number {
  const protectedTermDifference =
    Number(right.detectorId === PROTECTED_TERM_DETECTOR_ID) -
    Number(left.detectorId === PROTECTED_TERM_DETECTOR_ID);
  if (protectedTermDifference !== 0) {
    return protectedTermDifference;
  }
  const severityDifference =
    SEVERITY_PRIORITY[right.severity] - SEVERITY_PRIORITY[left.severity];
  if (severityDifference !== 0) {
    return severityDifference;
  }
  const confidenceDifference = right.confidence - left.confidence;
  if (confidenceDifference !== 0) {
    return confidenceDifference;
  }
  const lengthDifference = right.end - right.start - (left.end - left.start);
  if (lengthDifference !== 0) {
    return lengthDifference;
  }
  if (left.start !== right.start) {
    return left.start - right.start;
  }
  return left.detectorId.localeCompare(right.detectorId);
}

/**
 * Collapses every connected overlap region to one display finding while
 * retaining the union of all covered offsets. Ranking chooses the label and
 * severity; destructive redaction therefore never loses a wider overlapping
 * span.
 */
export function resolveFindingOverlaps(findings: readonly Finding[]): Finding[] {
  const ordered = findings
    .filter(isValidFinding)
    .slice()
    .sort(
      (left, right) =>
        left.start - right.start ||
        left.end - right.end ||
        left.detectorId.localeCompare(right.detectorId),
    );
  const groups: Array<{
    start: number;
    end: number;
    representative: Finding;
  }> = [];

  for (const finding of ordered) {
    const current = groups.at(-1);
    if (current && finding.start < current.end) {
      current.start = Math.min(current.start, finding.start);
      current.end = Math.max(current.end, finding.end);
      if (compareRank(finding, current.representative) < 0) {
        current.representative = finding;
      }
    } else {
      groups.push({
        start: finding.start,
        end: finding.end,
        representative: finding,
      });
    }
  }

  return groups.map((group) => {
    return {
      ...group.representative,
      start: group.start,
      end: group.end,
    };
  });
}
