// Builders for Ghost's Lexical document format.
//
// Content is written as Lexical JSON directly (not converted from HTML) so
// every card arrives exactly as the editor would save it. Node shapes follow
// @tryghost/kg-default-nodes; properties left out fall back to the node's own
// defaults when Ghost renders the post.

const TEXT_FORMAT = {
  bold: 1,
  italic: 2,
  strikethrough: 4,
  underline: 8,
  code: 16,
  subscript: 32,
  superscript: 64,
  highlight: 128,
};

const ELEMENT = { direction: null, format: '', indent: 0, version: 1 };

/**
 * An inline text run.
 * @param {string} value
 * @param {{ bold?: boolean, italic?: boolean, strikethrough?: boolean, underline?: boolean,
 *   code?: boolean, subscript?: boolean, superscript?: boolean, highlight?: boolean }} [marks]
 */
export function text(value, marks = {}) {
  let format = 0;
  for (const [mark, on] of Object.entries(marks)) {
    if (!(mark in TEXT_FORMAT)) throw new Error(`Unknown text mark "${mark}".`);
    if (on) format |= TEXT_FORMAT[mark];
  }
  return {
    detail: 0,
    format,
    mode: 'normal',
    style: '',
    text: value,
    type: 'extended-text',
    version: 1,
  };
}

/** @param {string | object[]} label @param {string} url */
export function link(label, url) {
  return {
    ...ELEMENT,
    children: inline(label),
    type: 'link',
    rel: null,
    target: null,
    title: null,
    url,
  };
}

/** Strings become a single text run; arrays of runs pass through. */
function inline(content) {
  if (typeof content === 'string') return [text(content)];
  return content.map((part) => (typeof part === 'string' ? text(part) : part));
}

export function paragraph(content = '') {
  return { ...ELEMENT, children: inline(content), type: 'paragraph' };
}

export function heading(content, level = 2) {
  if (!Number.isInteger(level) || level < 1 || level > 6) {
    throw new Error(`Heading level must be 1-6, got ${level}.`);
  }
  return { ...ELEMENT, children: inline(content), type: 'extended-heading', tag: `h${level}` };
}

export function quote(content) {
  return { ...ELEMENT, children: inline(content), type: 'extended-quote' };
}

/** The editor's alternative quote style, rendered as `blockquote.kg-blockquote-alt`. */
export function aside(content) {
  return { ...ELEMENT, children: inline(content), type: 'aside' };
}

/**
 * Items are strings, inline-run arrays, or `{ content, children }` for nesting.
 * @param {Array<string | object[] | { content: string | object[], children: any[] }>} items
 * @param {{ ordered?: boolean }} [options]
 */
export function list(items, { ordered = false } = {}, depth = 0) {
  const children = items.map((item, index) => {
    const nested = item && !Array.isArray(item) && typeof item === 'object';
    const nodes = inline(nested ? item.content : item);
    if (nested && item.children?.length) {
      nodes.push(list(item.children, { ordered }, depth + 1));
    }
    return { ...ELEMENT, indent: depth, children: nodes, type: 'listitem', value: index + 1 };
  });
  return {
    ...ELEMENT,
    children,
    type: 'list',
    listType: ordered ? 'number' : 'bullet',
    start: 1,
    tag: ordered ? 'ol' : 'ul',
  };
}

export function divider() {
  return { type: 'horizontalrule', version: 1 };
}

/** @param {string} code @param {{ language?: string, caption?: string }} [options] */
export function codeblock(code, { language = '', caption = '' } = {}) {
  return { type: 'codeblock', version: 1, code, language, caption };
}

/**
 * @param {{ src: string, width?: number, height?: number, alt?: string, caption?: string,
 *   title?: string, cardWidth?: 'regular' | 'wide' | 'full', href?: string }} options
 */
export function image({
  src,
  width = null,
  height = null,
  alt = '',
  caption = '',
  title = '',
  cardWidth = 'regular',
  href = '',
}) {
  return { type: 'image', version: 1, src, width, height, alt, caption, title, cardWidth, href };
}

/**
 * Three images per row, like the editor.
 * @param {Array<{ src: string, width: number, height: number, alt?: string, caption?: string }>} images
 */
export function gallery(images, { caption = '' } = {}) {
  return {
    type: 'gallery',
    version: 1,
    images: images.map((img, index) => ({
      row: Math.floor(index / 3),
      src: img.src,
      width: img.width,
      height: img.height,
      alt: img.alt ?? '',
      caption: img.caption ?? '',
      title: '',
      fileName: img.src.split('/').pop(),
    })),
    caption,
  };
}

export function bookmark({
  url,
  title = '',
  description = '',
  icon = '',
  thumbnail = '',
  author = '',
  publisher = '',
  caption = '',
}) {
  return {
    type: 'bookmark',
    version: 1,
    url,
    metadata: { icon, title, description, author, publisher, thumbnail },
    caption,
  };
}

/** `html` is inserted as-is; keep it free of third-party requests. */
export function embed({ url, html, embedType = 'rich', metadata = {}, caption = '' }) {
  return { type: 'embed', version: 1, url, embedType, html, metadata, caption };
}

export function video({
  src,
  width,
  height,
  duration = 0,
  mimeType = 'video/mp4',
  thumbnailSrc = '',
  thumbnailWidth = null,
  thumbnailHeight = null,
  caption = '',
  cardWidth = 'regular',
  loop = false,
}) {
  return {
    type: 'video',
    version: 1,
    src,
    caption,
    fileName: src.split('/').pop(),
    mimeType,
    width,
    height,
    duration,
    thumbnailSrc,
    customThumbnailSrc: '',
    thumbnailWidth,
    thumbnailHeight,
    cardWidth,
    loop,
  };
}

export function audio({
  src,
  title = '',
  duration = 0,
  mimeType = 'audio/mpeg',
  thumbnailSrc = '',
}) {
  return { type: 'audio', version: 1, src, title, duration, mimeType, thumbnailSrc };
}

export function file({ src, title = '', caption = '', fileName, fileSize = 0 }) {
  return {
    type: 'file',
    version: 1,
    src,
    fileTitle: title,
    fileCaption: caption,
    fileName: fileName ?? src.split('/').pop(),
    fileSize,
  };
}

/** `text` is HTML, as the editor stores it. */
export function callout({ text: html, emoji = '💡', backgroundColor = 'blue' }) {
  return {
    type: 'callout',
    version: 1,
    calloutText: html,
    calloutEmoji: emoji,
    backgroundColor,
  };
}

/** `heading` and `content` are HTML. */
export function toggle({ heading: title, content }) {
  return { type: 'toggle', version: 1, heading: title, content };
}

export function button({ text: label, url, alignment = 'center' }) {
  return { type: 'button', version: 1, buttonText: label, alignment, buttonUrl: url };
}

/** Header card. Version 2 is what the editor creates today; version 1 still renders. */
export function header({
  version = 2,
  header: title = '',
  subheader = '',
  size = 'small',
  style = 'dark',
  alignment = 'center',
  layout = 'full',
  backgroundColor = '#000000',
  textColor = '#FFFFFF',
  backgroundImageSrc = '',
  backgroundImageWidth = null,
  backgroundImageHeight = null,
  buttonEnabled = false,
  buttonText = '',
  buttonUrl = '',
  buttonColor = '#ffffff',
  buttonTextColor = '#000000',
  swapped = false,
}) {
  return {
    type: 'header',
    version,
    size,
    style,
    buttonEnabled,
    buttonUrl,
    buttonText,
    header: title,
    subheader,
    backgroundImageSrc,
    accentColor: '#FF1A75',
    alignment,
    backgroundColor,
    backgroundImageWidth,
    backgroundImageHeight,
    backgroundSize: 'cover',
    textColor,
    buttonColor,
    buttonTextColor,
    layout,
    swapped,
  };
}

/** `title` and `description` are HTML. */
export function product({
  title,
  description = '',
  imageSrc = '',
  imageWidth = null,
  imageHeight = null,
  rating = null,
  buttonText = '',
  url = '',
}) {
  return {
    type: 'product',
    version: 1,
    productImageSrc: imageSrc,
    productImageWidth: imageWidth,
    productImageHeight: imageHeight,
    productTitle: title,
    productDescription: description,
    productRatingEnabled: rating !== null,
    productStarRating: rating ?? 5,
    productButtonEnabled: Boolean(buttonText),
    productButton: buttonText,
    productUrl: url,
  };
}

/** Members signup form. `header`, `subheader` and `disclaimer` are HTML. */
export function signup({
  header: title = '',
  subheader = '',
  disclaimer = '',
  buttonText = 'Subscribe',
  layout = 'wide',
  alignment = 'left',
  backgroundColor = '#F0F0F0',
  textColor = '#000000',
  backgroundImageSrc = '',
  swapped = false,
}) {
  return {
    type: 'signup',
    version: 1,
    alignment,
    backgroundColor,
    backgroundImageSrc,
    backgroundSize: 'cover',
    textColor,
    buttonColor: 'accent',
    buttonTextColor: '#FFFFFF',
    buttonText,
    disclaimer,
    header: title,
    layout,
    subheader,
    successMessage: 'Email sent! Check your inbox to complete your signup.',
    swapped,
  };
}

/** Call-to-action card (Ghost 6). `text` and `sponsorLabel` are HTML. */
export function callToAction({
  text: html,
  layout = 'minimal',
  alignment = 'left',
  buttonText = 'Learn more',
  buttonUrl = '',
  showButton = Boolean(buttonUrl),
  sponsorLabel = '',
  backgroundColor = 'grey',
  imageUrl = '',
  imageWidth = null,
  imageHeight = null,
}) {
  return {
    type: 'call-to-action',
    version: 1,
    layout,
    alignment,
    textValue: html,
    showButton,
    showDividers: true,
    buttonText,
    buttonUrl,
    buttonColor: '#000000',
    buttonTextColor: '#ffffff',
    hasSponsorLabel: Boolean(sponsorLabel),
    sponsorLabel,
    backgroundColor,
    linkColor: 'text',
    imageUrl,
    imageWidth,
    imageHeight,
  };
}

export function markdown(source) {
  return { type: 'markdown', version: 1, markdown: source };
}

export function html(source) {
  return { type: 'html', version: 1, html: source };
}

/** Public preview divider: content after it is for the post's audience only. */
export function paywall() {
  return { type: 'paywall', version: 1 };
}

/** @param {object[]} nodes top-level nodes @returns {string} Lexical JSON for the Admin API */
export function lexical(nodes) {
  for (const node of nodes) {
    if (!node || typeof node.type !== 'string') {
      throw new Error(`Not a Lexical node: ${JSON.stringify(node)?.slice(0, 120)}`);
    }
  }
  return JSON.stringify({ root: { ...ELEMENT, children: nodes, type: 'root' } });
}

/** What the seed context exposes as `cards`. */
export const cards = {
  text,
  link,
  paragraph,
  heading,
  quote,
  aside,
  list,
  divider,
  codeblock,
  image,
  gallery,
  bookmark,
  embed,
  video,
  audio,
  file,
  callout,
  toggle,
  button,
  header,
  product,
  signup,
  callToAction,
  markdown,
  html,
  paywall,
};
