import sanitizeHtml from 'sanitize-html';

export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html || '', {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      'img',
      'h1',
      'h2',
      'span',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
    ]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      '*': ['style', 'class', 'align'],
      a: ['href', 'name', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }),
    },
  });
}
