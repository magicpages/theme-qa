// Compares the base branch's screenshots with the pull request's. Both sets are
// taken on the same Ghost, with the same content and the same browser, so any
// difference comes from the theme.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

// Rows of unchanged page kept above and below a change, for context.
const MARGIN = 120;
// The report shows at most this many rows per screenshot; a change taller than
// that is cut off, and the report says so.
const MAX_ROWS = 3000;

/**
 * Pads an image with white to `width` × `height`, so pages of different
 * heights still compare row by row from the top.
 */
function pad(png, width, height) {
  if (png.width === width && png.height === height) return png.data;
  const out = Buffer.alloc(width * height * 4, 255);
  for (let y = 0; y < png.height; y++) {
    png.data.copy(out, y * width * 4, y * png.width * 4, (y + 1) * png.width * 4);
  }
  return out;
}

// Screenshots are opaque, so the report's PNGs leave out the alpha channel.
const encode = (png) => PNG.sync.write(png, { colorType: 2 });

/** Rows [top, top + rows) of a screenshot; the original file when that's all of it. */
function crop(file, image, data, width, top, rows) {
  if (top === 0 && rows === image.height && width === image.width) return file;
  const png = new PNG({ width, height: rows });
  data.copy(png.data, 0, top * width * 4, (top + rows) * width * 4);
  return encode(png);
}

/**
 * The pull request's pixels as a pale outline in five shades of grey, with
 * changed pixels in red. Few shades keep the PNG small.
 */
function highlight(after, mask, width, top, rows) {
  const png = new PNG({ width, height: rows });
  for (let i = 0; i < width * rows; i++) {
    const src = (top * width + i) * 4;
    const dst = i * 4;
    if (mask[src + 3]) {
      png.data[dst] = 230;
      png.data[dst + 1] = 0;
      png.data[dst + 2] = 40;
    } else {
      const grey = 0.299 * after[src] + 0.587 * after[src + 1] + 0.114 * after[src + 2];
      png.data[dst] = png.data[dst + 1] = png.data[dst + 2] = 215 + Math.round(grey / 64) * 10;
    }
    png.data[dst + 3] = 255;
  }
  return encode(png);
}

/**
 * Compares two PNGs. Returns null when they look the same; otherwise the
 * number of changed pixels, both sizes and cropped PNGs of the changed rows.
 * Exported for tests.
 * @param {Buffer} beforeFile
 * @param {Buffer} afterFile
 */
export function diffScreenshots(beforeFile, afterFile) {
  const before = PNG.sync.read(beforeFile);
  const after = PNG.sync.read(afterFile);
  const width = Math.max(before.width, after.width);
  const height = Math.max(before.height, after.height);
  const a = pad(before, width, height);
  const b = pad(after, width, height);
  const mask = Buffer.alloc(width * height * 4);
  const pixels = pixelmatch(a, b, mask, width, height, { threshold: 0.1, diffMask: true });
  const resized = before.width !== after.width || before.height !== after.height;
  if (!pixels && !resized) return null;

  let first = -1;
  let last = -1;
  for (let y = 0; y < height; y++) {
    const row = mask.subarray(y * width * 4, (y + 1) * width * 4);
    for (let x = 3; x < row.length; x += 4) {
      if (row[x]) {
        if (first < 0) first = y;
        last = y;
        break;
      }
    }
  }
  // Only the size changed (the page grew by blank space): show the new rows.
  if (first < 0) {
    first = Math.min(before.height, after.height);
    last = height - 1;
  }

  const top = Math.max(0, first - MARGIN);
  const bottom = Math.min(height, last + 1 + MARGIN);
  const rows = Math.min(bottom - top, MAX_ROWS);
  return {
    pixels,
    before: { width: before.width, height: before.height },
    after: { width: after.width, height: after.height },
    rows: { first, last, top, shown: rows, cut: bottom - top > MAX_ROWS },
    images: {
      before: crop(beforeFile, before, a, width, top, rows),
      after: crop(afterFile, after, b, width, top, rows),
      diff: highlight(b, mask, width, top, rows),
    },
  };
}

/**
 * Compares every planned screenshot in `baseDir` with the one in `prDir`.
 * @param {ReturnType<typeof import('./plan.mjs').screenshotPlan>} plan
 * @param {{ baseDir: string, prDir: string }} dirs
 */
export function compareScreenshots(plan, { baseDir, prDir }) {
  return plan.map((shot) => ({
    ...shot,
    change: diffScreenshots(
      readFileSync(join(baseDir, shot.file)),
      readFileSync(join(prDir, shot.file)),
    ),
  }));
}
