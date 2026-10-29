// Base group "pagination": enough posts that the home collection has a
// second page on its own, whatever else is switched off.

import * as k from './lexical.mjs';

/** Ghost's own default when a theme doesn't set `config.posts_per_page`. */
export const GHOST_POSTS_PER_PAGE = 5;

/** @param {Record<string, any>} pkg theme package.json */
export function postsPerPage(pkg) {
  const value = Number(pkg?.config?.posts_per_page);
  return Number.isInteger(value) && value > 0 ? value : GHOST_POSTS_PER_PAGE;
}

/** @param {import('./context.mjs').SeedContext} ctx */
export async function seedPagination(ctx, { media, date, perPage }) {
  const count = perPage + 1;
  return Promise.all(
    Array.from({ length: count }, (_, index) => {
      const number = String(index + 1).padStart(2, '0');
      return ctx.post({
        title: `Archive post ${number}`,
        slug: `archive-${number}`,
        tags: ['Archive'],
        // Every third post has an image so archive grids show both kinds.
        featureImage:
          index % 3 === 0 ? { ...media.images.landscape, alt: 'A blue gradient' } : null,
        publishedAt: date(-index),
        cards: [k.paragraph(`Archive post number ${number}, here to fill the second page.`)],
      });
    }),
  );
}
