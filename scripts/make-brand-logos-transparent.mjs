import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Jimp } from 'jimp';

const BRANDS_DIR = join(process.cwd(), 'public', 'brands');
const TOLERANCE = 42;

function colorClose(a, b) {
  return (
    Math.abs(a[0] - b[0]) <= TOLERANCE &&
    Math.abs(a[1] - b[1]) <= TOLERANCE &&
    Math.abs(a[2] - b[2]) <= TOLERANCE
  );
}

function floodTransparent(image, startX, startY) {
  const { width: w, height: h, data } = image.bitmap;
  const idx = (y, x) => (y * w + x) * 4;
  const getRgb = (x, y) => [data[idx(y, x)], data[idx(y, x) + 1], data[idx(y, x) + 2]];
  const getAlpha = (x, y) => data[idx(y, x) + 3];
  const setAlpha = (x, y, alpha) => {
    data[idx(y, x) + 3] = alpha;
  };

  if (getAlpha(startX, startY) === 0) return;

  const target = getRgb(startX, startY);
  const stack = [[startX, startY]];
  const visited = new Uint8Array(w * h);

  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const pos = y * w + x;
    if (visited[pos]) continue;
    visited[pos] = 1;
    if (getAlpha(x, y) === 0) continue;
    if (!colorClose(getRgb(x, y), target)) continue;
    setAlpha(x, y, 0);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
}

async function processFile(filePath) {
  const image = await Jimp.read(filePath);
  const w = image.bitmap.width;
  const h = image.bitmap.height;
  const corners = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
  ];
  for (const [x, y] of corners) {
    floodTransparent(image, x, y);
  }
  await image.write(filePath);
}

const files = (await readdir(BRANDS_DIR)).filter((f) => f.endsWith('.png'));
for (const file of files) {
  await processFile(join(BRANDS_DIR, file));
  console.log(`transparent: ${file}`);
}
