import { BUILT_IN_TEXT_DETECTORS } from "./detectors";
import { resolveFindingOverlaps } from "./overlap";
import type { DetectTextOptions, Finding } from "./types";

export function detectText(text: string, options: DetectTextOptions = {}): Finding[] {
  const detectors = options.detectors ?? BUILT_IN_TEXT_DETECTORS;
  const findings = detectors.flatMap((detector) => detector.detect(text));

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
