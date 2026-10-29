// Shared base content: site settings, the core posts every run needs, and
// the optional groups from BASE_GROUPS.

import * as k from './lexical.mjs';
import { seedCards } from './cards.mjs';
import { seedTypography } from './typography.mjs';
import { seedTitles } from './titles.mjs';
import { seedImages } from './images.mjs';
import { seedI18n } from './i18n.mjs';
import { seedAuthors, AUTHORS } from './authors.mjs';
import { seedTags } from './tags.mjs';
import { seedVisibility } from './visibility.mjs';
import { seedPagination, postsPerPage } from './pagination.mjs';
import { BASE_DATE } from './context.mjs';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * Each group gets its own block of dates so post order on the homepage is
 * fixed no matter which requests finish first. Lower slot = newer posts.
 */
const GROUPS = {
  titles: { slot: 1, seed: seedTitles },
  images: { slot: 2, seed: seedImages },
  i18n: { slot: 3, seed: seedI18n },
  tags: { slot: 4, seed: seedTags },
  authors: { slot: 5, seed: seedAuthors },
  visibility: { slot: 6, seed: seedVisibility },
  cards: { slot: 7, seed: seedCards },
  typography: { slot: 8, seed: seedTypography },
  pagination: { slot: 30, seed: seedPagination },
};

/** @param {number} slot @returns {(hoursOffset: number) => string} */
export function dateSlot(slot) {
  return (hours = 0) => new Date(BASE_DATE - slot * DAY + hours * HOUR).toISOString();
}

/** Site settings for stable output; `media` holds uploaded fixture URLs. */
export function siteSettings(media, { exclude }) {
  const navigation = [
    { label: 'Home', url: '/' },
    { label: 'About', url: '/about/' },
    ...(exclude.includes('typography') ? [] : [{ label: 'Style guide', url: '/style-guide/' }]),
    { label: 'Sign up', url: '#/portal/signup' },
    { label: 'Search', url: '#/search' },
    { label: 'Example.com', url: 'https://example.com/' },
  ];
  return {
    title: 'Theme QA',
    description: 'A test site for Ghost themes, filled with deliberately awkward content.',
    accent_color: '#e63946',
    logo: media.images.logo.src,
    icon: media.images.icon.src,
    cover_image: media.images.landscape.src,
    locale: 'en',
    timezone: 'Etc/UTC',
    navigation,
    secondary_navigation: [
      { label: 'General', url: '/tag/general/' },
      { label: 'Sign in', url: '#/portal/signin' },
      { label: 'RSS', url: '/rss/' },
    ],
    facebook: 'example',
    twitter: '@example',
    threads: '@example',
    bluesky: 'example.bsky.social',
    mastodon: '@example@mastodon.social',
    instagram: 'example',
    youtube: '@example',
    linkedin: 'example',
    tiktok: '@example',
  };
}

const path = (resource) => new URL(resource.url).pathname;

/**
 * @param {ReturnType<typeof import('./context.mjs').createSeedContext>} ctx
 * @param {{ config: any, media: any, owner: any, log: (msg: string) => void }} options
 * @returns {Promise<{ results: Record<string, any> }>}
 */
export async function seedBase(ctx, { config, media, owner, log }) {
  const exclude = config.base.exclude;
  const perPage = postsPerPage(config.pkg);

  await ctx.api.put(`/users/${owner.id}/`, {
    users: [
      {
        slug: 'theme-qa',
        bio: 'The account that owns this test site.',
        profile_image: media.images.avatar.src,
      },
    ],
  });
  ctx.resetUsers();

  const core = dateSlot(0);
  const [plain, about] = await Promise.all([
    ctx.post({
      title: 'A plain post',
      slug: 'plain-post',
      excerpt: 'The most ordinary post on the site: text, one image, one tag.',
      tags: ['General'],
      featureImage: { ...media.images.wide, alt: 'A green gradient' },
      featured: true,
      publishedAt: core(0),
      cards: [
        k.paragraph(
          'An ordinary post. Most posts on most sites look like this one: a few paragraphs, a heading, an image.',
        ),
        k.heading('A heading', 2),
        k.paragraph('Another paragraph, followed by an image.'),
        k.image({ ...media.images.landscape, alt: 'A blue gradient', caption: 'An image' }),
        k.paragraph('The last paragraph.'),
      ],
    }),
    ctx.page({
      title: 'About',
      slug: 'about',
      publishedAt: core(-1),
      cards: [k.paragraph('A plain page, linked from the navigation.')],
    }),
  ]);

  const results = { plain, about };
  const groups = Object.keys(GROUPS).filter((name) => !exclude.includes(name));
  if (exclude.length) log(`Base content: skipping ${exclude.join(', ')}`);
  await Promise.all(
    groups.map(async (name) => {
      const { slot, seed } = GROUPS[name];
      results[name] = await seed(ctx, { media, date: dateSlot(slot), log, perPage });
    }),
  );

  registerBasePages(ctx, results);
  return { results };
}

function registerBasePages(ctx, results) {
  ctx.url('/', { id: 'home', lighthouse: true });
  ctx.url(path(results.plain), { id: 'post', lighthouse: true });
  // No Lighthouse here: its accessibility and SEO audits would mostly score
  // Ghost's card markup, which the axe check already filters out.
  if (results.cards) ctx.url(path(results.cards.kitchenSink), { id: 'post-kitchen-sink' });
  if (results.typography) ctx.url(path(results.typography), { id: 'page-style-guide' });
  ctx.url('/tag/general/', { id: 'tag' });
  ctx.url('/author/theme-qa/', { id: 'author' });
  if (results.visibility) {
    ctx.url(path(results.visibility.members), { id: 'post-members' });
    ctx.url(path(results.visibility.paid), { id: 'post-paid' });
  }

  // Awkward variants worth a screenshot, but not a Lighthouse run.
  if (results.titles) ctx.url('/title-long/', { id: 'post-long-title' });
  if (results.images) ctx.url('/image-none/', { id: 'post-no-image' });
  if (results.i18n) ctx.url('/i18n-arabic/', { id: 'post-rtl' });
  if (results.tags) ctx.url('/tag/design/', { id: 'tag-full' });
  if (results.authors) {
    ctx.url(`/author/${AUTHORS.find((a) => a.key === 'full').slug}/`, { id: 'author-full' });
  }
}
