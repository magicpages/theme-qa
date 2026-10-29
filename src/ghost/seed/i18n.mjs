// Base group "i18n": scripts and directions a Latin-only design never sees.
// The site locale stays English; this is about rendering content, not
// translating the theme.

import * as k from './lexical.mjs';

export const LANGUAGES = [
  {
    slug: 'i18n-arabic',
    title: 'مرحبا بكم في مدونتنا',
    body: [
      'هذه فقرة باللغة العربية. تُكتب العربية من اليمين إلى اليسار، ويجب أن يبقى النص مقروءًا.',
      'فقرة ثانية تحتوي على رقم 2025 وكلمة English في وسط الجملة.',
    ],
  },
  {
    slug: 'i18n-hebrew',
    title: 'ברוכים הבאים לבלוג שלנו',
    body: ['זוהי פסקה בעברית. העברית נכתבת מימין לשמאל.'],
  },
  {
    slug: 'i18n-japanese',
    title: '私たちのブログへようこそ',
    body: [
      'これは日本語の段落です。日本語には単語の間にスペースがないので、行はどこでも折り返す必要があります。',
    ],
  },
  {
    slug: 'i18n-chinese',
    title: '欢迎来到我们的博客',
    body: ['这是一个中文段落。中文的词语之间没有空格，所以文本可以在任何字符之间换行。'],
  },
  {
    slug: 'i18n-korean',
    title: '우리 블로그에 오신 것을 환영합니다',
    body: ['이것은 한국어 단락입니다. 한국어는 단어 사이에 공백을 사용합니다.'],
  },
  {
    slug: 'i18n-ukrainian',
    title: 'Ласкаво просимо до нашого блогу',
    body: ['Це абзац українською мовою. Кирилиця потребує шрифту, який її підтримує.'],
  },
  {
    slug: 'i18n-hindi',
    title: 'हमारे ब्लॉग में आपका स्वागत है',
    body: ['यह हिंदी में एक अनुच्छेद है। देवनागरी लिपि में अक्षर ऊपर की रेखा से जुड़े होते हैं।'],
  },
  {
    slug: 'i18n-vietnamese',
    title: 'Chào mừng đến với blog của chúng tôi',
    body: ['Đây là một đoạn văn bằng tiếng Việt, với nhiều dấu thanh chồng lên nhau.'],
  },
];

/** @param {import('./context.mjs').SeedContext} ctx */
export async function seedI18n(ctx, { date }) {
  return Promise.all(
    LANGUAGES.map(({ slug, title, body }, index) =>
      ctx.post({
        title,
        slug,
        tags: ['Languages'],
        publishedAt: date(-index),
        cards: [k.heading(title, 2), ...body.map((p) => k.paragraph(p))],
      }),
    ),
  );
}
