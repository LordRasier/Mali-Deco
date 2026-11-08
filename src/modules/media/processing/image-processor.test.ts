import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import sharp from 'sharp';
import { ImageOutputTooLarge, ImageProcessingBusy, processImage } from './image-processor';

test('normalizes images to bounded WebP derivatives without metadata or enlargement', async () => {
  const input = await sharp({ create: { width: 640, height: 400, channels: 3, background: '#aabbcc' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const result = await processImage(input);
  assert.deepEqual([result.width, result.height], [400, 640]);
  for (const size of [320, 800, 1600] as const) {
    const meta = await sharp(result.derivatives[size]).metadata();
    assert.equal(meta.format, 'webp');
    assert.equal(meta.exif, undefined);
    assert.ok(meta.width! <= Math.min(size, 400));
    assert.ok(meta.height! <= Math.min(size, 640));
  }
});

test('rejects unsupported, truncated and oversized input', async () => {
  await assert.rejects(processImage(Buffer.from('<svg/>')));
  await assert.rejects(processImage(Buffer.alloc(5 * 1024 * 1024 + 1)));
  const png = await sharp({ create: { width: 100, height: 100, channels: 3, background: 'red' } }).png().toBuffer();
  await assert.rejects(processImage(png.subarray(0, png.length - 12)));
});

test('rejects excessive dimensions and pixel counts', async () => {
  const wide = await sharp({ create: { width: 8001, height: 1, channels: 3, background: 'red' } }).png().toBuffer();
  await assert.rejects(processImage(wide));
  const large = await sharp({ create: { width: 4001, height: 4000, channels: 3, background: 'red' } }).png().toBuffer();
  await assert.rejects(processImage(large));
});

test('fits a portrait image inside each square without enlargement', async () => {
  const input = await sharp({ create: { width: 400, height: 1200, channels: 3, background: 'blue' } }).png().toBuffer();
  const result = await processImage(input);
  assert.deepEqual([result.width, result.height], [400, 1200]);
  for (const size of [320, 800, 1600] as const) {
    const metadata = await sharp(result.derivatives[size]).metadata();
    assert.ok(metadata.width! <= size && metadata.height! <= size);
    assert.ok(metadata.width! <= 400 && metadata.height! <= 1200);
  }
});

test('rejects a second concurrent image instead of queuing it', async () => {
  const input = await sharp({ create: { width: 500, height: 500, channels: 3, background: 'green' } }).png().toBuffer();
  const first = processImage(input);
  await assert.rejects(processImage(input), ImageProcessingBusy);
  await first;
  await processImage(input);
});

test('rejects APNG control chunks even if the decoder reports only one page', async () => {
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } }).png().toBuffer();
  function chunk(type: string, data: Buffer): Buffer {
    const body = Buffer.concat([Buffer.from(type), data]);
    let crc = 0xffffffff;
    for (const byte of body) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    const result = Buffer.alloc(body.length + 8);
    result.writeUInt32BE(data.length, 0);
    body.copy(result, 4);
    result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
    return result;
  }
  const animationControl = Buffer.alloc(8);
  animationControl.writeUInt32BE(1, 0);
  const apng = Buffer.concat([png.subarray(0, 33), chunk('acTL', animationControl), png.subarray(33)]);
  const metadata = await sharp(apng, { animated: true, failOn: 'warning' }).metadata();
  assert.equal(metadata.pages ?? 1, 1);
  await assert.rejects(processImage(apng));
  for (const type of ['fcTL', 'fdAT']) {
    const marked = Buffer.concat([png.subarray(0, 33), chunk(type, Buffer.alloc(type === 'fcTL' ? 26 : 4)), png.subarray(33)]);
    await assert.rejects(processImage(marked));
  }
});


test('rejects derivatives exceeding the output size limit', async () => {
  const pixels = Buffer.alloc(1200 * 1200 * 3);
  let state = 123456789;
  for (let i = 0; i < pixels.length; i++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    pixels[i] = state & 255;
  }
  const input = await sharp(pixels, { raw: { width: 1200, height: 1200, channels: 3 } }).png().toBuffer();
  assert.ok(input.length <= 5 * 1024 * 1024);
  await assert.rejects(processImage(input), ImageOutputTooLarge);
  const small = await sharp({ create: { width: 5, height: 5, channels: 3, background: 'red' } }).png().toBuffer();
  await processImage(small);
});
