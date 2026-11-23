import {describe, expect, it} from 'vitest';
import {
  isPreviewHost,
  newFeedbackFields,
  parseAnchor,
  parseNewFeedback,
  parseReply,
  toFeedbackItems,
} from './shared.js';

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe('isPreviewHost', () => {
  it('allows Oxygen previews and localhost, never other domains', () => {
    expect(isPreviewHost('my-shop-abc123.o2.myshopify.dev')).toBe(true);
    expect(isPreviewHost('localhost')).toBe(true);
    expect(isPreviewHost('shop.example.com')).toBe(false);
    expect(isPreviewHost('myshopify.dev.evil.com')).toBe(false);
  });
});

describe('parseAnchor', () => {
  it('clamps numbers and rejects junk', () => {
    expect(
      parseAnchor('{"selector":"#hero > h1","rx":1.4,"ry":-2,"px":0.5,"py":320}'),
    ).toEqual({selector: '#hero > h1', rx: 1, ry: 0, px: 0.5, py: 320});
    expect(parseAnchor('not json')).toBeNull();
    expect(parseAnchor('{"rx":"a","ry":0,"px":0,"py":0}')).toBeNull();
    expect(parseAnchor('{"rx":0,"ry":0,"px":0}')).toBeNull();
    expect(parseAnchor(null)).toBeNull();
  });
});

describe('parseNewFeedback', () => {
  it('needs a comment, trims and limits', () => {
    expect(parseNewFeedback(form({comment: '   '}))).toBeNull();
    expect(
      parseNewFeedback(form({comment: ' Bigger logo ', page: '/?x=1', anchor: 'x'})),
    ).toEqual({
      comment: 'Bigger logo',
      author: '',
      page: '/?x=1',
      anchor: null,
      element: '',
      context: '',
    });
    expect(parseNewFeedback(form({comment: 'a'.repeat(5000)}))?.comment).toHaveLength(2000);
  });
});

describe('parseReply', () => {
  it('stamps the time', () => {
    expect(parseReply(form({text: ''}))).toBeNull();
    expect(
      parseReply(form({text: 'Done', author: 'Sam'}), new Date('2026-11-23T20:00:00Z')),
    ).toEqual({author: 'Sam', text: 'Done', at: '2026-11-23T20:00:00.000Z'});
  });
});

describe('newFeedbackFields', () => {
  it('skips empty values and starts open', () => {
    const fields = newFeedbackFields(
      {
        comment: 'Text',
        author: 'T',
        page: '/',
        anchor: {selector: 'body', rx: 0, ry: 0, px: 0.1, py: 10},
        element: '',
        context: '',
      },
      new Date('2026-11-23T20:00:00Z'),
    );
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f.value]));
    expect(byKey.status).toBe('open');
    expect(byKey.created_at).toBe('2026-11-23T20:00:00.000Z');
    expect('element' in byKey).toBe(false);
    expect(JSON.parse(byKey.anchor!)).toEqual({selector: 'body', rx: 0, ry: 0, px: 0.1, py: 10});
  });
});

describe('toFeedbackItems', () => {
  it('numbers in order and tolerates broken JSON', () => {
    const items = toFeedbackItems([
      {
        id: 'gid://shopify/Metaobject/1',
        fields: [
          {key: 'comment', value: 'First'},
          {key: 'status', value: 'resolved'},
          {key: 'replies', value: '[{"author":"M","text":"ok","at":"x"}, 5]'},
        ],
      },
      {
        id: 'gid://shopify/Metaobject/2',
        fields: [
          {key: 'comment', value: 'Second'},
          {key: 'replies', value: '{broken'},
          {key: 'anchor', value: null},
        ],
      },
    ]);
    expect(items.map((i) => [i.number, i.status, i.replies.length, i.page])).toEqual([
      [1, 'resolved', 1, '/'],
      [2, 'open', 0, '/'],
    ]);
    expect(items[1].anchor).toBeNull();
  });
});
