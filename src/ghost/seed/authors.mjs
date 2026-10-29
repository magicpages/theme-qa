// Base group "authors": staff profiles from complete to bare.
//
// The Admin API has no "create user" endpoint; staff join through email
// invites. Instead we send Ghost's own JSON importer (`POST /db/`) a file
// that contains users and nothing else. The importer creates them as locked
// Authors (they can't sign in, which a test site doesn't need), and the
// Admin API can then fill in the rest of the profile. Posts and tags still go
// through the Admin API as Lexical.

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as k from './lexical.mjs';

export const AUTHORS = [
  {
    key: 'full',
    name: 'Ada Lindqvist',
    slug: 'ada-lindqvist',
    email: 'ada@example.com',
    profile: ({ images }) => ({
      bio: 'Writes about sound, radio and the people who make both. This bio is long enough to wrap onto a second line in most author cards.',
      website: 'https://example.com/',
      location: 'Lisbon, Portugal',
      profile_image: images.avatar.src,
      cover_image: images.landscape.src,
      facebook: 'example',
      twitter: '@example',
      threads: '@example',
      bluesky: 'example.bsky.social',
      mastodon: '@example@mastodon.social',
      instagram: 'example',
      youtube: '@example',
      linkedin: 'example',
      tiktok: '@example',
    }),
  },
  { key: 'bare', name: 'Sam', slug: 'sam', email: 'sam@example.com', profile: () => ({}) },
  {
    key: 'long',
    name: 'Maximiliana Theodora Wilhelmina Featherstonehaugh-Montgomery-Abernathy',
    slug: 'maximiliana-featherstonehaugh',
    email: 'maximiliana@example.com',
    profile: () => ({ bio: 'Has a name that does not fit on one line.' }),
  },
  {
    key: 'cyrillic',
    name: 'Олена Коваленко',
    slug: 'olena-kovalenko',
    email: 'olena@example.com',
    profile: ({ images }) => ({ bio: 'Пише про подкасти.', profile_image: images.avatar.src }),
  },
  {
    key: 'cjk',
    name: '山田 花子',
    slug: 'yamada-hanako',
    email: 'hanako@example.com',
    profile: () => ({ bio: 'ポッドキャストについて書いています。' }),
  },
];

/** The importer file: users with the Author role, nothing else. */
export function importFile(authors, ghostVersion) {
  const roleId = '000000000000000000000001';
  return {
    db: [
      {
        meta: { exported_on: Date.UTC(2025, 0, 1), version: ghostVersion },
        data: {
          users: authors.map((author, index) => ({
            id: String(index + 2).padStart(24, '0'),
            name: author.name,
            slug: author.slug,
            email: author.email,
          })),
          roles: [{ id: roleId, name: 'Author' }],
          roles_users: authors.map((_, index) => ({
            user_id: String(index + 2).padStart(24, '0'),
            role_id: roleId,
          })),
        },
      },
    ],
  };
}

/** @param {import('./context.mjs').SeedContext} ctx */
export async function seedAuthors(ctx, { media, date }) {
  const dir = await mkdtemp(join(tmpdir(), 'theme-qa-'));
  try {
    const file = join(dir, 'users.json');
    await writeFile(file, JSON.stringify(importFile(AUTHORS, ctx.ghostVersion)));
    const result = await ctx.api.upload('/db/', file, { field: 'importfile' });
    if (result.problems?.length) {
      throw new Error(`Importing staff users failed: ${JSON.stringify(result.problems)}`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  ctx.resetUsers();

  const { users } = await ctx.api.get('/users/', { limit: 'all' });
  await Promise.all(
    AUTHORS.map(async (author) => {
      const user = users.find((u) => u.email === author.email);
      if (!user) throw new Error(`Imported author ${author.email} is missing.`);
      // Older Ghost versions lack some social fields; send only what exists.
      const profile = Object.fromEntries(
        Object.entries(author.profile(media)).filter(([key]) => key in user),
      );
      if (Object.keys(profile).length) {
        await ctx.api.put(`/users/${user.id}/`, { users: [profile] });
      }
    }),
  );

  // Ghost answers 404 for authors without posts, so each gets one.
  const posts = await Promise.all(
    AUTHORS.map((author, index) =>
      ctx.post({
        title: `A post by ${author.name}`,
        slug: `author-${author.key}`,
        authors: [author.email],
        tags: ['Authors'],
        publishedAt: date(-index),
        cards: [k.paragraph(`Written by ${author.name}.`)],
      }),
    ),
  );
  posts.push(
    await ctx.post({
      title: 'A post with three authors',
      slug: 'author-several',
      authors: AUTHORS.slice(0, 3).map((a) => a.email),
      tags: ['Authors'],
      publishedAt: date(-AUTHORS.length),
      cards: [k.paragraph('Bylines with several names have to wrap somewhere.')],
    }),
  );
  return posts;
}
