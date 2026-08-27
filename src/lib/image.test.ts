import { describe, expect, it } from "vitest";

import {
  pixelBounds,
  qrCodeBox,
  scanOutputPngChunks,
  stripOutputPngChunks,
} from "./image";

function pngWithChunks(types: readonly string[]): Blob {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  const chunks = types.flatMap((type) => [
    0,
    0,
    0,
    0,
    ...Array.from(type).map((character) => character.charCodeAt(0)),
    0,
    0,
    0,
    0,
  ]);
  return new Blob([new Uint8Array([...signature, ...chunks])]);
}

describe("image output structure", () => {
  it("expands QR finder centers beyond the full symbol extent", () => {
    const point = (x: number, y: number) => ({
      getX: () => x,
      getY: () => y,
    });
    expect(
      qrCodeBox(
        [point(35, 35), point(175, 35), point(35, 175)],
        210,
        210,
      ),
    ).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });

  it("covers the complete fractional rectangle", () => {
    expect(
      pixelBounds(
        { x: 0.101, y: 0.202, width: 0.208, height: 0.307 },
        100,
        100,
      ),
    ).toEqual({ x: 10, y: 20, width: 21, height: 31 });
  });

  it("accepts structural PNG chunks and rejects text chunks", async () => {
    await expect(
      scanOutputPngChunks(pngWithChunks(["IHDR", "IDAT", "IEND"])),
    ).resolves.toEqual({ status: "checked", unexpectedChunks: [] });
    await expect(
      scanOutputPngChunks(pngWithChunks(["IHDR", "iTXt", "IEND"])),
    ).resolves.toEqual({
      status: "checked",
      unexpectedChunks: ["iTXt"],
    });
  });

  it("strips unknown ancillary chunks from freshly encoded output", async () => {
    const stripped = await stripOutputPngChunks(
      pngWithChunks(["IHDR", "deBG", "iTXt", "IDAT", "IEND"]),
    );
    await expect(scanOutputPngChunks(stripped)).resolves.toEqual({
      status: "checked",
      unexpectedChunks: [],
    });
  });

  it("fails malformed or trailing PNG bytes", async () => {
    const malformed = new Blob([
      new Uint8Array([
        137, 80, 78, 71, 13, 10, 26, 10,
        0, 0, 0, 0, 73, 69, 78, 68, 0, 0, 0, 0, 1,
      ]),
    ]);
    expect((await scanOutputPngChunks(malformed)).status).toBe("error");
  });
});
