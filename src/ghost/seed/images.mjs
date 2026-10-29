// Base group "images": feature images of every awkward shape, and none at all.

import * as k from './lexical.mjs';

/** @param {import('./context.mjs').SeedContext} ctx */
export async function seedImages(ctx, { media, date }) {
  const { images } = media;
  const posts = [
    { slug: 'image-none', title: 'A post without a feature image', featureImage: null },
    {
      slug: 'image-portrait',
      title: 'A portrait feature image',
      featureImage: { ...images.portrait, alt: 'A purple gradient, taller than wide' },
    },
    {
      slug: 'image-tiny',
      title: 'A tiny feature image',
      featureImage: { ...images.tiny, alt: 'A 48 by 32 pixel gradient' },
    },
    {
      slug: 'image-large',
      title: 'A large feature image',
      featureImage: { ...images.landscape, alt: 'A blue gradient, 2400 pixels wide' },
    },
    {
      slug: 'image-alt-caption',
      title: 'A feature image with alt text and a caption',
      featureImage: {
        ...images.wide,
        alt: 'A green gradient',
        caption: 'A caption with <a href="https://example.com/">a link</a> in it',
      },
    },
    {
      slug: 'image-no-alt',
      title: 'A feature image without alt text or caption',
      featureImage: { src: images.square.src },
    },
  ];
  return Promise.all(
    posts.map(({ slug, title, featureImage }, index) =>
      ctx.post({
        title,
        slug,
        tags: ['Images'],
        featureImage,
        publishedAt: date(-index),
        cards: [
          k.paragraph('Images inside the post body, too:'),
          k.image({ ...images.tiny, alt: 'A tiny image', caption: 'A tiny image, not upscaled' }),
          k.image({ src: images.portrait.src }),
          k.paragraph('An image without alt text, size or caption sits above this line.'),
        ],
      }),
    ),
  );
}
