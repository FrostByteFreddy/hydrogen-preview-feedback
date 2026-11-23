/** Types and pure helpers shared by the widget and the server route. */

export const FEEDBACK_STATUS = ['open', 'resolved'] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUS)[number];

/** Where a pin sits: an element plus the relative spot inside it, with
 * page coordinates as a fallback when the element can't be found again. */
export type FeedbackAnchor = {
  selector: string;
  rx: number;
  ry: number;
  /** Page x as a share of the page width, page y in pixels. */
  px: number;
  py: number;
};

export type FeedbackReply = {author: string; text: string; at: string};

export type FeedbackItem = {
  id: string;
  number: number;
  comment: string;
  author: string;
  page: string;
  anchor: FeedbackAnchor | null;
  element: string;
  context: string;
  status: FeedbackStatus;
  createdAt: string;
  replies: FeedbackReply[];
};

export type FeedbackResponse =
  | {ok: true; items: FeedbackItem[]}
  | {ok: false; error: 'invalid' | 'unavailable'};

export type NewFeedback = {
  comment: string;
  author: string;
  page: string;
  anchor: FeedbackAnchor | null;
  element: string;
  context: string;
};

const LIMITS = {comment: 2000, author: 60, page: 250, element: 250, context: 250};

/**
 * Default preview hosts: Oxygen deployment URLs (*.myshopify.dev) and local
 * development. Production domains never match, so the widget can't leak
 * onto the live shop.
 */
export function isPreviewHost(hostname: string): boolean {
  return (
    hostname.endsWith('.myshopify.dev') ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1'
  );
}

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function finite(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : null;
}

export function parseAnchor(raw: unknown): FeedbackAnchor | null {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object') return null;
  const a = value as Record<string, unknown>;
  const rx = finite(a.rx, 0, 1);
  const ry = finite(a.ry, 0, 1);
  const px = finite(a.px, 0, 1);
  const py = finite(a.py, 0, 1_000_000);
  if (rx === null || ry === null || px === null || py === null) return null;
  return {selector: clean(a.selector, 600), rx, ry, px, py};
}

/** Validates a submitted comment; null when it's empty. */
export function parseNewFeedback(form: FormData): NewFeedback | null {
  const comment = clean(form.get('comment'), LIMITS.comment);
  if (!comment) return null;
  return {
    comment,
    author: clean(form.get('author'), LIMITS.author),
    page: clean(form.get('page'), LIMITS.page) || '/',
    anchor: parseAnchor(form.get('anchor')),
    element: clean(form.get('element'), LIMITS.element),
    context: clean(form.get('context'), LIMITS.context),
  };
}

export function parseReply(
  form: FormData,
  now: Date = new Date(),
): FeedbackReply | null {
  const text = clean(form.get('text'), LIMITS.comment);
  if (!text) return null;
  return {
    author: clean(form.get('author'), LIMITS.author),
    text,
    at: now.toISOString(),
  };
}

export function parseReplies(raw: string | null | undefined): FeedbackReply[] {
  if (!raw) return [];
  try {
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.flatMap((entry: unknown) => {
      if (!entry || typeof entry !== 'object') return [];
      const r = entry as Record<string, unknown>;
      return typeof r.text === 'string'
        ? [{author: String(r.author ?? ''), text: r.text, at: String(r.at ?? '')}]
        : [];
    });
  } catch {
    return [];
  }
}

export type MetaobjectNode = {
  id: string;
  fields: Array<{key: string; value: string | null}>;
};

/** Metaobjects come oldest first, so the index is a stable comment number. */
export function toFeedbackItems(nodes: MetaobjectNode[]): FeedbackItem[] {
  return nodes.map((node, index) => {
    const f = Object.fromEntries(node.fields.map((x) => [x.key, x.value ?? '']));
    return {
      id: node.id,
      number: index + 1,
      comment: f.comment ?? '',
      author: f.author ?? '',
      page: f.page || '/',
      anchor: parseAnchor(f.anchor),
      element: f.element ?? '',
      context: f.context ?? '',
      status: f.status === 'resolved' ? 'resolved' : 'open',
      createdAt: f.created_at ?? '',
      replies: parseReplies(f.replies),
    };
  });
}

export function newFeedbackFields(input: NewFeedback, now: Date = new Date()) {
  const fields = [
    {key: 'comment', value: input.comment},
    {key: 'author', value: input.author},
    {key: 'page', value: input.page},
    {key: 'element', value: input.element},
    {key: 'context', value: input.context},
    {key: 'status', value: 'open'},
    {key: 'created_at', value: now.toISOString()},
    {key: 'replies', value: '[]'},
  ];
  if (input.anchor) {
    fields.push({key: 'anchor', value: JSON.stringify(input.anchor)});
  }
  return fields.filter((f) => f.value !== '');
}
