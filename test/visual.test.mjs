import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { diffScreenshots } from '../src/visual/diff.mjs';

/** A white PNG with a black band over `rows` [from, to). */
function page(width, height, band) {
  const png = new PNG({ width, height });
  png.data.fill(255);
  if (band) {
    for (let y = band[0]; y < band[1]; y++) {
      png.data.fill(0, y * width * 4, (y + 1) * width * 4);
      for (let x = 0; x < width; x++) png.data[(y * width + x) * 4 + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

const size = (buffer) => {
  const png = PNG.sync.read(buffer);
  return { width: png.width, height: png.height };
};

test('visual: identical screenshots are no change', () => {
  assert.equal(diffScreenshots(page(20, 400, [10, 20]), page(20, 400, [10, 20])), null);
});

test('visual: a change is cropped to its rows plus context', () => {
  const change = diffScreenshots(page(20, 1000), page(20, 1000, [500, 510]));
  assert.equal(change.pixels, 200);
  assert.deepEqual(
    { first: change.rows.first, last: change.rows.last, top: change.rows.top },
    { first: 500, last: 509, top: 380 },
  );
  assert.equal(change.rows.shown, 10 + 2 * 120);
  for (const image of Object.values(change.images)) {
    assert.deepEqual(size(image), { width: 20, height: 250 });
  }
});

test('visual: a page that only grows by blank space shows the new rows', () => {
  const change = diffScreenshots(page(20, 300), page(20, 400));
  assert.equal(change.pixels, 0);
  assert.deepEqual(change.before, { width: 20, height: 300 });
  assert.deepEqual(change.after, { width: 20, height: 400 });
  assert.equal(change.rows.first, 300);
  assert.equal(change.rows.last, 399);
});

test('visual: content pushed down past the old end of the page is compared', () => {
  const change = diffScreenshots(page(20, 300, [280, 300]), page(20, 400, [380, 400]));
  assert.ok(change.pixels > 0);
  assert.equal(change.rows.first, 280);
  assert.equal(change.rows.last, 399);
});

test('visual: very tall changes are cut off and say so', () => {
  const change = diffScreenshots(page(4, 5000), page(4, 5000, [0, 5000]));
  assert.equal(change.rows.shown, 3000);
  assert.equal(change.rows.cut, true);
});
