// Base group "visibility": gated posts, as anonymous visitors see them.

import * as k from './lexical.mjs';

const body = (audience) => [
  k.paragraph(`This part is the public preview. Everyone can read it.`),
  k.paragraph('Themes show a call to action below it for visitors who are not allowed in.'),
  k.paywall(),
  k.paragraph(`Only ${audience} can read this part.`),
  k.paragraph('Nobody else should see it in the page source either.'),
];

/** @param {import('./context.mjs').SeedContext} ctx */
export async function seedVisibility(ctx, { media, date }) {
  const [members, paid, membersNoPreview] = await Promise.all([
    ctx.post({
      title: 'A members-only post',
      slug: 'members-only',
      visibility: 'members',
      tags: ['Visibility'],
      featureImage: { ...media.images.wide, alt: 'A green gradient' },
      publishedAt: date(0),
      cards: body('members'),
    }),
    ctx.post({
      title: 'A paid-members-only post',
      slug: 'paid-only',
      visibility: 'paid',
      tags: ['Visibility'],
      publishedAt: date(-1),
      cards: body('paying members'),
    }),
    ctx.post({
      title: 'A members-only post without a preview',
      slug: 'members-only-no-preview',
      visibility: 'members',
      tags: ['Visibility'],
      publishedAt: date(-2),
      cards: [k.paragraph('Without a preview divider, visitors see nothing of this.')],
    }),
  ]);
  return { members, paid, membersNoPreview };
}
