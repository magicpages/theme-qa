import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as k from '../src/ghost/seed/lexical.mjs';
import {
  CARDS,
  findCardMarkers,
  supportedCards,
  versionAtLeast,
} from '../src/ghost/seed/cards.mjs';
import { idFromPath, limiter, pageEntry, settingsPayload } from '../src/ghost/seed/context.mjs';
import { postsPerPage } from '../src/ghost/seed/pagination.mjs';
import { uploadTarget } from '../src/ghost/seed/media.mjs';
import { TITLES } from '../src/ghost/seed/titles.mjs';
import { AUTHORS, importFile } from '../src/ghost/seed/authors.mjs';

test('text marks combine into the Lexical format bitmask', () => {
  assert.equal(k.text('x', { bold: true, italic: true, code: true }).format, 1 | 2 | 16);
  assert.throws(() => k.text('x', { blink: true }), /Unknown text mark "blink"/);
});

test('nested list items carry their depth as indent, four levels deep', () => {
  const list = k.list([
    { content: 'a', children: [{ content: 'b', children: [{ content: 'c', children: ['d'] }] }] },
  ]);
  let node = list;
  const indents = [];
  while (node) {
    const item = node.children[0];
    indents.push(item.indent);
    node = item.children.find((child) => child.type === 'list');
  }
  assert.deepEqual(indents, [0, 1, 2, 3]);
});

test('heading levels outside 1-6 are rejected', () => {
  assert.equal(k.heading('x', 6).tag, 'h6');
  assert.throws(() => k.heading('x', 7), /1-6/);
});

test('lexical() refuses things that are not nodes, e.g. a forgotten builder call', () => {
  assert.throws(() => k.lexical([k.paragraph('ok'), k.paragraph]), /Not a Lexical node/);
  const doc = JSON.parse(k.lexical([k.paragraph('ok')]));
  assert.equal(doc.root.type, 'root');
  assert.equal(doc.root.children[0].children[0].text, 'ok');
});

test('gallery puts three images per row', () => {
  const img = { src: '/content/images/a.jpg', width: 10, height: 10 };
  const rows = k.gallery([img, img, img, img]).images.map((i) => i.row);
  assert.deepEqual(rows, [0, 0, 0, 1]);
});

test('version checks accept the major.minor that /site/ reports', () => {
  assert.equal(versionAtLeast('6.65', '6.0.0'), true);
  assert.equal(versionAtLeast('5.130.6', '6.0.0'), false);
  assert.equal(versionAtLeast('6.0.0-alpha.1', '6.0.0'), true);
});

test('Ghost 5 skips the call-to-action card, Ghost 6 keeps every card', () => {
  const names = (version) => supportedCards(version).map((c) => c.name);
  assert.equal(names('5.130.6').includes('call-to-action'), false);
  assert.equal(names('6.65.0').length, CARDS.length);
});

test('card markers are unique, so one card cannot hide another missing one', () => {
  const markers = CARDS.map((c) => c.marker);
  assert.equal(new Set(markers).size, markers.length);
  const { found, missing } = findCardMarkers('<figure class="kg-card kg-image-card">', CARDS);
  assert.deepEqual(found, ['image']);
  assert.equal(missing.length, CARDS.length - 1);
});

test('page ids come from the path and stay stable', () => {
  assert.equal(idFromPath('/'), 'home');
  assert.equal(idFromPath('/tag/news/'), 'tag-news');
  assert.equal(idFromPath('/podcast/rss/?x=1'), 'podcast-rss');
  assert.deepEqual(pageEntry('/a/'), {
    id: 'a',
    path: '/a/',
    status: 200,
    screenshot: true,
    lighthouse: false,
  });
  assert.throws(() => pageEntry('a/'), /must start with "\/"/);
});

test('settings payload JSON-encodes navigation and rejects unknown keys', () => {
  const known = new Set(['title', 'navigation']);
  assert.deepEqual(
    settingsPayload({ title: 'T', navigation: [{ label: 'Home', url: '/' }] }, known),
    [
      { key: 'title', value: 'T' },
      { key: 'navigation', value: '[{"label":"Home","url":"/"}]' },
    ],
  );
  assert.throws(
    () => settingsPayload({ titel: 'T' }, known),
    /titel.*Known settings: navigation, title/,
  );
});

test('limiter never runs more tasks at once than allowed', async () => {
  const run = limiter(2);
  let active = 0;
  let peak = 0;
  const task = async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
  };
  await Promise.all(Array.from({ length: 6 }, () => run(task)));
  assert.equal(peak, 2);
  await assert.rejects(
    run(async () => Promise.reject(new Error('boom'))),
    /boom/,
  );
});

test('posts_per_page falls back to Ghost default when the theme does not set it', () => {
  assert.equal(postsPerPage({ config: { posts_per_page: 12 } }), 12);
  assert.equal(postsPerPage({}), 5);
  assert.equal(postsPerPage({ config: { posts_per_page: '0' } }), 5);
});

test('uploads go to the endpoint Ghost accepts for the file type', () => {
  assert.equal(uploadTarget('/x/cover.JPG').path, '/images/upload/');
  assert.equal(uploadTarget('/x/episode.mp3').path, '/media/upload/');
  assert.equal(uploadTarget('/x/notes.pdf').path, '/files/upload/');
});

test('title fixtures hit the advertised extremes', () => {
  assert.equal([...TITLES.find((t) => t.slug === 'title-long').title].length, 200);
  assert.equal(/\s/.test(TITLES.find((t) => t.slug === 'title-no-spaces').title), false);
});

test('the staff import file gives every user the Author role', () => {
  const { data } = importFile(AUTHORS, '6.0.0').db[0];
  assert.equal(data.users.length, AUTHORS.length);
  assert.deepEqual(
    data.roles_users.map((r) => r.user_id),
    data.users.map((u) => u.id),
  );
  assert.ok(data.roles_users.every((r) => r.role_id === data.roles[0].id));
});
