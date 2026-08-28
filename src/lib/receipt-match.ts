export const RECEIPT_MATCH_LIMITS = Object.freeze({
  // Aura accepts images up to 40 MP, whose newly encoded PNG can exceed the
  // original 25 MiB upload limit. This cap still bounds in-memory hashing.
  imageArtifactBytes: 192 * 1024 * 1024,
  // Aura text output is bounded to 250k UTF-16 code units. This leaves ample
  // encoding headroom without materializing a 192 MiB string on mobile.
  textArtifactBytes: 8 * 1024 * 1024,
  receiptBytes: 256 * 1024,
});

export const RECEIPT_MATCH_DISCLAIMER =
  "Aura receipts are unsigned and editable. A match only links these bytes to the values recorded in the receipt; it does not prove that the artifact is safe.";

export type SupportedReceiptSchema =
  | "aura.preflight.receipt/v1"
  | "aura.preflight.image-receipt/v1";

export type ReceiptMatchStatus = "match" | "mismatch" | "invalid";

export interface ReceiptMatchCheck {
  readonly id: "sha256" | "character-count" | "byte-length" | "media-type" | "png-dimensions";
  readonly label: string;
  readonly matched: boolean;
  readonly detail: string;
}

export interface ReceiptMatchArtifactSummary {
  readonly byteLength: number;
  readonly characterCount?: number;
  readonly mediaType?: string;
  readonly width?: number;
  readonly height?: number;
}

export interface ReceiptMatchResult {
  readonly status: ReceiptMatchStatus;
  readonly message: string;
  readonly disclaimer: typeof RECEIPT_MATCH_DISCLAIMER;
  readonly schema?: SupportedReceiptSchema;
  readonly artifactKind?: "text" | "image";
  readonly receiptVerificationStatus?: "pass" | "fail" | "demo";
  readonly artifact?: ReceiptMatchArtifactSummary;
  readonly checks: readonly ReceiptMatchCheck[];
}

type SafeRecord = Record<string, unknown>;

interface ParsedTextReceipt {
  readonly schema: "aura.preflight.receipt/v1";
  readonly outputSha256: string;
  readonly outputCharacterCount: number;
  readonly verificationStatus: "pass" | "fail";
}

interface ParsedImageReceipt {
  readonly schema: "aura.preflight.image-receipt/v1";
  readonly mediaType: "image/png";
  readonly outputSha256: string;
  readonly outputByteLength: number;
  readonly outputWidth: number;
  readonly outputHeight: number;
  readonly verificationStatus: "pass" | "fail" | "demo";
}

type ParsedReceipt = ParsedTextReceipt | ParsedImageReceipt;

const FORBIDDEN_JSON_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const JSON_MEDIA_TYPES = new Set(["application/json", "text/json"]);
const MAX_ARRAY_ITEMS = 2_048;
const MAX_STRING_LENGTH = 16_384;
const IMAGE_CHECK_IDS = [
  "output.decode",
  "pixels.flattened",
  "metadata.absent",
  "png.chunks",
  "ocr.rescan",
  "barcode.rescan",
] as const;
type ImageCheckId = (typeof IMAGE_CHECK_IDS)[number];
type ImageCheckStatus = "passed" | "failed" | "not-run";

class ControlledValidationError extends Error {}

function invalid(message: string, schema?: SupportedReceiptSchema): ReceiptMatchResult {
  return {
    status: "invalid",
    message,
    disclaimer: RECEIPT_MATCH_DISCLAIMER,
    ...(schema === undefined ? {} : { schema }),
    checks: [],
  };
}

function normalizeMediaType(value: string): string {
  return value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function hasOwn(record: SafeRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function required(record: SafeRecord, key: string, label: string): unknown {
  if (!hasOwn(record, key)) {
    throw new ControlledValidationError(`${label} is required.`);
  }
  return record[key];
}

function asRecord(value: unknown, label: string): SafeRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ControlledValidationError(`${label} must be an object.`);
  }
  if (Object.getPrototypeOf(value) !== null) {
    throw new ControlledValidationError(`${label} is not a safe JSON object.`);
  }
  return value as SafeRecord;
}

function requiredRecord(record: SafeRecord, key: string, label: string): SafeRecord {
  return asRecord(required(record, key, label), label);
}

function asString(value: unknown, label: string, allowEmpty = false): string {
  if (
    typeof value !== "string" ||
    value.length > MAX_STRING_LENGTH ||
    (!allowEmpty && value.length === 0)
  ) {
    throw new ControlledValidationError(`${label} must be a valid string.`);
  }
  return value;
}

function requiredString(
  record: SafeRecord,
  key: string,
  label: string,
  allowEmpty = false,
): string {
  return asString(required(record, key, label), label, allowEmpty);
}

function asNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new ControlledValidationError(`${label} must be a non-negative safe integer.`);
  }
  return value;
}

function asPositiveInteger(value: unknown, label: string): number {
  const result = asNonNegativeInteger(value, label);
  if (result === 0) {
    throw new ControlledValidationError(`${label} must be a positive safe integer.`);
  }
  return result;
}

function requiredNonNegativeInteger(record: SafeRecord, key: string, label: string): number {
  return asNonNegativeInteger(required(record, key, label), label);
}

function requiredArray(record: SafeRecord, key: string, label: string): readonly unknown[] {
  const value = required(record, key, label);
  if (!Array.isArray(value) || value.length > MAX_ARRAY_ITEMS) {
    throw new ControlledValidationError(`${label} must be a supported array.`);
  }
  return value;
}

function validateStringArray(record: SafeRecord, key: string, label: string): readonly string[] {
  return requiredArray(record, key, label).map((value, index) =>
    asString(value, `${label}[${index}]`, true),
  );
}

function validateTimestamp(record: SafeRecord): void {
  const timestamp = requiredString(record, "createdAt", "createdAt");
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== timestamp) {
    throw new ControlledValidationError("createdAt must be a canonical ISO-8601 timestamp.");
  }
}

function validateSha256(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/i.test(value)) {
    throw new ControlledValidationError(`${label} must be a 64-character SHA-256 digest.`);
  }
  return value.toLowerCase();
}

function validateNumberRecord(value: unknown, label: string): SafeRecord {
  const record = asRecord(value, label);
  for (const [index, [key, count]] of Object.entries(record).entries()) {
    if (key.length === 0 || key.length > 256) {
      throw new ControlledValidationError(`${label} contains an invalid key.`);
    }
    asNonNegativeInteger(count, `${label} entry ${index + 1}`);
  }
  return record;
}

function countRecordValues(record: SafeRecord): number {
  return Object.values(record).reduce<number>((total, value) => total + (value as number), 0);
}

function validateFindingCounts(value: unknown, label: string): void {
  const counts = asRecord(value, label);
  const total = requiredNonNegativeInteger(counts, "total", `${label}.total`);
  const byCategory = validateNumberRecord(
    required(counts, "byCategory", `${label}.byCategory`),
    `${label}.byCategory`,
  );
  const bySeverity = validateNumberRecord(
    required(counts, "bySeverity", `${label}.bySeverity`),
    `${label}.bySeverity`,
  );
  const byDetector = validateNumberRecord(
    required(counts, "byDetector", `${label}.byDetector`),
    `${label}.byDetector`,
  );
  if (
    countRecordValues(byCategory) !== total ||
    countRecordValues(bySeverity) !== total ||
    countRecordValues(byDetector) !== total
  ) {
    throw new ControlledValidationError(`${label} totals are inconsistent.`);
  }
}

function validateTextArtifactSummary(
  value: unknown,
  label: string,
  requireSha256: boolean,
): { characterCount: number; sha256?: string } {
  const summary = asRecord(value, label);
  const characterCount = requiredNonNegativeInteger(
    summary,
    "characterCount",
    `${label}.characterCount`,
  );
  if (requireSha256) {
    return {
      characterCount,
      sha256: validateSha256(required(summary, "sha256", `${label}.sha256`), `${label}.sha256`),
    };
  }
  if (hasOwn(summary, "sha256")) {
    validateSha256(summary.sha256, `${label}.sha256`);
  }
  return { characterCount };
}

function validateTextReceipt(root: SafeRecord): ParsedTextReceipt {
  validateTimestamp(root);
  if (requiredString(root, "mediaType", "mediaType") !== "text/plain") {
    throw new ControlledValidationError("Text receipt mediaType must be text/plain.");
  }
  validateTextArtifactSummary(required(root, "source", "source"), "source", false);
  const output = validateTextArtifactSummary(required(root, "output", "output"), "output", true);
  validateFindingCounts(required(root, "redaction", "redaction"), "redaction");

  const verification = requiredRecord(root, "verification", "verification");
  const verificationStatus = requiredString(
    verification,
    "status",
    "verification.status",
  );
  if (verificationStatus !== "pass" && verificationStatus !== "fail") {
    throw new ControlledValidationError("verification.status is invalid for a text receipt.");
  }
  const remaining = requiredNonNegativeInteger(
    verification,
    "remainingFindingCount",
    "verification.remainingFindingCount",
  );
  const observed = requiredNonNegativeInteger(
    verification,
    "observedFindingCount",
    "verification.observedFindingCount",
  );
  validateFindingCounts(
    required(verification, "counts", "verification.counts"),
    "verification.counts",
  );
  const verificationCounts = asRecord(verification.counts, "verification.counts");
  if (remaining !== verificationCounts.total || observed < remaining) {
    throw new ControlledValidationError("Text receipt verification counts are inconsistent.");
  }
  if (verificationStatus === "pass" && remaining !== 0) {
    throw new ControlledValidationError(
      "A passing text receipt cannot record remaining findings.",
    );
  }

  const properties = validateStringArray(root, "properties", "properties");
  if (
    properties.length !== 2 ||
    properties[0] !== "raw-sensitive-values-excluded" ||
    properties[1] !== "sanitized-text-re-scanned"
  ) {
    throw new ControlledValidationError("Text receipt properties are invalid.");
  }

  return {
    schema: "aura.preflight.receipt/v1",
    outputSha256: output.sha256 as string,
    outputCharacterCount: output.characterCount,
    verificationStatus,
  };
}

function isImageCheckId(value: string): value is ImageCheckId {
  return (IMAGE_CHECK_IDS as readonly string[]).includes(value);
}

function validateImageChecks(
  verification: SafeRecord,
  mode: "uploaded-artifact" | "synthetic-demo",
): {
  verificationStatus: "pass" | "fail" | "demo";
  decodeStatus: ImageCheckStatus;
} {
  const status = requiredString(verification, "status", "verification.status");
  if (status !== "pass" && status !== "fail" && status !== "demo") {
    throw new ControlledValidationError("verification.status is invalid for an image receipt.");
  }
  const checks = requiredArray(verification, "checks", "verification.checks");
  if (checks.length !== IMAGE_CHECK_IDS.length) {
    throw new ControlledValidationError(
      `verification.checks must contain exactly ${IMAGE_CHECK_IDS.length} canonical checks.`,
    );
  }
  const statuses = new Map<ImageCheckId, ImageCheckStatus>();
  for (const [index, value] of checks.entries()) {
    const check = asRecord(value, `verification.checks[${index}]`);
    const id = requiredString(check, "id", `verification.checks[${index}].id`);
    if (!isImageCheckId(id) || statuses.has(id)) {
      throw new ControlledValidationError(
        `verification.checks[${index}].id is not a unique canonical check identifier.`,
      );
    }
    requiredString(check, "label", `verification.checks[${index}].label`);
    const checkStatus = requiredString(
      check,
      "status",
      `verification.checks[${index}].status`,
    );
    if (checkStatus !== "passed" && checkStatus !== "failed" && checkStatus !== "not-run") {
      throw new ControlledValidationError(`verification.checks[${index}].status is invalid.`);
    }
    statuses.set(id, checkStatus);
    requiredString(check, "detail", `verification.checks[${index}].detail`, true);
  }

  const allStatuses = IMAGE_CHECK_IDS.map((id) => statuses.get(id) as ImageCheckStatus);
  let expectedStatus: "pass" | "fail" | "demo";
  if (mode === "uploaded-artifact") {
    if (allStatuses.includes("not-run")) {
      throw new ControlledValidationError(
        "Uploaded image receipts cannot contain checks that were not run.",
      );
    }
    expectedStatus = allStatuses.every((checkStatus) => checkStatus === "passed")
      ? "pass"
      : "fail";
  } else {
    const deterministicStatuses = IMAGE_CHECK_IDS.slice(0, 4).map(
      (id) => statuses.get(id) as ImageCheckStatus,
    );
    if (
      deterministicStatuses.includes("not-run") ||
      statuses.get("ocr.rescan") !== "not-run" ||
      statuses.get("barcode.rescan") !== "not-run"
    ) {
      throw new ControlledValidationError(
        "Synthetic demo receipts must record only OCR and barcode checks as not run.",
      );
    }
    expectedStatus = deterministicStatuses.every(
      (checkStatus) => checkStatus === "passed",
    )
      ? "demo"
      : "fail";
  }
  if (status !== expectedStatus) {
    throw new ControlledValidationError(
      "Image receipt mode, verification status, and check outcomes are inconsistent.",
    );
  }
  return {
    verificationStatus: status,
    decodeStatus: statuses.get("output.decode") as ImageCheckStatus,
  };
}

function validateImageReceipt(root: SafeRecord): ParsedImageReceipt {
  validateTimestamp(root);
  if (requiredString(root, "mediaType", "mediaType") !== "image/png") {
    throw new ControlledValidationError("Image receipt mediaType must be image/png.");
  }
  const mode = requiredString(root, "mode", "mode");
  if (mode !== "uploaded-artifact" && mode !== "synthetic-demo") {
    throw new ControlledValidationError("Image receipt mode is invalid.");
  }

  const source = requiredRecord(root, "source", "source");
  asPositiveInteger(required(source, "byteLength", "source.byteLength"), "source.byteLength");
  requiredString(source, "mimeType", "source.mimeType", true);

  const output = requiredRecord(root, "output", "output");
  const outputSha256 = validateSha256(
    required(output, "sha256", "output.sha256"),
    "output.sha256",
  );
  const outputByteLength = asPositiveInteger(
    required(output, "byteLength", "output.byteLength"),
    "output.byteLength",
  );
  const outputWidth = requiredNonNegativeInteger(output, "width", "output.width");
  const outputHeight = requiredNonNegativeInteger(output, "height", "output.height");

  const redaction = requiredRecord(root, "redaction", "redaction");
  const selectedCount = requiredNonNegativeInteger(
    redaction,
    "selectedCount",
    "redaction.selectedCount",
  );
  const byCategory = validateNumberRecord(
    required(redaction, "byCategory", "redaction.byCategory"),
    "redaction.byCategory",
  );
  const manualRegionCount = requiredNonNegativeInteger(
    redaction,
    "manualRegionCount",
    "redaction.manualRegionCount",
  );
  if (
    countRecordValues(byCategory) !== selectedCount ||
    (byCategory.manual ?? 0) !== manualRegionCount
  ) {
    throw new ControlledValidationError("Image receipt redaction counts are inconsistent.");
  }

  const verification = validateImageChecks(
    requiredRecord(root, "verification", "verification"),
    mode,
  );
  const hasDimensions = outputWidth > 0 && outputHeight > 0;
  if (
    (outputWidth === 0) !== (outputHeight === 0) ||
    (verification.decodeStatus === "passed") !== hasDimensions
  ) {
    throw new ControlledValidationError(
      "Image receipt dimensions contradict the output decode check.",
    );
  }

  const engines = requiredRecord(root, "engines", "engines");
  for (const key of ["deterministicRules", "ocr", "barcode", "metadata"] as const) {
    requiredString(engines, key, `engines.${key}`);
  }
  validateStringArray(root, "properties", "properties");
  validateStringArray(root, "limitations", "limitations");

  return {
    schema: "aura.preflight.image-receipt/v1",
    mediaType: "image/png",
    outputSha256,
    outputByteLength,
    outputWidth,
    outputHeight,
    verificationStatus: verification.verificationStatus,
  };
}

function parseSafeJson(text: string): unknown {
  return JSON.parse(text, (key, value: unknown) => {
    if (FORBIDDEN_JSON_KEYS.has(key)) {
      throw new ControlledValidationError("Receipt JSON contains a prohibited object key.");
    }
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new ControlledValidationError("Receipt JSON contains a non-finite number.");
    }
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const safe: SafeRecord = Object.create(null) as SafeRecord;
      for (const [entryKey, entryValue] of Object.entries(value)) {
        safe[entryKey] = entryValue;
      }
      return safe;
    }
    return value;
  });
}

function parseSupportedReceipt(value: unknown): ParsedReceipt {
  const root = asRecord(value, "receipt");
  const schema = requiredString(root, "schema", "schema");
  if (schema === "aura.preflight.receipt/v1") {
    return validateTextReceipt(root);
  }
  if (schema === "aura.preflight.image-receipt/v1") {
    return validateImageReceipt(root);
  }
  throw new ControlledValidationError("Only Aura text and image receipt v1 schemas are supported.");
}

async function readExactFileBytes(file: File, label: string): Promise<ArrayBuffer> {
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength !== file.size) {
    throw new ControlledValidationError(`${label} changed while it was being read.`);
  }
  return bytes;
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new ControlledValidationError("SHA-256 is unavailable in this browser.");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function parsePngDimensions(bytes: ArrayBuffer): { width: number; height: number } {
  const view = new Uint8Array(bytes);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10] as const;
  if (view.length < 33 || !signature.every((byte, index) => view[index] === byte)) {
    throw new ControlledValidationError("The selected image artifact is not a supported PNG file.");
  }
  const data = new DataView(bytes);
  const ihdrLength = data.getUint32(8, false);
  const ihdrType = String.fromCharCode(view[12]!, view[13]!, view[14]!, view[15]!);
  if (ihdrLength !== 13 || ihdrType !== "IHDR") {
    throw new ControlledValidationError("The selected PNG does not begin with a valid IHDR chunk.");
  }
  const width = data.getUint32(16, false);
  const height = data.getUint32(20, false);
  if (width === 0 || height === 0 || width > 0x7fffffff || height > 0x7fffffff) {
    throw new ControlledValidationError("The selected PNG declares invalid dimensions.");
  }
  return { width, height };
}

function matchCheck(
  id: ReceiptMatchCheck["id"],
  label: string,
  matched: boolean,
  matchedDetail: string,
  mismatchedDetail: string,
): ReceiptMatchCheck {
  return {
    id,
    label,
    matched,
    detail: matched ? matchedDetail : mismatchedDetail,
  };
}

async function matchTextArtifact(
  artifactFile: File,
  bytes: ArrayBuffer,
  receipt: ParsedTextReceipt,
): Promise<ReceiptMatchResult> {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return invalid("The selected text artifact is not valid UTF-8.", receipt.schema);
  }
  const digest = await sha256Hex(bytes);
  const characterCount = text.length;
  const checks: readonly ReceiptMatchCheck[] = [
    matchCheck(
      "sha256",
      "SHA-256 fingerprint",
      digest === receipt.outputSha256,
      "The artifact fingerprint matches the receipt.",
      "The artifact fingerprint does not match the receipt.",
    ),
    matchCheck(
      "character-count",
      "UTF-16 character count",
      characterCount === receipt.outputCharacterCount,
      `The UTF-16 character count matches (${characterCount}).`,
      `The receipt records ${receipt.outputCharacterCount} UTF-16 characters; the artifact has ${characterCount}.`,
    ),
  ];
  const matches = checks.every((check) => check.matched);
  return {
    status: matches ? "match" : "mismatch",
    message: matches
      ? "The text artifact matches the fingerprint and character count recorded in this receipt."
      : "The text artifact does not match every value recorded in this receipt.",
    disclaimer: RECEIPT_MATCH_DISCLAIMER,
    schema: receipt.schema,
    artifactKind: "text",
    receiptVerificationStatus: receipt.verificationStatus,
    artifact: {
      byteLength: artifactFile.size,
      characterCount,
    },
    checks,
  };
}

async function matchImageArtifact(
  artifactFile: File,
  bytes: ArrayBuffer,
  receipt: ParsedImageReceipt,
): Promise<ReceiptMatchResult> {
  let dimensions: { width: number; height: number };
  try {
    dimensions = parsePngDimensions(bytes);
  } catch (error) {
    if (error instanceof ControlledValidationError) {
      return invalid(error.message, receipt.schema);
    }
    return invalid("The selected image artifact could not be inspected.", receipt.schema);
  }
  const digest = await sha256Hex(bytes);
  const declaredMediaType = normalizeMediaType(artifactFile.type);
  const artifactMediaType = "image/png";
  const checks: readonly ReceiptMatchCheck[] = [
    matchCheck(
      "sha256",
      "SHA-256 fingerprint",
      digest === receipt.outputSha256,
      "The artifact fingerprint matches the receipt.",
      "The artifact fingerprint does not match the receipt.",
    ),
    matchCheck(
      "byte-length",
      "Byte length",
      artifactFile.size === receipt.outputByteLength,
      `The byte length matches (${artifactFile.size}).`,
      `The receipt records ${receipt.outputByteLength} bytes; the artifact has ${artifactFile.size}.`,
    ),
    matchCheck(
      "media-type",
      "PNG media type",
      artifactMediaType === receipt.mediaType,
      declaredMediaType.length > 0 && declaredMediaType !== artifactMediaType
        ? `PNG signature confirms image/png; filename metadata declared ${declaredMediaType} and was treated as advisory.`
        : "The PNG signature and receipt both identify image/png.",
      "The PNG signature does not match the receipt media type.",
    ),
    matchCheck(
      "png-dimensions",
      "PNG dimensions",
      dimensions.width === receipt.outputWidth && dimensions.height === receipt.outputHeight,
      `The PNG dimensions match (${dimensions.width} × ${dimensions.height}).`,
      `The receipt records ${receipt.outputWidth} × ${receipt.outputHeight}; the PNG is ${dimensions.width} × ${dimensions.height}.`,
    ),
  ];
  const matches = checks.every((check) => check.matched);
  return {
    status: matches ? "match" : "mismatch",
    message: matches
      ? "The PNG artifact matches the fingerprint and image metrics recorded in this receipt."
      : "The PNG artifact does not match every value recorded in this receipt.",
    disclaimer: RECEIPT_MATCH_DISCLAIMER,
    schema: receipt.schema,
    artifactKind: "image",
    receiptVerificationStatus: receipt.verificationStatus,
    artifact: {
      byteLength: artifactFile.size,
      mediaType: artifactMediaType || "not declared",
      width: dimensions.width,
      height: dimensions.height,
    },
    checks,
  };
}

/**
 * Matches an artifact against an Aura diagnostic receipt entirely in memory.
 * The returned value contains only structural metrics and comparison outcomes,
 * never artifact text, image bytes, filenames, or receipt contents.
 */
export async function matchReceiptFiles(
  artifactFile: File,
  receiptFile: File,
): Promise<ReceiptMatchResult> {
  try {
    if (!Number.isSafeInteger(artifactFile.size) || artifactFile.size < 0) {
      return invalid("The selected artifact has an invalid byte length.");
    }
    if (artifactFile.size > RECEIPT_MATCH_LIMITS.imageArtifactBytes) {
      return invalid(
        `Artifacts must be ${RECEIPT_MATCH_LIMITS.imageArtifactBytes} bytes or smaller.`,
      );
    }
    if (!Number.isSafeInteger(receiptFile.size) || receiptFile.size <= 0) {
      return invalid("The receipt file is empty or has an invalid byte length.");
    }
    if (receiptFile.size > RECEIPT_MATCH_LIMITS.receiptBytes) {
      return invalid(
        `Receipts must be ${RECEIPT_MATCH_LIMITS.receiptBytes} bytes or smaller.`,
      );
    }
    const receiptMediaType = normalizeMediaType(receiptFile.type);
    if (
      receiptMediaType.length > 0 &&
      !JSON_MEDIA_TYPES.has(receiptMediaType) &&
      !receiptMediaType.endsWith("+json")
    ) {
      return invalid("The receipt file must use a JSON media type.");
    }

    const receiptBytes = await readExactFileBytes(receiptFile, "The receipt");
    let receiptText: string;
    try {
      receiptText = new TextDecoder("utf-8", { fatal: true }).decode(receiptBytes);
    } catch {
      return invalid("The receipt file is not valid UTF-8 JSON.");
    }

    let receipt: ParsedReceipt;
    try {
      receipt = parseSupportedReceipt(parseSafeJson(receiptText));
    } catch (error) {
      return invalid(
        error instanceof ControlledValidationError
          ? error.message
          : "The receipt file is not valid supported Aura JSON.",
      );
    }

    const artifactLimit = receipt.schema === "aura.preflight.receipt/v1"
      ? RECEIPT_MATCH_LIMITS.textArtifactBytes
      : RECEIPT_MATCH_LIMITS.imageArtifactBytes;
    if (artifactFile.size > artifactLimit) {
      return invalid(
        receipt.schema === "aura.preflight.receipt/v1"
          ? `Text artifacts must be ${artifactLimit} bytes or smaller.`
          : `PNG artifacts must be ${artifactLimit} bytes or smaller.`,
        receipt.schema,
      );
    }

    const artifactBytes = await readExactFileBytes(artifactFile, "The artifact");
    return receipt.schema === "aura.preflight.receipt/v1"
      ? await matchTextArtifact(artifactFile, artifactBytes, receipt)
      : await matchImageArtifact(artifactFile, artifactBytes, receipt);
  } catch (error) {
    return invalid(
      error instanceof ControlledValidationError
        ? error.message
        : "The selected files could not be read and compared locally.",
    );
  }
}
