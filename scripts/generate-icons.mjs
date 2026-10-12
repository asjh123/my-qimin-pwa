import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ICON_DIR = resolve(ROOT, "public/icons");

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

function chunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function insideRoundedRect(x, y, left, top, right, bottom, radius) {
  if (x >= left + radius && x <= right - radius) return y >= top && y <= bottom;
  if (y >= top + radius && y <= bottom - radius) return x >= left && x <= right;
  const cx = x < left + radius ? left + radius : right - radius;
  const cy = y < top + radius ? top + radius : bottom - radius;
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function makeIcon(size, maskable = false) {
  const width = size;
  const height = size;
  const pixels = Buffer.alloc(width * height * 4);
  const bg = [244, 239, 228, 255];
  const green = [49, 92, 73, 255];
  const gold = [213, 168, 77, 255];
  const paper = [255, 252, 244, 255];
  const scale = size / 512;
  const margin = (maskable ? 108 : 72) * scale;
  const left = margin;
  const top = (maskable ? 102 : 66) * scale;
  const right = size - margin;
  const bottom = size - (maskable ? 102 : 66) * scale;
  const radius = 34 * scale;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let color = bg;
      if (insideRoundedRect(x, y, left, top, right, bottom, radius)) color = green;

      const inner = 28 * scale;
      if (
        insideRoundedRect(
          x,
          y,
          left + inner,
          top + inner,
          right - inner,
          bottom - inner,
          17 * scale,
        )
      ) {
        color = paper;
      }

      const spineX = Math.round(size / 2);
      if (
        Math.abs(x - spineX) <= 5 * scale &&
        y >= top + inner &&
        y <= bottom - inner
      ) {
        color = gold;
      }

      const lineStart = left + 52 * scale;
      const lineEnd = right - 52 * scale;
      for (const lineY of [204, 256, 308]) {
        if (
          y >= lineY * scale - 5 * scale &&
          y <= lineY * scale + 5 * scale &&
          x >= lineStart &&
          x <= lineEnd &&
          Math.abs(x - spineX) > 20 * scale
        ) {
          color = gold;
        }
      }

      const offset = (y * width + x) * 4;
      pixels.set(color, offset);
    }
  }

  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * 4 + 1);
    raw[rowOffset] = 0;
    pixels.copy(raw, rowOffset + 1, y * width * 4, (y + 1) * width * 4);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(ICON_DIR, { recursive: true });
writeFileSync(resolve(ICON_DIR, "icon-192.png"), makeIcon(192));
writeFileSync(resolve(ICON_DIR, "icon-512.png"), makeIcon(512));
writeFileSync(resolve(ICON_DIR, "icon-maskable-512.png"), makeIcon(512, true));
console.log("已生成 3 个原创书卷图标：192px、512px、512px maskable");
