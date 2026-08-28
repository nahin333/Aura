/**
 * Bounds review work and receipt aggregation. Above this limit Aura fails
 * closed instead of hashing or rendering an unusable number of findings.
 */
export const MAX_TEXT_FINDINGS = 1_000;

export function tooManyTextFindingsError(): RangeError {
  return new RangeError(
    `The check found more than ${MAX_TEXT_FINDINGS.toLocaleString("en-US")} supported matches. Split the input into smaller sections or use fewer repeated protected phrases.`,
  );
}
