import type { Finding } from "../packages/core/src";

export type AppStage =
  | "empty"
  | "inspecting"
  | "reviewing"
  | "sanitizing"
  | "verifying"
  | "result"
  | "error";

export type FindingKind =
  | "email"
  | "phone"
  | "network"
  | "link"
  | "credential"
  | "payment"
  | "barcode"
  | "metadata"
  | "manual";

export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ReviewFinding {
  id: string;
  kind: FindingKind;
  title: string;
  preview: string;
  evidence: string;
  detectorId: string;
  selected: boolean;
  required?: boolean;
  box?: NormalizedRect;
  valueHash?: string;
  textFinding?: Finding;
  synthetic?: boolean;
}

export interface ImageDocument {
  kind: "image";
  file: File;
  url: string;
  width: number;
  height: number;
  mimeType: string;
  byteLength: number;
  synthetic: boolean;
}

export interface TextDocument {
  kind: "text";
  text: string;
}

export type PreflightDocument = ImageDocument | TextDocument;

export interface MetadataGroup {
  id: "exif" | "iptc" | "xmp" | "gps" | "pngText" | "icc" | "photoshop";
  label: string;
  fieldCount: number;
}

export interface MetadataScan {
  status: "checked" | "error";
  groups: MetadataGroup[];
  error?: string;
}

export interface ScannerCheck {
  id: string;
  label: string;
  status: "passed" | "failed" | "not-run";
  detail: string;
}

export interface ImageReceipt {
  schema: "aura.preflight.image-receipt/v1";
  createdAt: string;
  mediaType: "image/png";
  mode: "uploaded-artifact" | "synthetic-demo";
  source: {
    byteLength: number;
    mimeType: string;
  };
  output: {
    sha256: string;
    byteLength: number;
    width: number;
    height: number;
  };
  redaction: {
    selectedCount: number;
    byCategory: Record<string, number>;
    manualRegionCount: number;
  };
  verification: {
    status: "pass" | "fail" | "demo";
    checks: readonly ScannerCheck[];
  };
  engines: {
    deterministicRules: string;
    ocr: string;
    barcode: string;
    metadata: string;
  };
  properties: readonly string[];
  limitations: readonly string[];
}

export interface ImageResult {
  kind: "image";
  blob: Blob;
  url: string;
  receipt: ImageReceipt;
  passed: boolean;
}

export interface TextResult {
  kind: "text";
  text: string;
  receipt: unknown;
  passed: boolean;
  retainedObservedCount: number;
  unknownObservedCount: number;
}

export type PreflightResult = ImageResult | TextResult;
