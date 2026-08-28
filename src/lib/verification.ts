import type { MetadataScan, ScannerCheck } from "../types";

interface HashedOutputFinding {
  readonly valueHash: string;
}

export interface DetectionClassification {
  readonly selectedResidueCount: number;
  readonly retainedCount: number;
  readonly unknownCount: number;
}

export function classifyOutputFindings(
  findings: readonly HashedOutputFinding[],
  selectedSourceHashes: readonly string[],
  retainedSourceHashes: readonly string[],
): DetectionClassification {
  const selected = new Set(selectedSourceHashes);
  const retained = new Set(retainedSourceHashes);
  let selectedResidueCount = 0;
  let retainedCount = 0;
  let unknownCount = 0;

  for (const finding of findings) {
    if (selected.has(finding.valueHash)) {
      selectedResidueCount += 1;
    } else if (retained.has(finding.valueHash)) {
      retainedCount += 1;
    } else {
      unknownCount += 1;
    }
  }

  return { selectedResidueCount, retainedCount, unknownCount };
}

export interface ImageCheckInput {
  readonly synthetic: boolean;
  readonly dimensions?: { readonly width: number; readonly height: number };
  readonly solid: boolean;
  readonly everySelectedVisualFindingHasBox: boolean;
  readonly visualRegionCount: number;
  readonly metadata: MetadataScan;
  readonly pngChunks: {
    readonly status: "checked" | "error";
    readonly unexpectedChunks: readonly string[];
  };
  readonly ocr: {
    readonly status: "checked" | "error";
    readonly findings: readonly HashedOutputFinding[];
  };
  readonly barcode: {
    readonly status: "checked" | "error";
    readonly finding?: HashedOutputFinding;
  };
  readonly selectedOcrHashes: readonly string[];
  readonly retainedOcrHashes: readonly string[];
  readonly selectedBarcodeHashes: readonly string[];
  readonly retainedBarcodeHashes: readonly string[];
}

export interface ImageCheckResult {
  readonly checks: readonly ScannerCheck[];
  readonly passed: boolean;
  readonly ocr: DetectionClassification;
  readonly barcode: DetectionClassification;
}

export function buildImageChecks(input: ImageCheckInput): ImageCheckResult {
  const ocr = classifyOutputFindings(
    input.ocr.findings,
    input.selectedOcrHashes,
    input.retainedOcrHashes,
  );
  const barcode = classifyOutputFindings(
    input.barcode.finding ? [input.barcode.finding] : [],
    input.selectedBarcodeHashes,
    input.retainedBarcodeHashes,
  );

  const checks: ScannerCheck[] = [
    {
      id: "output.decode",
      label: "Output decoded successfully",
      status: input.dimensions ? "passed" : "failed",
      detail: input.dimensions
        ? `${input.dimensions.width} × ${input.dimensions.height} PNG decoded from exported bytes`
        : "The newly encoded output could not be decoded.",
    },
    {
      id: "pixels.flattened",
      label:
        input.visualRegionCount === 0 &&
        input.everySelectedVisualFindingHasBox
        ? "No visual redactions required"
        : "Selected visual regions flattened",
      status:
        input.solid && input.everySelectedVisualFindingHasBox
          ? "passed"
          : "failed",
      detail: !input.everySelectedVisualFindingHasBox
        ? "A selected visual finding had no usable redaction box."
        : input.visualRegionCount
          ? `${input.visualRegionCount} selected region${input.visualRegionCount === 1 ? "" : "s"} contain only solid replacement pixels`
          : "The review contained no supported or manual visual regions to flatten.",
    },
    {
      id: "metadata.absent",
      label: "Supported hidden metadata not found",
      status:
        input.metadata.status === "checked" &&
        input.metadata.groups.length === 0
          ? "passed"
          : "failed",
      detail:
        input.metadata.status === "error"
          ? "The output metadata parser did not complete."
          : input.metadata.groups.length
            ? `${input.metadata.groups.length} supported metadata group${input.metadata.groups.length === 1 ? "" : "s"} remain`
            : "Supported metadata groups were absent from exported bytes.",
    },
    {
      id: "png.chunks",
      label: "PNG chunk allowlist passed",
      status:
        input.pngChunks.status === "checked" &&
        input.pngChunks.unexpectedChunks.length === 0
          ? "passed"
          : "failed",
      detail:
        input.pngChunks.status === "error"
          ? "The output PNG chunk parser did not complete."
          : input.pngChunks.unexpectedChunks.length
            ? `Unexpected chunk types remain: ${input.pngChunks.unexpectedChunks.join(", ")}`
            : "Only structural and non-text color/layout chunks were present.",
    },
    {
      id: "ocr.rescan",
      label: "Approved visible-text findings not detected",
      status: input.synthetic
        ? "not-run"
        : input.ocr.status === "checked" &&
            ocr.selectedResidueCount === 0 &&
            ocr.unknownCount === 0
          ? "passed"
          : "failed",
      detail: input.synthetic
        ? "Synthetic findings were preloaded; OCR was intentionally not run for the demo."
        : input.ocr.status === "error"
          ? "The output OCR check did not complete."
          : ocr.selectedResidueCount
            ? `${ocr.selectedResidueCount} approved text finding${ocr.selectedResidueCount === 1 ? "" : "s"} remain`
            : ocr.unknownCount
              ? `${ocr.unknownCount} new or unreviewed supported text finding${ocr.unknownCount === 1 ? "" : "s"} appeared in the output`
              : ocr.retainedCount
                ? `Approved findings were absent; ${ocr.retainedCount} explicitly retained text finding${ocr.retainedCount === 1 ? "" : "s"} remain`
                : "No approved or unknown deterministic text finding was returned by output OCR.",
    },
    {
      id: "barcode.rescan",
      label: "Approved QR payloads not detected",
      status: input.synthetic
        ? "not-run"
        : input.barcode.status === "checked" &&
            barcode.selectedResidueCount === 0 &&
            barcode.unknownCount === 0
          ? "passed"
          : "failed",
      detail: input.synthetic
        ? "The demo QR is synthetic artwork; live decoding was intentionally not run."
        : input.barcode.status === "error"
          ? "The output QR check did not complete."
          : barcode.selectedResidueCount
            ? "An approved QR payload remains in the output."
            : barcode.unknownCount
              ? "A new or unreviewed QR payload appeared in the output."
              : barcode.retainedCount
                ? "An explicitly retained QR payload remains."
                : "No approved or unknown QR payload was detected.",
    },
  ];

  return {
    checks,
    passed: checks
      .filter((check) => check.status !== "not-run")
      .every((check) => check.status === "passed"),
    ocr,
    barcode,
  };
}
