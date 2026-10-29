// Base group "typography": a style-guide page with every text element a theme
// has to style, including the ones that break layouts (wide tables, long
// URLs, words without break opportunities).

import * as k from './lexical.mjs';

const LONG_URL =
  'https://example.com/a/very/long/path/that/keeps/going/and/going/without/any/spaces/so/it/has/to/wrap/somewhere/index.html?query=string&with=parameters';
const LONG_WORD =
  'Donaudampfschifffahrtselektrizitätenhauptbetriebswerkbauunterbeamtengesellschaft';

function table() {
  const columns = Array.from({ length: 10 }, (_, i) => `Column ${i + 1}`);
  const row = (n) =>
    `<tr>${columns.map((_, i) => `<td>Row ${n}, cell ${i + 1}</td>`).join('')}</tr>`;
  return k.html(
    `<table><thead><tr>${columns.map((c) => `<th>${c}</th>`).join('')}</tr></thead>` +
      `<tbody>${[1, 2, 3, 4].map(row).join('')}</tbody></table>`,
  );
}

function nestedList(ordered) {
  return k.list(
    [
      {
        content: 'Level one',
        children: [
          {
            content: 'Level two',
            children: [
              {
                content: 'Level three',
                children: ['Level four', 'Another item at level four'],
              },
              'Back at level three',
            ],
          },
          'Back at level two',
        ],
      },
      'Back at level one, with a longer item that wraps onto a second line on narrow screens so line height and indentation both show.',
    ],
    { ordered },
  );
}

export function styleGuideCards() {
  return [
    k.paragraph(
      'Every text element a post can contain. If something looks off here, it looks off in real posts too.',
    ),
    k.heading('Heading level 1', 1),
    k.heading('Heading level 2', 2),
    k.heading('Heading level 3', 3),
    k.heading('Heading level 4', 4),
    k.heading('Heading level 5', 5),
    k.heading('Heading level 6', 6),
    k.heading('Inline formatting', 2),
    k.paragraph([
      'Plain text, ',
      k.text('bold', { bold: true }),
      ', ',
      k.text('italic', { italic: true }),
      ', ',
      k.text('bold italic', { bold: true, italic: true }),
      ', ',
      k.text('underlined', { underline: true }),
      ', ',
      k.text('struck through', { strikethrough: true }),
      ', ',
      k.text('inline code', { code: true }),
      ', ',
      k.text('highlighted', { highlight: true }),
      ', H',
      k.text('2', { subscript: true }),
      'O, E = mc',
      k.text('2', { superscript: true }),
      ' and ',
      k.link('a link', 'https://example.com/'),
      '.',
    ]),
    k.heading('Paragraphs', 2),
    k.paragraph(
      'A longer paragraph to judge line length and rhythm. Good body text sits somewhere between sixty and eighty characters per line, with enough line height that the eye finds the start of the next line without effort. This one keeps going for a few more sentences so it wraps several times at every screen width.',
    ),
    k.paragraph('A short one.'),
    k.heading('Lists', 2),
    nestedList(false),
    nestedList(true),
    k.heading('Quotes', 2),
    k.quote(
      'A blockquote. It usually holds a sentence or two quoted from somewhere else, and sometimes a lot more than that.',
    ),
    k.aside('The alternative quote style, often used for pull quotes.'),
    k.heading('Code', 2),
    k.codeblock(
      `function wrap(line) {\n  // A line that is much longer than the column, to show whether code blocks scroll horizontally or overflow the page.\n  return line;\n}`,
      { language: 'javascript' },
    ),
    k.heading('Table', 2),
    table(),
    k.heading('Things that break layouts', 2),
    k.paragraph(['A long URL as a link: ', k.link(LONG_URL, LONG_URL)]),
    k.paragraph(`The same URL as plain text: ${LONG_URL}`),
    k.paragraph(`A long word with no break opportunities: ${LONG_WORD}.`),
    k.divider(),
    k.paragraph('The end of the style guide.'),
  ];
}

/** @param {import('./context.mjs').SeedContext} ctx */
export async function seedTypography(ctx) {
  return ctx.page({
    title: 'Style guide',
    slug: 'style-guide',
    excerpt: 'Every text element in one place.',
    publishedAt: '2025-01-15T09:00:00.000Z',
    cards: styleGuideCards(),
  });
}
