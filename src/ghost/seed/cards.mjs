// Base group "cards": one kitchen-sink post with every editor card Ghost can
// render on the web, plus one post per card so a broken card is easy to find.
//
// Left out on purpose: `email` and `email-cta` (newsletter only, never on the
// web) and `transistor` (members-only, needs a Transistor integration).

import * as k from './lexical.mjs';

/**
 * Each card lists the marker its web rendering contains, so we can confirm
 * Ghost actually rendered it. `since` is the first Ghost version that knows
 * the node; older versions skip it.
 * @type {Array<{ name: string, title: string, marker: string, since?: string,
 *   build: (media: any) => object[] }>}
 */
export const CARDS = [
  {
    name: 'image',
    title: 'Image',
    marker: 'kg-image-card',
    build: ({ images }) => [
      k.image({ ...images.landscape, alt: 'A blue gradient', caption: 'A regular-width image' }),
      k.image({ ...images.wide, alt: 'A green gradient', caption: 'Wide', cardWidth: 'wide' }),
      k.image({ ...images.square, alt: 'An orange gradient', caption: 'Full', cardWidth: 'full' }),
      k.image({ ...images.portrait, alt: '' }),
    ],
  },
  {
    name: 'gallery',
    title: 'Gallery',
    marker: 'kg-gallery-card',
    build: ({ images }) => [
      k.gallery(
        [images.landscape, images.portrait, images.square, images.wide, images.avatar].map(
          (img, i) => ({ ...img, alt: `Gallery image ${i + 1}` }),
        ),
        { caption: 'A gallery with two rows' },
      ),
    ],
  },
  {
    name: 'bookmark',
    title: 'Bookmark',
    marker: 'kg-bookmark-card',
    build: ({ images }) => [
      k.bookmark({
        url: 'https://example.com/',
        title: 'Example Domain',
        description:
          'This domain is for use in documentation examples without needing permission. A long description wraps onto several lines.',
        icon: images.icon.src,
        thumbnail: images.wide.src,
        author: 'Example Author',
        publisher: 'Example Publisher',
        caption: 'A bookmark card',
      }),
    ],
  },
  {
    name: 'embed',
    title: 'Embed',
    marker: 'kg-embed-card',
    build: () => [
      k.embed({
        url: 'https://example.com/embed',
        // Self-contained markup: a real oEmbed would make browser checks
        // depend on a third-party site.
        html: '<blockquote class="theme-qa-embed"><p>An embedded post from another site.</p></blockquote>',
        caption: 'An embed card',
      }),
    ],
  },
  {
    name: 'video',
    title: 'Video',
    marker: 'kg-video-card',
    build: ({ video, images }) => [
      k.video({
        ...video,
        thumbnailSrc: images.wide.src,
        thumbnailWidth: images.wide.width,
        thumbnailHeight: images.wide.height,
        caption: 'A video card',
      }),
    ],
  },
  {
    name: 'audio',
    title: 'Audio',
    marker: 'kg-audio-card',
    build: ({ audio, images }) => [
      k.audio({
        ...audio,
        title: 'An audio card with a thumbnail',
        thumbnailSrc: images.square.src,
      }),
      k.audio({ ...audio, title: 'An audio card without a thumbnail' }),
    ],
  },
  {
    name: 'file',
    title: 'File',
    marker: 'kg-file-card',
    build: ({ document }) => [
      k.file({ ...document, title: 'Sample file', caption: 'A one-page PDF' }),
    ],
  },
  {
    name: 'callout',
    title: 'Callout',
    marker: 'kg-callout-card',
    build: () => [
      k.callout({ text: 'A callout with an <strong>emoji</strong>.', emoji: '💡' }),
      k.callout({ text: 'A callout without an emoji.', emoji: '', backgroundColor: 'grey' }),
      k.callout({ text: 'An accent-coloured callout.', emoji: '🎧', backgroundColor: 'accent' }),
    ],
  },
  {
    name: 'toggle',
    title: 'Toggle',
    marker: 'kg-toggle-card',
    build: () => [
      k.toggle({
        heading: 'What does the toggle card do?',
        content: '<p>It hides an answer until the reader opens it.</p>',
      }),
    ],
  },
  {
    name: 'button',
    title: 'Button',
    marker: 'kg-button-card',
    build: () => [
      k.button({ text: 'A centred button', url: '#/portal/signup' }),
      k.button({ text: 'A left-aligned button', url: 'https://example.com/', alignment: 'left' }),
    ],
  },
  {
    name: 'header',
    title: 'Header',
    marker: 'kg-header-card',
    build: ({ images }) => [
      k.header({
        header: 'A header card',
        subheader: 'With a background image and a button',
        backgroundImageSrc: images.landscape.src,
        backgroundImageWidth: images.landscape.width,
        backgroundImageHeight: images.landscape.height,
        buttonEnabled: true,
        buttonText: 'Sign up',
        buttonUrl: '#/portal/signup',
      }),
      k.header({
        version: 1,
        header: 'A version 1 header card',
        subheader: 'Older posts still contain these',
        size: 'large',
        style: 'accent',
      }),
    ],
  },
  {
    name: 'product',
    title: 'Product',
    marker: 'kg-product-card',
    build: ({ images }) => [
      k.product({
        title: 'A product card',
        description: '<p>With an image, a rating and a button.</p>',
        imageSrc: images.square.src,
        imageWidth: images.square.width,
        imageHeight: images.square.height,
        rating: 4,
        buttonText: 'Buy now',
        url: 'https://example.com/',
      }),
    ],
  },
  {
    name: 'signup',
    title: 'Signup',
    marker: 'kg-signup-card',
    build: () => [
      k.signup({
        header: '<span>Sign up for the newsletter</span>',
        subheader: '<span>New posts straight to your inbox.</span>',
        disclaimer: '<span>No spam. Unsubscribe any time.</span>',
      }),
    ],
  },
  {
    name: 'call-to-action',
    title: 'Call to action',
    marker: 'kg-cta-card',
    since: '6.0.0',
    build: ({ images }) => [
      k.callToAction({
        text: '<p>A call-to-action card with an image and a sponsor label.</p>',
        buttonText: 'Learn more',
        buttonUrl: 'https://example.com/',
        sponsorLabel: '<p>SPONSORED</p>',
        imageUrl: images.square.src,
        imageWidth: images.square.width,
        imageHeight: images.square.height,
      }),
    ],
  },
  {
    name: 'codeblock',
    title: 'Code block',
    marker: 'kg-code-card',
    build: () => [
      k.codeblock("const greeting = 'Hello, world';\nconsole.log(greeting);", {
        language: 'javascript',
        caption: 'A code block with a caption',
      }),
      k.codeblock('<p>Without a caption or a language</p>'),
    ],
  },
  {
    name: 'divider',
    title: 'Divider',
    marker: '<hr>',
    build: () => [k.paragraph('Above the divider.'), k.divider(), k.paragraph('Below it.')],
  },
  {
    name: 'markdown',
    title: 'Markdown',
    // Ghost renders markdown without a wrapper; footnotes only come from markdown.
    marker: 'footnote-ref',
    build: () => [
      k.markdown(
        'A **markdown** card with a [link](https://example.com/) and a footnote.[^1]\n\n[^1]: The footnote.',
      ),
    ],
  },
  {
    name: 'html',
    title: 'HTML',
    marker: 'kg-card-begin: html',
    build: () => [k.html('<p class="theme-qa-html">An HTML card.</p>')],
  },
  {
    name: 'quote',
    title: 'Quotes',
    marker: 'kg-blockquote-alt',
    build: () => [
      k.quote('A regular blockquote. Themes style this one most often.'),
      k.aside('The alternative quote style, toggled by clicking the quote button twice.'),
    ],
  },
];

/** Compares major.minor.patch strings; Ghost's `/site/` may report just major.minor. */
export function versionAtLeast(version, minimum) {
  const parse = (v) =>
    v
      .split('-')[0]
      .split('.')
      .map((n) => Number.parseInt(n, 10) || 0);
  const a = parse(version);
  const b = parse(minimum);
  for (let i = 0; i < 3; i += 1) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return true;
}

/** @param {string} ghostVersion */
export function supportedCards(ghostVersion) {
  return CARDS.filter((card) => !card.since || versionAtLeast(ghostVersion, card.since));
}

/**
 * Which cards made it into the rendered page.
 * @param {string} html
 * @param {typeof CARDS} cards
 */
export function findCardMarkers(html, cards) {
  const found = [];
  const missing = [];
  for (const card of cards) (html.includes(card.marker) ? found : missing).push(card.name);
  return { found, missing };
}

/** @param {import('./context.mjs').SeedContext} ctx */
export async function seedCards(ctx, { media, date, log }) {
  const cards = supportedCards(ctx.ghostVersion);
  const skipped = CARDS.filter((card) => !cards.includes(card)).map((card) => card.name);
  if (skipped.length) log(`cards: Ghost ${ctx.ghostVersion} has no ${skipped.join(', ')} card`);

  const intro = (card) => [
    k.heading(card.title, 2),
    k.paragraph(`The ${card.title.toLowerCase()} card, between two paragraphs.`),
  ];
  const sink = await ctx.post({
    title: 'Every card in one post',
    slug: 'kitchen-sink',
    excerpt: 'Every editor card Ghost renders on the web, one after another.',
    featureImage: { ...media.images.wide, alt: 'A green gradient', caption: 'The feature image' },
    tags: ['Cards'],
    featured: true,
    publishedAt: date(0),
    cards: [
      k.paragraph('This post contains every card the editor can add, in one long page.'),
      ...cards.flatMap((card) => [...intro(card), ...card.build(media)]),
      k.paragraph('The end.'),
    ],
  });

  await Promise.all(
    cards.map((card, index) =>
      ctx.post({
        title: `Card: ${card.title}`,
        slug: `card-${card.name}`,
        tags: ['Cards'],
        publishedAt: date(-(index + 1)),
        cards: [k.paragraph(`Only the ${card.title.toLowerCase()} card.`), ...card.build(media)],
      }),
    ),
  );

  return { kitchenSink: sink, cards };
}
