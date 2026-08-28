import { describe, expect, it } from "vitest";
// @ts-expect-error -- Node's Web Crypto is installed only for this Vitest file.
import { webcrypto } from "node:crypto";

Object.defineProperty(globalThis, "crypto", {
  configurable: true,
  value: webcrypto,
});

import {
  matchReceiptFiles,
  RECEIPT_MATCH_DISCLAIMER,
  RECEIPT_MATCH_LIMITS,
} from "./receipt-match";

function file(parts: BlobPart[], name: string, type: string): File {
  const blob = new Blob(parts, { type });
  Object.defineProperties(blob, {
    name: { value: name, enumerable: true },
    lastModified: { value: 0, enumerable: true },
    webkitRelativePath: { value: "", enumerable: true },
  });
  return blob as File;
}

async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function zeroCounts() {
  return {
    total: 0,
    byCategory: {},
    bySeverity: {},
    byDetector: {},
  };
}

async function textReceipt(artifact: File, overrides: Record<string, unknown> = {}) {
  const text = new TextDecoder().decode(await artifact.arrayBuffer());
  return {
    schema: "aura.preflight.receipt/v1",
    createdAt: "2026-08-28T12:00:00.000Z",
    mediaType: "text/plain",
    source: { characterCount: text.length + 7 },
    output: { characterCount: text.length, sha256: await sha256(artifact) },
    redaction: zeroCounts(),
    verification: {
      status: "pass",
      remainingFindingCount: 0,
      observedFindingCount: 0,
      counts: zeroCounts(),
    },
    properties: ["raw-sensitive-values-excluded", "sanitized-text-re-scanned"],
    ...overrides,
  };
}

function uint32(value: number): number[] {
  return [value >>> 24, value >>> 16, value >>> 8, value].map((byte) => byte & 0xff);
}

function pngChunk(type: string, data: readonly number[]): number[] {
  return [
    ...uint32(data.length),
    ...Array.from(type, (character) => character.charCodeAt(0)),
    ...data,
    0,
    0,
    0,
    0,
  ];
}

function png(width: number, height: number, type = "image/png"): File {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  const ihdr = [
    ...uint32(width),
    ...uint32(height),
    8,
    6,
    0,
    0,
    0,
  ];
  const bytes = new Uint8Array([
    ...signature,
    ...pngChunk("IHDR", ihdr),
    ...pngChunk("IDAT", []),
    ...pngChunk("IEND", []),
  ]);
  return file([bytes], "checked.png", type);
}

const IMAGE_CHECK_IDS = [
  "output.decode",
  "pixels.flattened",
  "metadata.absent",
  "png.chunks",
  "ocr.rescan",
  "barcode.rescan",
] as const;

function imageChecks(
  statuses: Partial<Record<(typeof IMAGE_CHECK_IDS)[number], string>> = {},
) {
  return IMAGE_CHECK_IDS.map((id) => ({
    id,
    label: id,
    status: statuses[id] ?? "passed",
    detail: "Fixture check completed.",
  }));
}

async function imageReceipt(
  artifact: File,
  width: number,
  height: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    schema: "aura.preflight.image-receipt/v1",
    createdAt: "2026-08-28T12:00:00.000Z",
    mediaType: "image/png",
    mode: "uploaded-artifact",
    source: { byteLength: artifact.size + 25, mimeType: "image/jpeg" },
    output: {
      sha256: await sha256(artifact),
      byteLength: artifact.size,
      width,
      height,
    },
    redaction: {
      selectedCount: 1,
      byCategory: { manual: 1 },
      manualRegionCount: 1,
    },
    verification: {
      status: "pass",
      checks: imageChecks(),
    },
    engines: {
      deterministicRules: "aura-rules/0.1.0",
      ocr: "test-ocr/1",
      barcode: "test-barcode/1",
      metadata: "test-metadata/1",
    },
    properties: ["output-newly-encoded"],
    limitations: ["Unsigned and editable."],
    ...overrides,
  };
}

function jsonReceipt(value: unknown): File {
  return file([JSON.stringify(value)], "receipt.json", "application/json");
}

describe("text receipt matching", () => {
  it("matches exact UTF-8 bytes while counting JavaScript UTF-16 code units", async () => {
    const artifact = file(["Checked copy 😀\n"], "checked.txt", "text/plain");
    const receipt = await textReceipt(artifact);
    const result = await matchReceiptFiles(artifact, jsonReceipt(receipt));

    expect(result.status).toBe("match");
    expect(result.artifact).toEqual({
      byteLength: artifact.size,
      characterCount: "Checked copy 😀\n".length,
    });
    expect(result.checks.map((check) => [check.id, check.matched])).toEqual([
      ["sha256", true],
      ["character-count", true],
    ]);
    expect(result.disclaimer).toBe(RECEIPT_MATCH_DISCLAIMER);
  });

  it("accepts an uppercase receipt digest", async () => {
    const artifact = file(["safe text"], "checked.txt", "text/plain");
    const receipt = await textReceipt(artifact);
    const output = receipt.output as { sha256: string };
    output.sha256 = output.sha256.toUpperCase();

    await expect(matchReceiptFiles(artifact, jsonReceipt(receipt))).resolves.toMatchObject({
      status: "match",
    });
  });

  it("reports fingerprint and character-count mismatches independently", async () => {
    const recorded = file(["alpha"], "recorded.txt", "text/plain");
    const selected = file(["bravo!"], "selected.txt", "text/plain");
    const result = await matchReceiptFiles(selected, jsonReceipt(await textReceipt(recorded)));

    expect(result.status).toBe("mismatch");
    expect(result.checks).toMatchObject([
      { id: "sha256", matched: false },
      { id: "character-count", matched: false },
    ]);
  });

  it("treats a missing output digest as invalid and unmatchable", async () => {
    const artifact = file(["safe"], "checked.txt", "text/plain");
    const receipt = await textReceipt(artifact);
    delete (receipt.output as { sha256?: string }).sha256;

    const result = await matchReceiptFiles(artifact, jsonReceipt(receipt));
    expect(result).toMatchObject({ status: "invalid", checks: [] });
    expect(result.message).toContain("output.sha256");
  });

  it("rejects text that is not valid UTF-8 without returning its bytes", async () => {
    const artifact = file([new Uint8Array([0xc3, 0x28])], "invalid.txt", "text/plain");
    const receipt = await textReceipt(artifact, {
      output: {
        characterCount: 2,
        sha256: await sha256(artifact),
      },
    });
    const result = await matchReceiptFiles(artifact, jsonReceipt(receipt));

    expect(result).toMatchObject({ status: "invalid", checks: [] });
    expect(JSON.stringify(result)).not.toContain("Ã");
  });
});

describe("PNG receipt matching", () => {
  it("matches fingerprint, byte length, media type, and IHDR dimensions", async () => {
    const artifact = png(640, 360);
    const result = await matchReceiptFiles(
      artifact,
      jsonReceipt(await imageReceipt(artifact, 640, 360)),
    );

    expect(result).toMatchObject({
      status: "match",
      schema: "aura.preflight.image-receipt/v1",
      artifactKind: "image",
      artifact: {
        byteLength: artifact.size,
        mediaType: "image/png",
        width: 640,
        height: 360,
      },
    });
    expect(result.checks.map((check) => [check.id, check.matched])).toEqual([
      ["sha256", true],
      ["byte-length", true],
      ["media-type", true],
      ["png-dimensions", true],
    ]);
  });

  it("can match bytes even when the unsigned receipt records a failed verification", async () => {
    const artifact = png(20, 10);
    const receipt = await imageReceipt(artifact, 20, 10);
    receipt.verification.status = "fail";
    receipt.verification.checks = imageChecks({ "ocr.rescan": "failed" });
    const result = await matchReceiptFiles(artifact, jsonReceipt(receipt));

    expect(result).toMatchObject({
      status: "match",
      receiptVerificationStatus: "fail",
    });
    expect(result.disclaimer).toContain("does not prove that the artifact is safe");
  });

  it.each([
    ["byte length", { output: { byteLength: 1 } }, "byte-length"],
    ["dimensions", { output: { width: 641, height: 360 } }, "png-dimensions"],
  ])("reports a %s mismatch", async (_label, change, expectedCheck) => {
    const artifact = png(640, 360);
    const base = await imageReceipt(artifact, 640, 360);
    const outputChange = (change as { output: Record<string, unknown> }).output;
    base.output = { ...base.output, ...outputChange };
    const result = await matchReceiptFiles(artifact, jsonReceipt(base));

    expect(result.status).toBe("mismatch");
    expect(result.checks.find((check) => check.id === expectedCheck)?.matched).toBe(false);
  });

  it("derives PNG media type from bytes instead of filename metadata", async () => {
    const artifact = png(32, 32, "application/octet-stream");
    const result = await matchReceiptFiles(
      artifact,
      jsonReceipt(await imageReceipt(artifact, 32, 32)),
    );

    expect(result.status).toBe("match");
    expect(result.artifact?.mediaType).toBe("image/png");
    expect(result.checks.find((check) => check.id === "media-type")).toMatchObject({
      matched: true,
      detail: expect.stringContaining("treated as advisory"),
    });
  });

  it("rejects a non-PNG artifact before presenting comparison checks", async () => {
    const artifact = file(["not a png"], "fake.png", "image/png");
    const receipt = await imageReceipt(artifact, 1, 1);
    const result = await matchReceiptFiles(artifact, jsonReceipt(receipt));

    expect(result).toMatchObject({ status: "invalid", checks: [] });
    expect(result.message).toContain("not a supported PNG");
  });
});

describe("receipt validation and limits", () => {
  it("rejects unsupported schemas and malformed JSON", async () => {
    const artifact = file(["safe"], "checked.txt", "text/plain");
    const unsupported = jsonReceipt({ schema: "aura.preflight.receipt/v2" });
    const malformed = file(["{not-json"], "receipt.json", "application/json");

    await expect(matchReceiptFiles(artifact, unsupported)).resolves.toMatchObject({
      status: "invalid",
    });
    await expect(matchReceiptFiles(artifact, malformed)).resolves.toMatchObject({
      status: "invalid",
      message: "The receipt file is not valid supported Aura JSON.",
    });
  });

  it("neutralizes prototype-bearing JSON rather than reading inherited fields", async () => {
    const artifact = file(["safe"], "checked.txt", "text/plain");
    const receipt = file(
      [
        '{"schema":"aura.preflight.receipt/v1","__proto__":{"output":{"sha256":"secret"}}}',
      ],
      "receipt.json",
      "application/json",
    );
    const result = await matchReceiptFiles(artifact, receipt);

    expect(result).toMatchObject({ status: "invalid", checks: [] });
    expect(result.message).toContain("prohibited object key");
    expect((Object.prototype as { output?: unknown }).output).toBeUndefined();
  });

  it("rejects inconsistent aggregate counts", async () => {
    const artifact = file(["safe"], "checked.txt", "text/plain");
    const receipt = await textReceipt(artifact, {
      redaction: {
        total: 1,
        byCategory: {},
        bySeverity: {},
        byDetector: {},
      },
    });
    const result = await matchReceiptFiles(artifact, jsonReceipt(receipt));

    expect(result).toMatchObject({ status: "invalid", checks: [] });
    expect(result.message).toContain("totals are inconsistent");
  });

  it("rejects a passing text receipt that records remaining findings", async () => {
    const artifact = file(["safe"], "checked.txt", "text/plain");
    const oneFindingCounts = {
      total: 1,
      byCategory: { email_address: 1 },
      bySeverity: { high: 1 },
      byDetector: { "pii.email": 1 },
    };
    const receipt = await textReceipt(artifact, {
      verification: {
        status: "pass",
        remainingFindingCount: 1,
        observedFindingCount: 1,
        counts: oneFindingCounts,
      },
    });
    const result = await matchReceiptFiles(artifact, jsonReceipt(receipt));

    expect(result).toMatchObject({ status: "invalid", checks: [] });
    expect(result.message).toContain("passing text receipt");
  });

  it.each([
    ["demo status on an upload", "uploaded-artifact", "demo", imageChecks()],
    [
      "pass status with a failed check",
      "uploaded-artifact",
      "pass",
      imageChecks({ "metadata.absent": "failed" }),
    ],
    [
      "live check claims in a synthetic demo",
      "synthetic-demo",
      "demo",
      imageChecks(),
    ],
  ])("rejects contradictory image receipt claims: %s", async (_label, mode, status, checks) => {
    const artifact = png(40, 30);
    const receipt = await imageReceipt(artifact, 40, 30, {
      mode,
      verification: { status, checks },
    });
    const result = await matchReceiptFiles(artifact, jsonReceipt(receipt));

    expect(result).toMatchObject({ status: "invalid", checks: [] });
    expect(result.message).toMatch(/inconsistent|Synthetic demo/);
  });

  it("does not reflect receipt-owned aggregate keys in validation errors", async () => {
    const artifact = file(["safe"], "checked.txt", "text/plain");
    const privateKey = "private-project-cinder";
    const receipt = await textReceipt(artifact, {
      redaction: {
        total: 0,
        byCategory: { [privateKey]: "invalid" },
        bySeverity: {},
        byDetector: {},
      },
    });
    const result = await matchReceiptFiles(artifact, jsonReceipt(receipt));

    expect(result).toMatchObject({ status: "invalid", checks: [] });
    expect(JSON.stringify(result)).not.toContain(privateKey);
  });

  it("enforces artifact and receipt size limits before reading", async () => {
    const unreadableArtifact = {
      size: RECEIPT_MATCH_LIMITS.imageArtifactBytes + 1,
      type: "text/plain",
      arrayBuffer: () => Promise.reject(new Error("must not read")),
    } as File;
    const smallReceipt = jsonReceipt({ schema: "unsupported" });
    const artifactResult = await matchReceiptFiles(unreadableArtifact, smallReceipt);
    expect(artifactResult.status).toBe("invalid");
    expect(artifactResult.message).toContain("Artifacts must be");

    const recordedText = file(["safe"], "checked.txt", "text/plain");
    const oversizedTextArtifact = {
      size: RECEIPT_MATCH_LIMITS.textArtifactBytes + 1,
      type: "text/plain",
      arrayBuffer: () => Promise.reject(new Error("must not read")),
    } as File;
    const oversizedTextResult = await matchReceiptFiles(
      oversizedTextArtifact,
      jsonReceipt(await textReceipt(recordedText)),
    );
    expect(oversizedTextResult).toMatchObject({
      status: "invalid",
      schema: "aura.preflight.receipt/v1",
    });
    expect(oversizedTextResult.message).toContain("Text artifacts must be");

    const smallArtifact = file(["safe"], "checked.txt", "text/plain");
    const unreadableReceipt = {
      size: RECEIPT_MATCH_LIMITS.receiptBytes + 1,
      type: "application/json",
      arrayBuffer: () => Promise.reject(new Error("must not read")),
    } as File;
    const receiptResult = await matchReceiptFiles(smallArtifact, unreadableReceipt);
    expect(receiptResult.status).toBe("invalid");
    expect(receiptResult.message).toContain("Receipts must be");
  });

  it("rejects a receipt file with a non-JSON media type", async () => {
    const artifact = file(["safe"], "checked.txt", "text/plain");
    const receipt = file(
      [JSON.stringify(await textReceipt(artifact))],
      "receipt.json",
      "text/plain",
    );
    const result = await matchReceiptFiles(artifact, receipt);

    expect(result).toMatchObject({
      status: "invalid",
      message: "The receipt file must use a JSON media type.",
    });
  });
});
