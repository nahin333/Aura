import type {
  MetadataGroup,
  MetadataScan,
  NormalizedRect,
} from "../types";
import { maskValue, sha256 } from "./privacy";

export const ACCEPTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 40_000_000;
const REDACTION_COLOR = [20, 23, 21] as const;

export interface DecodedImage {
  width: number;
  height: number;
}

export interface BarcodeScan {
  status: "checked" | "error";
  finding?: {
    preview: string;
    valueHash: string;
    format: string;
    box?: NormalizedRect;
  };
  error?: string;
}

export interface PngChunkScan {
  status: "checked" | "error";
  unexpectedChunks: string[];
  error?: string;
}

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;
const ALLOWED_OUTPUT_PNG_CHUNKS = new Set([
  "IHDR",
  "PLTE",
  "IDAT",
  "IEND",
  "tRNS",
  "cHRM",
  "gAMA",
  "sRGB",
  "pHYs",
]);

interface ParsedPngChunk {
  type: string;
  start: number;
  end: number;
}

function parsePngChunks(bytes: Uint8Array): ParsedPngChunk[] {
  if (
    bytes.length < PNG_SIGNATURE.length ||
    PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)
  ) {
    throw new Error("Missing PNG signature");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder("ascii");
  const chunks: ParsedPngChunk[] = [];
  let offset: number = PNG_SIGNATURE.length;
  let sawHeader = false;
  let sawEnd = false;

  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw new Error("Truncated PNG chunk");
    const length = view.getUint32(offset);
    const type = decoder.decode(bytes.subarray(offset + 4, offset + 8));
    const chunkEnd = offset + 12 + length;
    if (chunkEnd > bytes.length) throw new Error("Invalid PNG chunk length");
    if (!sawHeader && type !== "IHDR") throw new Error("IHDR was not first");
    if (type === "IHDR") sawHeader = true;
    chunks.push({ type, start: offset, end: chunkEnd });
    offset = chunkEnd;
    if (type === "IEND") {
      sawEnd = true;
      break;
    }
  }
  if (!sawHeader || !sawEnd || offset !== bytes.length) {
    throw new Error("PNG structure was incomplete or had trailing bytes");
  }
  return chunks;
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

async function imageElement(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  try {
    await image.decode();
    return image;
  } catch {
    throw new Error("The image bytes could not be decoded.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function validateImageFile(file: File): void {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_IMAGE_TYPES)[number])) {
    throw new Error("Choose a PNG, JPEG, or WebP image.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Choose an image smaller than 25 MB.");
  }
}

export async function decodeImage(blob: Blob): Promise<DecodedImage> {
  const image = await imageElement(blob);
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (!width || !height) throw new Error("The image has no readable dimensions.");
  if (width * height > MAX_IMAGE_PIXELS) {
    throw new Error("Choose an image smaller than 40 megapixels.");
  }
  return { width, height };
}

export async function scanMetadata(blob: Blob): Promise<MetadataScan> {
  try {
    const ExifReader = await import("exifreader");
    const tags = await ExifReader.load(await blob.arrayBuffer(), {
      expanded: true,
      async: true,
    });
    const record = objectRecord(tags);
    const definitions: Array<{
      id: MetadataGroup["id"];
      label: string;
    }> = [
      { id: "gps", label: "GPS location" },
      { id: "exif", label: "EXIF metadata" },
      { id: "iptc", label: "IPTC metadata" },
      { id: "xmp", label: "XMP metadata" },
      { id: "pngText", label: "PNG text metadata" },
      { id: "icc", label: "ICC profile metadata" },
      { id: "photoshop", label: "Photoshop metadata" },
    ];

    const groups = definitions.flatMap<MetadataGroup>((definition) => {
      const fields = Object.keys(objectRecord(record[definition.id])).filter(
        (field) => field !== "_raw",
      );
      return fields.length
        ? [{ ...definition, fieldCount: fields.length }]
        : [];
    });
    return { status: "checked", groups };
  } catch (error) {
    if (error instanceof Error && error.name === "MetadataMissingError") {
      return { status: "checked", groups: [] };
    }
    return {
      status: "error",
      groups: [],
      error: "Metadata inspection could not be completed.",
    };
  }
}

export function qrCodeBox(
  points: readonly { getX(): number; getY(): number }[],
  width: number,
  height: number,
): NormalizedRect | undefined {
  if (!points.length) return undefined;
  const xs = points.map((point) => point.getX());
  const ys = points.map((point) => point.getY());
  const pointSpan = Math.max(
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
  );
  const padding = Math.max(
    16,
    pointSpan * 0.4,
    Math.min(width, height) * 0.02,
  );
  const x0 = Math.max(0, Math.min(...xs) - padding);
  const y0 = Math.max(0, Math.min(...ys) - padding);
  const x1 = Math.min(width, Math.max(...xs) + padding);
  const y1 = Math.min(height, Math.max(...ys) + padding);
  return {
    x: x0 / width,
    y: y0 / height,
    width: Math.max(0.02, (x1 - x0) / width),
    height: Math.max(0.02, (y1 - y0) / height),
  };
}

export async function scanBarcode(blob: Blob): Promise<BarcodeScan> {
  try {
    const { BrowserQRCodeReader } = await import("@zxing/browser");
    const reader = new BrowserQRCodeReader();
    const image = await imageElement(blob);
    const result = await reader.decodeFromImageElement(image);
    const rawValue = result.getText();
    const valueHash = await sha256(rawValue);
    const format = String(result.getBarcodeFormat()).replaceAll("_", " ");
    return {
      status: "checked",
      finding: {
        preview: maskValue(rawValue, rawValue.startsWith("http") ? "link" : "barcode"),
        valueHash,
        format,
        box: qrCodeBox(
          result.getResultPoints(),
          image.naturalWidth,
          image.naturalHeight,
        ),
      },
    };
  } catch (error) {
    const kind =
      error &&
      typeof error === "object" &&
      "getKind" in error &&
      typeof error.getKind === "function"
        ? error.getKind()
        : error instanceof Error
          ? error.name
          : undefined;
    if (kind === "NotFoundException") {
      return { status: "checked" };
    }
    return {
      status: "error",
      error: "QR inspection could not be completed.",
    };
  }
}

export async function scanOutputPngChunks(blob: Blob): Promise<PngChunkScan> {
  try {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const unexpectedChunks = parsePngChunks(bytes)
      .map((chunk) => chunk.type)
      .filter((type) => !ALLOWED_OUTPUT_PNG_CHUNKS.has(type));
    return { status: "checked", unexpectedChunks };
  } catch {
    return {
      status: "error",
      unexpectedChunks: [],
      error: "PNG chunk inspection could not be completed.",
    };
  }
}

export async function stripOutputPngChunks(blob: Blob): Promise<Blob> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunks = parsePngChunks(bytes);
  const parts: BlobPart[] = [bytes.slice(0, PNG_SIGNATURE.length)];

  for (const chunk of chunks) {
    if (ALLOWED_OUTPUT_PNG_CHUNKS.has(chunk.type)) {
      parts.push(bytes.slice(chunk.start, chunk.end));
      continue;
    }
    const isAncillary = (chunk.type.charCodeAt(0) & 32) !== 0;
    if (!isAncillary) {
      throw new Error(`The encoder produced an unknown critical PNG chunk: ${chunk.type}`);
    }
  }

  return new Blob(parts, { type: "image/png" });
}

export async function rasterizeImage(
  source: Blob,
  boxes: readonly NormalizedRect[],
): Promise<Blob> {
  const image = await imageElement(source);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas rendering is unavailable.");

  context.drawImage(image, 0, 0);
  context.fillStyle = `rgb(${REDACTION_COLOR.join(",")})`;
  for (const box of boxes) {
    const { x, y, width, height } = pixelBounds(
      box,
      canvas.width,
      canvas.height,
    );
    if (width > 0 && height > 0) context.fillRect(x, y, width, height);
  }

  const encoded = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("The checked image could not be encoded.")),
      "image/png",
    );
  });
  return stripOutputPngChunks(encoded);
}

export async function verifySolidRegions(
  blob: Blob,
  boxes: readonly NormalizedRect[],
): Promise<boolean> {
  if (!boxes.length) return true;
  const image = await imageElement(blob);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas verification is unavailable.");
  context.drawImage(image, 0, 0);

  return boxes.every((box) => {
    const { x, y, width, height } = pixelBounds(
      box,
      canvas.width,
      canvas.height,
    );
    if (width <= 0 || height <= 0) return false;
    const pixels = context.getImageData(x, y, width, height).data;
    for (let index = 0; index < pixels.length; index += 4) {
      if (
        pixels[index] !== REDACTION_COLOR[0] ||
        pixels[index + 1] !== REDACTION_COLOR[1] ||
        pixels[index + 2] !== REDACTION_COLOR[2] ||
        pixels[index + 3] !== 255
      ) {
        return false;
      }
    }
    return true;
  });
}

export function pixelBounds(
  box: NormalizedRect,
  imageWidth: number,
  imageHeight: number,
): { x: number; y: number; width: number; height: number } {
  const x = Math.max(0, Math.min(imageWidth, Math.floor(box.x * imageWidth)));
  const y = Math.max(0, Math.min(imageHeight, Math.floor(box.y * imageHeight)));
  const x1 = Math.max(
    x,
    Math.min(imageWidth, Math.ceil((box.x + box.width) * imageWidth)),
  );
  const y1 = Math.max(
    y,
    Math.min(imageHeight, Math.ceil((box.y + box.height) * imageHeight)),
  );
  return { x, y, width: x1 - x, height: y1 - y };
}

export { sha256 };
