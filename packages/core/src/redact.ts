import { detectText } from "./detect";
import { resolveFindingOverlaps } from "./overlap";
import type { RedactionResult, RedactTextOptions } from "./types";

export const DEFAULT_REDACTION_MARKER = "[REDACTED]";

/**
 * Destructively replaces accepted spans. The result contains no copy of a
 * replaced value, and the original input is never included in the result.
 */
export function redactText(
  text: string,
  options: RedactTextOptions = {},
): RedactionResult {
  const replacement = options.replacement ?? DEFAULT_REDACTION_MARKER;
  const candidates = options.findings ?? detectText(text);
  const acceptedFindings = resolveFindingOverlaps(candidates).filter(
    (finding) => finding.end <= text.length,
  );

  let sanitizedText = "";
  let cursor = 0;
  for (const finding of acceptedFindings) {
    sanitizedText += text.slice(cursor, finding.start);
    const findingReplacement = options.replacementForFinding?.({
      category: finding.category,
      severity: finding.severity,
      detectorId: finding.detectorId,
    });
    if (
      findingReplacement !== undefined &&
      typeof findingReplacement !== "string"
    ) {
      throw new TypeError("replacementForFinding must return a string");
    }
    sanitizedText += findingReplacement ?? replacement;
    cursor = finding.end;
  }
  sanitizedText += text.slice(cursor);

  return {
    sanitizedText,
    acceptedFindings,
    redactedCount: acceptedFindings.length,
  };
}
