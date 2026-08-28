import { describe, expect, it } from "vitest";

import {
  buildImageChecks,
  classifyOutputFindings,
  type ImageCheckInput,
} from "./verification";

describe("post-export finding classification", () => {
  it("distinguishes approved residue, explicit retention, and unknown output", () => {
    expect(
      classifyOutputFindings(
        [{ valueHash: "selected" }, { valueHash: "retained" }, { valueHash: "new" }],
        ["selected"],
        ["retained"],
      ),
    ).toEqual({
      selectedResidueCount: 1,
      retainedCount: 1,
      unknownCount: 1,
    });
  });
});

describe("image verification checks", () => {
  const clean: ImageCheckInput = {
    synthetic: false,
    dimensions: { width: 1200, height: 800 },
    solid: true,
    everySelectedVisualFindingHasBox: true,
    visualRegionCount: 1,
    metadata: { status: "checked", groups: [] },
    pngChunks: { status: "checked", unexpectedChunks: [] },
    ocr: { status: "checked", findings: [] },
    barcode: { status: "checked" },
    selectedOcrHashes: ["selected-ocr"],
    retainedOcrHashes: ["retained-ocr"],
    selectedBarcodeHashes: ["selected-code"],
    retainedBarcodeHashes: ["retained-code"],
  };

  it("passes when only explicitly retained findings remain", () => {
    const result = buildImageChecks({
      ...clean,
      ocr: { status: "checked", findings: [{ valueHash: "retained-ocr" }] },
      barcode: {
        status: "checked",
        finding: { valueHash: "retained-code" },
      },
    });

    expect(result.passed).toBe(true);
    expect(result.ocr.retainedCount).toBe(1);
    expect(result.barcode.retainedCount).toBe(1);
  });

  it("passes the visual check when a reviewed image needs no visual redactions", () => {
    const result = buildImageChecks({
      ...clean,
      visualRegionCount: 0,
    });
    const pixelCheck = result.checks.find(
      (check) => check.id === "pixels.flattened",
    );

    expect(result.passed).toBe(true);
    expect(pixelCheck).toMatchObject({
      label: "No visual redactions required",
      status: "passed",
    });
  });

  it("does not call a missing selected box a no-redaction review", () => {
    const result = buildImageChecks({
      ...clean,
      visualRegionCount: 0,
      everySelectedVisualFindingHasBox: false,
    });
    const pixelCheck = result.checks.find(
      (check) => check.id === "pixels.flattened",
    );

    expect(pixelCheck).toMatchObject({
      label: "Selected visual regions flattened",
      status: "failed",
    });
  });

  it.each([
    ["decode failure", { dimensions: undefined }],
    ["pixel failure", { solid: false }],
    [
      "missing selected box",
      { everySelectedVisualFindingHasBox: false },
    ],
    [
      "metadata parser failure",
      { metadata: { status: "error" as const, groups: [] } },
    ],
    [
      "remaining metadata",
      {
        metadata: {
          status: "checked" as const,
          groups: [{ id: "xmp" as const, label: "XMP metadata", fieldCount: 1 }],
        },
      },
    ],
    [
      "PNG parser failure",
      { pngChunks: { status: "error" as const, unexpectedChunks: [] } },
    ],
    [
      "unexpected PNG chunk",
      {
        pngChunks: {
          status: "checked" as const,
          unexpectedChunks: ["iTXt"],
        },
      },
    ],
    ["OCR failure", { ocr: { status: "error" as const, findings: [] } }],
    [
      "approved OCR residue",
      {
        ocr: {
          status: "checked" as const,
          findings: [{ valueHash: "selected-ocr" }],
        },
      },
    ],
    [
      "unknown OCR finding",
      {
        ocr: {
          status: "checked" as const,
          findings: [{ valueHash: "new-ocr" }],
        },
      },
    ],
    ["barcode failure", { barcode: { status: "error" as const } }],
    [
      "approved barcode residue",
      {
        barcode: {
          status: "checked" as const,
          finding: { valueHash: "selected-code" },
        },
      },
    ],
    [
      "unknown barcode finding",
      {
        barcode: {
          status: "checked" as const,
          finding: { valueHash: "new-code" },
        },
      },
    ],
  ])("fails closed on %s", (_label, change) => {
    expect(buildImageChecks({ ...clean, ...change }).passed).toBe(false);
  });
});
