import {
  type Bbox,
  type Line,
  type Worker,
} from "tesseract.js";
import { detectText, type Finding } from "../../packages/core/src";
import type { NormalizedRect } from "../types";
import {
  normalizeOcrText,
  sourceRangeForNormalizedRange,
} from "./ocr-normalize";
import { sha256 } from "./privacy";

export interface OcrFinding {
  finding: Finding;
  box: NormalizedRect;
  valueHash: string;
  engineConfidence: number;
}

export interface OcrScan {
  status: "checked" | "error";
  findings: OcrFinding[];
  lineCount: number;
  engineVersion?: string;
  error?: string;
}

export interface OcrProgress {
  status: string;
  progress: number;
}

let workerPromise: Promise<Worker> | undefined;
let progressListener: ((progress: OcrProgress) => void) | undefined;

function localAsset(path: string): string {
  const base = new URL(import.meta.env.BASE_URL, window.location.href);
  return new URL(path, base).href;
}

async function getWorker(
  onProgress?: (progress: OcrProgress) => void,
): Promise<Worker> {
  progressListener = onProgress;
  workerPromise ??= import("tesseract.js").then(
    async ({ createWorker, OEM, PSM }) => {
      const worker = await createWorker("eng", OEM.LSTM_ONLY, {
        workerPath: localAsset("tesseract/worker.min.js"),
        corePath: localAsset("tesseract/core"),
        langPath: localAsset("tesseract/lang"),
        logger(message) {
          progressListener?.({
            status: message.status,
            progress: Math.max(0, Math.min(1, message.progress)),
          });
        },
      });
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SPARSE_TEXT,
        preserve_interword_spaces: "1",
      });
      return worker;
    },
  );
  return workerPromise;
}

function normalizeBox(
  bbox: Bbox,
  imageWidth: number,
  imageHeight: number,
): NormalizedRect {
  const paddingX = Math.max(8, imageWidth * 0.008);
  const paddingY = Math.max(6, imageHeight * 0.008);
  const x0 = Math.max(0, bbox.x0 - paddingX);
  const y0 = Math.max(0, bbox.y0 - paddingY);
  const x1 = Math.min(imageWidth, bbox.x1 + paddingX);
  const y1 = Math.min(imageHeight, bbox.y1 + paddingY);
  return {
    x: x0 / imageWidth,
    y: y0 / imageHeight,
    width: Math.max(0.003, (x1 - x0) / imageWidth),
    height: Math.max(0.003, (y1 - y0) / imageHeight),
  };
}

function matchedBox(
  line: Line,
  finding: Finding,
  imageWidth: number,
  imageHeight: number,
): NormalizedRect {
  let cursor = 0;
  const matches = line.words.filter((word) => {
    const start = line.text.indexOf(word.text, cursor);
    if (start < 0) return false;
    const end = start + word.text.length;
    cursor = end;
    return end > finding.start && start < finding.end;
  });

  if (!matches.length) {
    return normalizeBox(line.bbox, imageWidth, imageHeight);
  }

  return normalizeBox(
    {
      x0: Math.min(...matches.map((word) => word.bbox.x0)),
      y0: Math.min(...matches.map((word) => word.bbox.y0)),
      x1: Math.max(...matches.map((word) => word.bbox.x1)),
      y1: Math.max(...matches.map((word) => word.bbox.y1)),
    },
    imageWidth,
    imageHeight,
  );
}

function collectLines(
  blocks: Awaited<ReturnType<Worker["recognize"]>>["data"]["blocks"],
): Line[] {
  return (
    blocks?.flatMap((block) =>
      block.paragraphs.flatMap((paragraph) => paragraph.lines),
    ) ?? []
  );
}

export async function scanOcr(
  blob: Blob,
  imageWidth: number,
  imageHeight: number,
  onProgress?: (progress: OcrProgress) => void,
): Promise<OcrScan> {
  try {
    const worker = await getWorker(onProgress);
    const result = await worker.recognize(
      blob,
      {},
      { text: true, blocks: true },
    );
    const lines = collectLines(result.data.blocks);
    const findings: OcrFinding[] = [];

    for (const line of lines) {
      const normalized = normalizeOcrText(line.text);
      for (const finding of detectText(normalized.text)) {
        const sourceRange = sourceRangeForNormalizedRange(
          normalized,
          finding.start,
          finding.end,
        );
        const sourceFinding = {
          ...finding,
          start: sourceRange.start,
          end: sourceRange.end,
        };
        const canonicalValue = normalized.text.slice(
          finding.start,
          finding.end,
        );
        findings.push({
          finding: sourceFinding,
          box: matchedBox(line, sourceFinding, imageWidth, imageHeight),
          valueHash: await sha256(canonicalValue),
          engineConfidence: Math.max(0, Math.min(100, line.confidence)),
        });
      }
    }

    progressListener = undefined;
    return {
      status: "checked",
      findings,
      lineCount: lines.length,
      engineVersion: result.data.version,
    };
  } catch {
    progressListener = undefined;
    workerPromise = undefined;
    return {
      status: "error",
      findings: [],
      lineCount: 0,
      error: "Visible-text inspection could not be completed.",
    };
  }
}

export async function terminateOcrWorker(): Promise<void> {
  if (!workerPromise) return;
  const worker = await workerPromise;
  workerPromise = undefined;
  progressListener = undefined;
  await worker.terminate();
}
