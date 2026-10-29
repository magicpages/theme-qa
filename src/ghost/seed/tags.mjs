// Base group "tags": tag archives and tag lists of every shape.

import * as k from './lexical.mjs';

export const LONG_TAG = 'A tag with a remarkably long name that keeps going';

/** @param {import('./context.mjs').SeedContext} ctx */
export async function seedTags(ctx, { media, date }) {
  await Promise.all([
    ctx.tag({
      name: 'Design',
      slug: 'design',
      description: 'A tag with a description, an image and an accent colour.',
      featureImage: media.images.wide.src,
      accentColor: '#2a9d8f',
    }),
    ctx.tag({ name: 'Bare', slug: 'bare' }),
    ctx.tag({ name: LONG_TAG, slug: 'long-tag' }),
    ctx.tag({ name: '🎧 Audio', slug: 'emoji-tag' }),
    ctx.tag({ name: '#internal-tag', slug: 'hash-internal-tag' }),
  ]);

  const many = Array.from({ length: 12 }, (_, i) => `Topic ${String(i + 1).padStart(2, '0')}`);
  return Promise.all([
    ctx.post({
      title: 'A post with a fully described tag',
      slug: 'tag-design',
      tags: ['Design', '#internal-tag'],
      featureImage: { ...media.images.square, alt: 'An orange gradient' },
      publishedAt: date(0),
      cards: [k.paragraph('The internal tag on this post must not show up anywhere.')],
    }),
    ctx.post({
      title: 'A post with a bare tag',
      slug: 'tag-bare',
      tags: ['Bare'],
      publishedAt: date(-1),
      cards: [k.paragraph('Its tag has no description, image or colour.')],
    }),
    ctx.post({
      title: 'A post with a long and an emoji tag',
      slug: 'tag-long-emoji',
      tags: [LONG_TAG, '🎧 Audio'],
      publishedAt: date(-2),
      cards: [k.paragraph('Tag pills have to cope with both.')],
    }),
    ctx.post({
      title: 'A post with fourteen tags',
      slug: 'tag-many',
      tags: ['Design', 'Bare', ...many],
      publishedAt: date(-3),
      cards: [k.paragraph('Tag lists have to wrap.')],
    }),
  ]);
}
