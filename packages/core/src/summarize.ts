import type {
  Finding,
  FindingCategory,
  FindingCounts,
  FindingSeverity,
} from "./types";

function increment(target: Record<string, number>, key: string): void {
  target[key] = (target[key] ?? 0) + 1;
}

function sortedRecord(values: Record<string, number>): Readonly<Record<string, number>> {
  const sorted: Record<string, number> = {};
  for (const key of Object.keys(values).sort()) {
    sorted[key] = values[key];
  }
  return sorted;
}

export function summarizeFindings(findings: readonly Finding[]): FindingCounts {
  const byCategory: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  const byDetector: Record<string, number> = {};

  for (const finding of findings) {
    increment(byCategory, finding.category);
    increment(bySeverity, finding.severity);
    increment(byDetector, finding.detectorId);
  }

  return {
    total: findings.length,
    byCategory: sortedRecord(byCategory) as Partial<Record<FindingCategory, number>>,
    bySeverity: sortedRecord(bySeverity) as Partial<Record<FindingSeverity, number>>,
    byDetector: sortedRecord(byDetector),
  };
}
