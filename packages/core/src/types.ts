export const FINDING_CATEGORIES = [
  "email_address",
  "phone_number",
  "ip_address",
  "sensitive_url_parameter",
  "authentication_token",
  "payment_card",
] as const;

export type FindingCategory = (typeof FINDING_CATEGORIES)[number];

export const FINDING_SEVERITIES = ["low", "medium", "high", "critical"] as const;

export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

/**
 * A privacy-safe description of a detected span.
 *
 * Offsets use JavaScript's UTF-16 string indexing, so they can be passed directly
 * to String.prototype.slice. The matched value is deliberately not retained.
 */
export interface Finding {
  readonly category: FindingCategory;
  readonly severity: FindingSeverity;
  readonly start: number;
  readonly end: number;
  readonly maskedPreview: string;
  readonly detectorId: string;
  readonly confidence: number;
}

export interface TextDetector {
  readonly id: string;
  detect(text: string): readonly Finding[];
}

export interface DetectTextOptions {
  readonly detectors?: readonly TextDetector[];
  readonly resolveOverlaps?: boolean;
}

export interface FindingCounts {
  readonly total: number;
  readonly byCategory: Readonly<Partial<Record<FindingCategory, number>>>;
  readonly bySeverity: Readonly<Partial<Record<FindingSeverity, number>>>;
  readonly byDetector: Readonly<Record<string, number>>;
}

export interface RedactTextOptions {
  /** Omit to detect and redact every accepted finding. */
  readonly findings?: readonly Finding[];
  /** A fixed, non-sensitive marker. Defaults to `[REDACTED]`. */
  readonly replacement?: string;
}

export interface RedactionResult {
  readonly sanitizedText: string;
  readonly acceptedFindings: readonly Finding[];
  readonly redactedCount: number;
}

export type VerificationStatus = "pass" | "fail";

export interface VerificationReport {
  readonly status: VerificationStatus;
  readonly passed: boolean;
  readonly remainingFindingCount: number;
  readonly counts: FindingCounts;
  readonly findings: readonly Finding[];
}

export interface BuildReceiptInput {
  readonly sourceCharacterCount: number;
  readonly outputCharacterCount: number;
  readonly acceptedFindings: readonly Finding[];
  readonly verification: VerificationReport;
  /** All supported findings observed after export, including intentionally retained ones. */
  readonly observedFindingCount?: number;
  /** Optional canonical timestamp input. Defaults to the current time. */
  readonly createdAt?: string | Date;
  /** Optional lowercase or uppercase SHA-256 digest of the generated output. */
  readonly outputSha256?: string;
}

export interface ReceiptArtifactSummary {
  readonly characterCount: number;
  readonly sha256?: string;
}

export interface PreflightReceipt {
  readonly schema: "aura.preflight.receipt/v1";
  readonly createdAt: string;
  readonly mediaType: "text/plain";
  readonly source: ReceiptArtifactSummary;
  readonly output: ReceiptArtifactSummary;
  readonly redaction: FindingCounts;
  readonly verification: {
    readonly status: VerificationStatus;
    /** Blocking findings detected after export (approved residue or unknown). */
    readonly remainingFindingCount: number;
    /** All supported findings observed after export, including explicit retention. */
    readonly observedFindingCount: number;
    readonly counts: FindingCounts;
  };
  readonly properties: readonly [
    "raw-sensitive-values-excluded",
    "sanitized-text-re-scanned",
  ];
}
