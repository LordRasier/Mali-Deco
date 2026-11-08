import sharp from 'sharp';

export type ImageWidth = 320 | 800 | 1600;
export type ImageDerivatives = Record<ImageWidth, Buffer>;
export interface ProcessedImage {
  width: number;
  height: number;
  derivatives: ImageDerivatives;
}

const maxBytes = 5 * 1024 * 1024;
const maxPixels = 16_000_000;
const widths: ImageWidth[] = [320, 800, 1600];
let active = 0;
export class ImageProcessingBusy extends Error {
  constructor() {
    super('Image processing is busy');
    this.name = 'ImageProcessingBusy';
  }
}

export class ImageOutputTooLarge extends Error {
  constructor() {
    super('Image derivatives exceed the output size limit');
    this.name = 'ImageOutputTooLarge';
  }
}

function hasCompleteContainer(buffer: Buffer, format: string): boolean {
  if (format === 'jpeg') return buffer.length >= 4 && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9;
  if (format === 'webp') return buffer.length >= 12 && buffer.readUInt32LE(4) + 8 === buffer.length;
  if (format !== 'png' || buffer.length < 20) return false;
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > buffer.length) return false;
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (['acTL', 'fcTL', 'fdAT'].includes(type)) return false;
    if (type === 'IEND') return length === 0 && end === buffer.length;
    offset = end;
  }
  return false;
}
/** Decode and normalize an untrusted image, limiting simultaneous processing to one input. */
export async function processImage(buffer: Buffer): Promise<ProcessedImage> {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > maxBytes) {
    throw new Error('Invalid image size');
  }
  if (active >= 1) throw new ImageProcessingBusy();
  active++;
  try {
    const options = { failOn: 'warning' as const, limitInputPixels: maxPixels, animated: true };
    const metadata = await sharp(buffer, options).metadata();
    if (!metadata.format || !['jpeg', 'png', 'webp'].includes(metadata.format) || !hasCompleteContainer(buffer, metadata.format) ||
        !metadata.width || !metadata.height || metadata.width > 8000 || metadata.height > 8000 ||
        metadata.width * metadata.height > maxPixels || (metadata.pages ?? 1) !== 1) {
      throw new Error('Unsupported image');
    }
    const orientation = metadata.orientation ?? 1;
    const swap = orientation >= 5 && orientation <= 8;
    const width = swap ? metadata.height : metadata.width;
    const height = swap ? metadata.width : metadata.height;
    const derivatives = {} as ImageDerivatives;
    let totalBytes = 0;
    for (const size of widths) {
      const derivative = await sharp(buffer, options).rotate().resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true }).webp().toBuffer();
      totalBytes += derivative.length;
      if (derivative.length > 384 * 1024 || totalBytes > 1024 * 1024) throw new ImageOutputTooLarge();
      derivatives[size] = derivative;
    }
    return { width, height, derivatives };
  } finally {
    active--;
  }
}
