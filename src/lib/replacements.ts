import {
  verifyText,
  type TextDetector,
} from "../../packages/core/src";

const OPAQUE_MARKER_CANDIDATES = [
  "[REDACTED]",
  "<redacted>",
  "(redacted)",
  "***",
  "█",
] as const;

export function isReplacementMarkerSafe(
  marker: string,
  detectors: readonly TextDetector[],
): boolean {
  return verifyText(marker, { detectors }).passed;
}

/**
 * Picks a marker that the exact detector snapshot will not flag. The final
 * candidate is one Unicode character, while protected terms require at least
 * two, so the function stays fail-closed even when a user protects words such
 * as "redacted".
 */
export function chooseOpaqueReplacement(
  detectors: readonly TextDetector[],
): string {
  return (
    OPAQUE_MARKER_CANDIDATES.find((marker) =>
      isReplacementMarkerSafe(marker, detectors),
    ) ?? "█"
  );
}

export function collisionSafeTypedAlias(
  alias: string,
  detectors: readonly TextDetector[],
  opaqueFallback = chooseOpaqueReplacement(detectors),
): string {
  return isReplacementMarkerSafe(alias, detectors) ? alias : opaqueFallback;
}
