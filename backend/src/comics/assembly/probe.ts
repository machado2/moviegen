import { readFile } from 'node:fs/promises';

export interface ImageDimensions {
  widthPx: number | null;
  heightPx: number | null;
}

/** Read pixel dimensions from a PNG or JPEG file header. No external deps. */
export async function probeImage(filePath: string): Promise<ImageDimensions> {
  const buf = await readFile(filePath);

  // PNG: 8-byte signature, then IHDR chunk with width@16, height@20 (big-endian).
  if (
    buf.length >= 24 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
  ) {
    return { widthPx: buf.readUInt32BE(16), heightPx: buf.readUInt32BE(20) };
  }

  // JPEG: scan for a Start-Of-Frame marker (SOFn) and read its dimensions.
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buf.length) {
      if (buf[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = buf[offset + 1]!;
      // SOF0..SOF15 except DHT(c4)/JPG(c8)/DAC(cc) carry frame dimensions.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { heightPx: buf.readUInt16BE(offset + 5), widthPx: buf.readUInt16BE(offset + 7) };
      }
      const segLen = buf.readUInt16BE(offset + 2);
      offset += 2 + segLen;
    }
  }

  return { widthPx: null, heightPx: null };
}
