#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { deflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const outputDirectory = path.resolve(process.cwd(), process.argv[2] ?? "dist/icons");

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, checksum]);
}

function distanceToSegment(x, y, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  const projection = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lengthSquared));
  return Math.hypot(x - (x1 + projection * dx), y - (y1 + projection * dy));
}

function insideRoundedSquare(x, y, inset, radius) {
  const left = inset;
  const right = 1 - inset;
  const top = inset;
  const bottom = 1 - inset;
  const nearestX = Math.max(left + radius, Math.min(right - radius, x));
  const nearestY = Math.max(top + radius, Math.min(bottom - radius, y));
  return Math.hypot(x - nearestX, y - nearestY) <= radius;
}

const CORNER_SEGMENTS = [
  [0.3, 0.41, 0.3, 0.3],
  [0.3, 0.3, 0.41, 0.3],
  [0.59, 0.3, 0.7, 0.3],
  [0.7, 0.3, 0.7, 0.41],
  [0.7, 0.59, 0.7, 0.7],
  [0.7, 0.7, 0.59, 0.7],
  [0.41, 0.7, 0.3, 0.7],
  [0.3, 0.7, 0.3, 0.59],
];

function sampleIcon(x, y, maskable) {
  const paper = [243, 240, 231];
  const moss = [23, 55, 45];
  const mossLifted = [31, 71, 58];
  const lime = [189, 255, 118];
  const inkArea = maskable || insideRoundedSquare(x, y, 0.075, 0.185);
  let color = paper;

  if (inkArea) {
    const light = Math.max(0, 1 - Math.hypot(x - 0.42, y - 0.36) / 0.7);
    color = moss.map((channel, index) =>
      Math.round(channel + (mossLifted[index] - channel) * light * 0.48),
    );
  }

  if (!inkArea) {
    return color;
  }

  const bracketDistance = Math.min(
    ...CORNER_SEGMENTS.map(([x1, y1, x2, y2]) =>
      distanceToSegment(x, y, x1, y1, x2, y2),
    ),
  );
  const scanDistance = distanceToSegment(x, y, 0.255, 0.5, 0.745, 0.5);
  const centerDotDistance = Math.hypot(x - 0.5, y - 0.5);
  const isGlyph = bracketDistance <= 0.022 || scanDistance <= 0.017 || centerDotDistance <= 0.035;

  if (isGlyph) {
    return lime;
  }

  const haloDistance = Math.abs(Math.hypot(x - 0.5, y - 0.5) - 0.255);
  if (haloDistance <= 0.012) {
    return color.map((channel, index) =>
      Math.round(channel * 0.76 + lime[index] * 0.24),
    );
  }

  return color;
}

function renderRgba(size, maskable) {
  const samplesPerAxis = 3;
  const rgba = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const totals = [0, 0, 0];

      for (let sampleY = 0; sampleY < samplesPerAxis; sampleY += 1) {
        for (let sampleX = 0; sampleX < samplesPerAxis; sampleX += 1) {
          const normalizedX = (x + (sampleX + 0.5) / samplesPerAxis) / size;
          const normalizedY = (y + (sampleY + 0.5) / samplesPerAxis) / size;
          const sample = sampleIcon(normalizedX, normalizedY, maskable);
          totals[0] += sample[0];
          totals[1] += sample[1];
          totals[2] += sample[2];
        }
      }

      const offset = (y * size + x) * 4;
      const sampleCount = samplesPerAxis * samplesPerAxis;
      rgba[offset] = Math.round(totals[0] / sampleCount);
      rgba[offset + 1] = Math.round(totals[1] / sampleCount);
      rgba[offset + 2] = Math.round(totals[2] / sampleCount);
      rgba[offset + 3] = 255;
    }
  }

  return rgba;
}

function encodePng(size, maskable) {
  const rgba = renderRgba(size, maskable);
  const rowLength = size * 4;
  const scanlines = Buffer.alloc((rowLength + 1) * size);

  for (let y = 0; y < size; y += 1) {
    const targetOffset = y * (rowLength + 1);
    scanlines[targetOffset] = 0;
    rgba.copy(scanlines, targetOffset + 1, y * rowLength, (y + 1) * rowLength);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(scanlines, { level: 9 })),
    pngChunk("IEND"),
  ]);
}

async function main() {
  await mkdir(outputDirectory, { recursive: true });
  const icons = [
    ["aura-192.png", 192, false],
    ["aura-512.png", 512, false],
    ["aura-maskable-512.png", 512, true],
  ];

  await Promise.all(
    icons.map(([filename, size, maskable]) =>
      writeFile(path.join(outputDirectory, filename), encodePng(size, maskable)),
    ),
  );

  process.stdout.write(`Generated ${icons.length} deterministic Aura icons in ${outputDirectory}\n`);
}

main().catch((error) => {
  process.stderr.write(`Unable to generate Aura PWA icons: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
