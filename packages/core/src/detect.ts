import { BUILT_IN_TEXT_DETECTORS } from "./detectors";
import { MAX_TEXT_FINDINGS, tooManyTextFindingsError } from "./limits";
import { resolveFindingOverlaps } from "./overlap";
import type { DetectTextOptions, Finding } from "./types";

export function detectText(text: string, options: DetectTextOptions = {}): Finding[] {
  const detectors = options.detectors ?? BUILT_IN_TEXT_DETECTORS;
  const findings: Finding[] = [];
  for (const detector of detectors) {
    const detected = detector.detect(text);
    if (detected.length > MAX_TEXT_FINDINGS - findings.length) {
      throw tooManyTextFindingsError();
    }
    findings.push(...detected);
  }

  if (options.resolveOverlaps === false) {
    return findings.slice().sort(
      (left, right) =>
        left.start - right.start ||
        left.end - right.end ||
        left.detectorId.localeCompare(right.detectorId),
    );
  }

  return resolveFindingOverlaps(findings);
}
