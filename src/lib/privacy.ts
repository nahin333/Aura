import {
  canonicalProtectedTermValue,
  PROTECTED_TERM_DETECTOR_ID,
} from "../../packages/core/src";
import type { FindingKind, ReviewFinding } from "../types";

export async function sha256(value: Blob | string): Promise<string> {
  const bytes =
    typeof value === "string"
      ? new TextEncoder().encode(value)
      : new Uint8Array(await value.arrayBuffer());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function canonicalFindingValue(
  value: string,
  detectorId: string,
): string {
  return detectorId === PROTECTED_TERM_DETECTOR_ID
    ? canonicalProtectedTermValue(value)
    : value;
}

export async function findingValueHash(
  value: string,
  detectorId: string,
): Promise<string> {
  return sha256(canonicalFindingValue(value, detectorId));
}

export function maskValue(value: string, kind: FindingKind): string {
  const compact = value.trim();
  if (!compact) return "hidden value";

  if (kind === "email") {
    const [name = "", domain = ""] = compact.split("@");
    return `${name.slice(0, 1)}•••@${domain || "hidden"}`;
  }

  if (kind === "link") {
    try {
      const url = new URL(compact);
      return `${url.hostname}/…`;
    } catch {
      return "sensitive link";
    }
  }

  if (kind === "phone") {
    return `••• ••• ${compact.replace(/\D/g, "").slice(-4)}`;
  }

  if (kind === "payment") {
    return `•••• •••• •••• ${compact.replace(/\D/g, "").slice(-4)}`;
  }

  if (kind === "custom") {
    return "••••••••";
  }

  if (compact.length <= 8) return "••••••••";
  return `${compact.slice(0, Math.min(4, compact.length))}••••${compact.slice(-4)}`;
}

export function countCategories(
  findings: readonly ReviewFinding[],
): Record<string, number> {
  return findings.reduce<Record<string, number>>((counts, finding) => {
    counts[finding.kind] = (counts[finding.kind] ?? 0) + 1;
    return counts;
  }, {});
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function receiptFilename(): string {
  const date = new Date().toISOString().slice(0, 10);
  return `aura-receipt-${date}.json`;
}

export function outputFilename(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `aura-checked-${stamp}.png`;
}
