// Base group "titles": titles that break card grids and headers.

import * as k from './lexical.mjs';

// Exactly 200 characters.
const LONG_TITLE =
  'A deliberately long post title that keeps going well past the point where most designs expect it to stop, to see how cards, headers and navigation cope with two hundred characters of text in one swoop';

export const TITLES = [
  { slug: 'title-one-word', title: 'Hello' },
  { slug: 'title-long', title: LONG_TITLE },
  {
    slug: 'title-no-spaces',
    title: 'Pneumonoultramicroscopicsilicovolcanoconiosis-and-then-some-more-without-spaces',
  },
  { slug: 'title-emoji', title: '🎧 Emoji in a title 🚀 at both ends ✨' },
  { slug: 'title-rtl', title: 'كيف تبدأ مدونة صوتية ناجحة' },
  { slug: 'title-cjk', title: '如何开始一个成功的播客节目' },
];

/** @param {import('./context.mjs').SeedContext} ctx */
export async function seedTitles(ctx, { media, date }) {
  return Promise.all(
    TITLES.map(({ slug, title }, index) =>
      ctx.post({
        title,
        slug,
        tags: ['Titles'],
        // Alternate feature images so title length shows with and without one.
        featureImage: index % 2 === 0 ? { ...media.images.wide, alt: 'A green gradient' } : null,
        publishedAt: date(-index),
        cards: [k.paragraph(`A post that exists for its title: ${title}`)],
      }),
    ),
  );
}
