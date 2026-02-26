/**
 * Converts Apple's CgBI PNG format (used in iOS app bundles) to standard PNG.
 * CgBI PNGs differ from standard PNGs:
 * - Extra "CgBI" chunk before IHDR
 * - IDAT uses raw deflate (no zlib header/checksum)
 * - Pixel channels are BGRA instead of RGBA
 * - Alpha is pre-multiplied
 */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function readUint32BE(data: Uint8Array, offset: number): number {
  return (
    ((data[offset] << 24) |
      (data[offset + 1] << 16) |
      (data[offset + 2] << 8) |
      data[offset + 3]) >>>
    0
  );
}

interface PNGChunk {
  type: string;
  data: Uint8Array;
}

function parsePNGChunks(data: Uint8Array): PNGChunk[] {
  const chunks: PNGChunk[] = [];
  let offset = 8; // skip PNG signature

  while (offset < data.length) {
    if (offset + 8 > data.length) break;
    const length = readUint32BE(data, offset);
    const type = String.fromCharCode(
      data[offset + 4],
      data[offset + 5],
      data[offset + 6],
      data[offset + 7]
    );
    const chunkData = data.slice(offset + 8, offset + 8 + length);
    chunks.push({ type, data: chunkData });
    offset += 12 + length; // 4 length + 4 type + data + 4 CRC
    if (type === "IEND") break;
  }

  return chunks;
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function unfilterScanlines(
  raw: Uint8Array,
  width: number,
  height: number,
  bpp: number
): Uint8Array {
  const bytesPerRow = width * bpp;
  const pixels = new Uint8Array(width * height * bpp);

  let srcOffset = 0;

  for (let y = 0; y < height; y++) {
    const filterType = raw[srcOffset++];
    const dstRowStart = y * bytesPerRow;
    const prevRowStart = (y - 1) * bytesPerRow;

    for (let x = 0; x < bytesPerRow; x++) {
      const rawByte = raw[srcOffset + x];
      const a = x >= bpp ? pixels[dstRowStart + x - bpp] : 0;
      const b = y > 0 ? pixels[prevRowStart + x] : 0;
      const c = x >= bpp && y > 0 ? pixels[prevRowStart + x - bpp] : 0;

      let result: number;
      switch (filterType) {
        case 0:
          result = rawByte;
          break;
        case 1:
          result = (rawByte + a) & 0xff;
          break;
        case 2:
          result = (rawByte + b) & 0xff;
          break;
        case 3:
          result = (rawByte + Math.floor((a + b) / 2)) & 0xff;
          break;
        case 4:
          result = (rawByte + paethPredictor(a, b, c)) & 0xff;
          break;
        default:
          result = rawByte;
      }

      pixels[dstRowStart + x] = result;
    }

    srcOffset += bytesPerRow;
  }

  return pixels;
}

async function rawInflate(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();

  const buf = new ArrayBuffer(data.byteLength);
  new Uint8Array(buf).set(data);
  const writePromise = writer.write(buf).then(() => writer.close());

  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  const readPromise = (async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalLength += value.length;
    }
  })();

  await Promise.all([writePromise, readPromise]);

  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/**
 * Checks if a PNG is in CgBI format and converts it to standard PNG.
 * Returns a Blob URL string for the image, or null on failure.
 */
export async function convertPngToStandard(
  data: Uint8Array
): Promise<string | null> {
  // Verify PNG signature
  for (let i = 0; i < 8; i++) {
    if (data[i] !== PNG_SIGNATURE[i]) return null;
  }

  const chunks = parsePNGChunks(data);
  const isCgBI = chunks.some((c) => c.type === "CgBI");

  if (!isCgBI) {
    // Standard PNG - just create blob URL directly
    const buf = new ArrayBuffer(data.byteLength);
    new Uint8Array(buf).set(data);
    const blob = new Blob([buf], { type: "image/png" });
    return URL.createObjectURL(blob);
  }

  // Parse IHDR
  const ihdr = chunks.find((c) => c.type === "IHDR");
  if (!ihdr) return null;

  const width = readUint32BE(ihdr.data, 0);
  const height = readUint32BE(ihdr.data, 4);
  const colorType = ihdr.data[9];

  // Bytes per pixel: colorType 6 = RGBA (4), colorType 2 = RGB (3)
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 4;

  // Concatenate all IDAT chunks
  const idatChunks = chunks.filter((c) => c.type === "IDAT");
  const totalIdatLen = idatChunks.reduce((s, c) => s + c.data.length, 0);
  const compressed = new Uint8Array(totalIdatLen);
  let pos = 0;
  for (const chunk of idatChunks) {
    compressed.set(chunk.data, pos);
    pos += chunk.data.length;
  }

  try {
    // CgBI uses raw deflate (no zlib header)
    const inflated = await rawInflate(compressed);

    // Unfilter scanlines
    const pixels = unfilterScanlines(inflated, width, height, bpp);

    // Swap BGRA → RGBA and un-premultiply alpha
    for (let i = 0; i < width * height; i++) {
      const offset = i * bpp;
      const b = pixels[offset];
      const r = pixels[offset + 2];

      if (bpp === 4) {
        const a = pixels[offset + 3];
        if (a > 0 && a < 255) {
          // Un-premultiply alpha
          pixels[offset] = Math.min(255, Math.round((r * 255) / a));
          pixels[offset + 1] = Math.min(
            255,
            Math.round((pixels[offset + 1] * 255) / a)
          );
          pixels[offset + 2] = Math.min(255, Math.round((b * 255) / a));
        } else {
          // Swap B and R
          pixels[offset] = r;
          pixels[offset + 2] = b;
        }
      } else {
        // RGB only - just swap B and R
        pixels[offset] = r;
        pixels[offset + 2] = b;
      }
    }

    // Render to canvas and export as standard PNG
    if (typeof document === "undefined") return null;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const imageData = ctx.createImageData(width, height);

    if (bpp === 4) {
      imageData.data.set(pixels);
    } else {
      // RGB → RGBA
      for (let i = 0; i < width * height; i++) {
        imageData.data[i * 4] = pixels[i * 3];
        imageData.data[i * 4 + 1] = pixels[i * 3 + 1];
        imageData.data[i * 4 + 2] = pixels[i * 3 + 2];
        imageData.data[i * 4 + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    return new Promise<string | null>((resolve) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(URL.createObjectURL(blob));
          } else {
            resolve(null);
          }
        },
        "image/png"
      );
    });
  } catch {
    return null;
  }
}
