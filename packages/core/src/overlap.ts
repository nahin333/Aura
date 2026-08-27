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
  const groups: Finding[][] = [];

  for (const finding of ordered) {
    const current = groups.at(-1);
    const currentEnd = current
      ? Math.max(...current.map((item) => item.end))
      : -1;
    if (current && finding.start < currentEnd) {
      current.push(finding);
    } else {
      groups.push([finding]);
    }
  }

  return groups.map((group) => {
    const representative = group.slice().sort(compareRank)[0];
    return {
      ...representative,
      start: Math.min(...group.map((finding) => finding.start)),
      end: Math.max(...group.map((finding) => finding.end)),
    };
  });
}
