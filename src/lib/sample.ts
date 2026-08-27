import type { NormalizedRect } from "../types";

export interface SampleFindingSeed {
  id: string;
  kind: "email" | "credential" | "barcode" | "metadata";
  title: string;
  preview: string;
  evidence: string;
  detectorId: string;
  rawValue: string;
  box?: NormalizedRect;
}

const SAMPLE_EMAIL = "maya.chen@example.test";
const SAMPLE_TOKEN = "aura_demo_DEMO_NOT_VALID_7Q4F";
const SAMPLE_RESET_URL =
  "https://example.test/reset?token=DEMO-NOT-VALID-8842";
const SAMPLE_LOCATION = "37.7749,-122.4194";
const SAMPLE_WIDTH = 1280;
const SAMPLE_HEIGHT = 760;

function sampleRect(
  x: number,
  y: number,
  width: number,
  height: number,
): NormalizedRect {
  return {
    x: x / SAMPLE_WIDTH,
    y: y / SAMPLE_HEIGHT,
    width: width / SAMPLE_WIDTH,
    height: height / SAMPLE_HEIGHT,
  };
}

export const sampleFindingSeeds: readonly SampleFindingSeed[] = [
  {
    id: "sample-email",
    kind: "email",
    title: "Email address",
    preview: "m•••@example.test",
    evidence: "Visible text · Email rule",
    detectorId: "sample.email",
    rawValue: SAMPLE_EMAIL,
    box: sampleRect(144, 344, 370, 50),
  },
  {
    id: "sample-token",
    kind: "credential",
    title: "Credential",
    preview: "aura••••7Q4F",
    evidence: "Visible text · Credential rule",
    detectorId: "sample.credential",
    rawValue: SAMPLE_TOKEN,
    box: sampleRect(144, 492, 450, 51),
  },
  {
    id: "sample-barcode",
    kind: "barcode",
    title: "Reset link",
    preview: "example.test/…",
    evidence: "QR code · Synthetic payload",
    detectorId: "sample.qr",
    rawValue: SAMPLE_RESET_URL,
    box: sampleRect(958, 282, 200, 202),
  },
  {
    id: "sample-metadata",
    kind: "metadata",
    title: "Location",
    preview: "37.7••, −122.4••",
    evidence: "Metadata · Synthetic EXIF GPS field",
    detectorId: "sample.exif.gps",
    rawValue: SAMPLE_LOCATION,
  },
];

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fill();
}

function drawQrPattern(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
): void {
  const cells = 21;
  const cell = size / cells;
  context.fillStyle = "#fff";
  context.fillRect(x, y, size, size);

  const finder = (left: number, top: number) => {
    context.fillStyle = "#151816";
    context.fillRect(x + left * cell, y + top * cell, cell * 7, cell * 7);
    context.fillStyle = "#fff";
    context.fillRect(
      x + (left + 1) * cell,
      y + (top + 1) * cell,
      cell * 5,
      cell * 5,
    );
    context.fillStyle = "#151816";
    context.fillRect(
      x + (left + 2) * cell,
      y + (top + 2) * cell,
      cell * 3,
      cell * 3,
    );
  };

  finder(0, 0);
  finder(14, 0);
  finder(0, 14);

  context.fillStyle = "#151816";
  for (let row = 0; row < cells; row += 1) {
    for (let column = 0; column < cells; column += 1) {
      const insideFinder =
        (column < 8 && row < 8) ||
        (column > 12 && row < 8) ||
        (column < 8 && row > 12);
      if (!insideFinder && ((row * 7 + column * 11 + row * column) % 5 < 2)) {
        context.fillRect(
          x + column * cell,
          y + row * cell,
          Math.ceil(cell),
          Math.ceil(cell),
        );
      }
    }
  }
}

export async function createSampleFile(): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_WIDTH;
  canvas.height = SAMPLE_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable in this browser.");

  context.fillStyle = "#e9e5da";
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = "#171a18";
  roundedRect(context, 54, 46, 1172, 668, 28);

  context.fillStyle = "#252a27";
  roundedRect(context, 78, 70, 1124, 74, 16);
  context.fillStyle = "#f4f1e8";
  context.font = "600 27px Arial, sans-serif";
  context.fillText("Support workspace", 112, 116);
  context.fillStyle = "#94a099";
  context.font = "16px Arial, sans-serif";
  context.fillText("Private escalation", 950, 112);

  context.fillStyle = "#f8f6ef";
  roundedRect(context, 78, 168, 780, 520, 20);
  context.fillStyle = "#1c211e";
  context.font = "700 34px Arial, sans-serif";
  context.fillText("Account recovery request", 126, 230);
  context.fillStyle = "#69736d";
  context.font = "18px Arial, sans-serif";
  context.fillText("Ticket #1842  ·  Open  ·  Demo account", 126, 268);

  context.fillStyle = "#ebe8de";
  roundedRect(context, 126, 304, 684, 92, 14);
  context.fillStyle = "#68716c";
  context.font = "600 15px Arial, sans-serif";
  context.fillText("CUSTOMER EMAIL", 154, 337);
  context.fillStyle = "#1b201d";
  context.font = "600 26px ui-monospace, monospace";
  context.fillText(SAMPLE_EMAIL, 154, 376);

  context.fillStyle = "#f4e6de";
  roundedRect(context, 126, 442, 684, 132, 14);
  context.fillStyle = "#855039";
  context.font = "600 15px Arial, sans-serif";
  context.fillText("INTERNAL NOTE — DO NOT SHARE", 154, 476);
  context.fillStyle = "#3b2921";
  context.font = "600 22px ui-monospace, monospace";
  context.fillText(SAMPLE_TOKEN, 154, 524);
  context.fillStyle = "#855f4c";
  context.font = "16px Arial, sans-serif";
  context.fillText("Use once, then rotate the credential.", 154, 554);

  context.fillStyle = "#252a27";
  roundedRect(context, 886, 168, 316, 520, 20);
  context.fillStyle = "#f4f1e8";
  context.font = "700 24px Arial, sans-serif";
  context.fillText("Recovery QR", 932, 224);
  context.fillStyle = "#99a49d";
  context.font = "16px Arial, sans-serif";
  context.fillText("Scan to continue", 932, 254);
  drawQrPattern(context, 970, 294, 176);
  context.fillStyle = "#d5dbd7";
  context.font = "15px Arial, sans-serif";
  context.fillText("Valid for 10 minutes", 970, 498);

  context.fillStyle = "#313834";
  roundedRect(context, 932, 552, 222, 82, 12);
  context.fillStyle = "#9ca8a1";
  context.font = "13px Arial, sans-serif";
  context.fillText("ATTACHMENT DETAILS", 954, 582);
  context.fillStyle = "#eef0ed";
  context.font = "15px ui-monospace, monospace";
  context.fillText("IMG_1842.PNG", 954, 611);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) =>
        value ? resolve(value) : reject(new Error("Could not create demo image.")),
      "image/png",
    );
  });

  return new File([blob], "aura-synthetic-demo.png", {
    type: "image/png",
    lastModified: 0,
  });
}
