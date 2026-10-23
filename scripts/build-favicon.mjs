import { deflateSync } from "node:zlib";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const size = 128;
const outputSize = 64;
const pixels = Buffer.alloc(size * size * 4);
const purple = [113, 104, 245];
const blue = [68, 56, 202];

function setPixel(x, y, color) {
  const index = (y * size + x) * 4;
  pixels[index] = color[0];
  pixels[index + 1] = color[1];
  pixels[index + 2] = color[2];
  pixels[index + 3] = color[3] ?? 255;
}

function line(x1, y1, x2, y2, width, color) {
  x1 *= 2;
  y1 *= 2;
  x2 *= 2;
  y2 *= 2;
  width *= 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = dx * dx + dy * dy;
  for (
    let y = Math.max(0, Math.floor(Math.min(y1, y2) - width));
    y < Math.min(size, Math.ceil(Math.max(y1, y2) + width));
    y++
  )
    for (
      let x = Math.max(0, Math.floor(Math.min(x1, x2) - width));
      x < Math.min(size, Math.ceil(Math.max(x1, x2) + width));
      x++
    ) {
      const t = length ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / length)) : 0;
      if ((x - x1 - t * dx) ** 2 + (y - y1 - t * dy) ** 2 <= (width * width) / 4) setPixel(x, y, color);
    }
}

function circle(cx, cy, radius, color) {
  cx *= 2;
  cy *= 2;
  radius *= 2;
  for (let y = Math.max(0, Math.floor(cy - radius)); y < Math.min(size, Math.ceil(cy + radius)); y++)
    for (let x = Math.max(0, Math.floor(cx - radius)); x < Math.min(size, Math.ceil(cx + radius)); x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radius * radius) setPixel(x, y, color);
}

// Rounded, softly diagonal purple tile.
for (let y = 0; y < size; y++)
  for (let x = 0; x < size; x++) {
    const left = x < 38 ? 38 - x : x > 90 ? x - 90 : 0;
    const top = y < 38 ? 38 - y : y > 90 ? y - 90 : 0;
    if (left * left + top * top <= 38 * 38) {
      const t = Math.min(1, (x + y) / 256);
      setPixel(
        x,
        y,
        purple.map((value, channel) => Math.round(value * (1 - t) + blue[channel] * t)),
      );
    }
  }

const white = [255, 255, 255];
const pale = [210, 207, 255];
// Family home outline, open doorway, and a small guiding star.
line(24, 62, 64, 28, 7, white);
line(64, 28, 104, 62, 7, white);
line(29, 60, 29, 94, 7, white);
line(99, 60, 99, 94, 7, white);
line(29, 96, 47, 96, 7, white);
line(81, 96, 99, 96, 7, white);
line(48, 96, 48, 72, 6, white);
line(80, 96, 80, 72, 6, white);
line(48, 72, 54, 61, 6, white);
line(54, 61, 64, 57, 6, white);
line(64, 57, 74, 61, 6, white);
line(74, 61, 80, 72, 6, white);
line(92, 26, 99, 26, 3, pale);
line(95.5, 22.5, 95.5, 29.5, 3, pale);
circle(95.5, 26, 2, pale);

// Downsample with a 2x2 box filter for clean antialiased edges.
const rgba = Buffer.alloc(outputSize * outputSize * 4);
for (let y = 0; y < outputSize; y++)
  for (let x = 0; x < outputSize; x++) {
    const target = (y * outputSize + x) * 4;
    for (let channel = 0; channel < 4; channel++) {
      let sum = 0;
      for (let oy = 0; oy < 2; oy++)
        for (let ox = 0; ox < 2; ox++) sum += pixels[((y * 2 + oy) * size + x * 2 + ox) * 4 + channel];
      rgba[target + channel] = Math.round(sum / 4);
    }
  }

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

const scanlines = Buffer.alloc((outputSize * 4 + 1) * outputSize);
for (let y = 0; y < outputSize; y++) {
  const row = y * (outputSize * 4 + 1);
  scanlines[row] = 0;
  rgba.copy(scanlines, row + 1, y * outputSize * 4, (y + 1) * outputSize * 4);
}
const header = Buffer.alloc(13);
header.writeUInt32BE(outputSize, 0);
header.writeUInt32BE(outputSize, 4);
header[8] = 8;
header[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", header),
  chunk("IDAT", deflateSync(scanlines)),
  chunk("IEND", Buffer.alloc(0)),
]);

const directory = Buffer.alloc(22);
directory.writeUInt16LE(0, 0);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(1, 4);
directory[6] = outputSize;
directory[7] = outputSize;
directory.writeUInt16LE(1, 10);
directory.writeUInt16LE(32, 12);
directory.writeUInt32LE(png.length, 14);
directory.writeUInt32LE(directory.length, 18);
await writeFile(resolve(root, "apps/web/public/favicon.ico"), Buffer.concat([directory, png]));
console.log("Generated apps/web/public/favicon.ico");
