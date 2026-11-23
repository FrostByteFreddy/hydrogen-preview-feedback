import {afterEach, describe, expect, it, vi} from 'vitest';
import {clearTokenCache, getClientCredentialsToken, type AdminGraphql} from './admin.js';
import {createFeedbackStore} from './store.js';
import {createPreviewFeedbackRoute} from './server.js';

/** Fake Admin API: records operations, keeps metaobjects in memory. */
function fakeAdmin({hasDefinition = false} = {}) {
  const ops: string[] = [];
  let definition = hasDefinition;
  const objects = new Map<string, {type: string; fields: Record<string, string>}>();
  let nextId = 1;
  const admin: AdminGraphql = async (query, variables) => {
    const op = /(?:query|mutation) (\w+)/.exec(query)![1];
    ops.push(op);
    switch (op) {
      case 'PreviewFeedbackDefinition':
        return {data: {metaobjectDefinitionByType: definition ? {id: 'def'} : null}};
      case 'PreviewFeedbackDefinitionCreate':
        definition = true;
        return {data: {metaobjectDefinitionCreate: {userErrors: []}}};
      case 'PreviewFeedbackCreate': {
        const m = variables.metaobject as {type: string; fields: Array<{key: string; value: string}>};
        objects.set(`gid://shopify/Metaobject/${nextId++}`, {
          type: m.type,
          fields: Object.fromEntries(m.fields.map((f) => [f.key, f.value])),
        });
        return {data: {metaobjectCreate: {userErrors: []}}};
      }
      case 'PreviewFeedbackList':
        return {
          data: {
            metaobjects: {
              nodes: [...objects]
                .filter(([, o]) => o.type === variables.type)
                .map(([id, o]) => ({
                  id,
                  fields: Object.entries(o.fields).map(([key, value]) => ({key, value})),
                })),
            },
          },
        };
      case 'PreviewFeedbackOne': {
        const o = objects.get(variables.id as string);
        return {
          data: {
            metaobject: o ? {type: o.type, replies: {value: o.fields.replies ?? null}} : null,
          },
        };
      }
      case 'PreviewFeedbackUpdate': {
        const o = objects.get(variables.id as string)!;
        for (const f of (variables.metaobject as {fields: Array<{key: string; value: string}>}).fields) {
          o.fields[f.key] = f.value;
        }
        return {data: {metaobjectUpdate: {userErrors: []}}};
      }
    }
    throw new Error(`unexpected ${op}`);
  };
  return {admin, ops, objects};
}

const comment = {comment: 'Logo', author: 'A', page: '/', anchor: null, element: '', context: ''};

describe('createFeedbackStore', () => {
  it('creates the definition once, then stores and lists comments', async () => {
    const {admin, ops} = fakeAdmin();
    const store = createFeedbackStore(admin);
    await store.create(comment);
    await store.create({...comment, comment: 'Colours'});
    const items = await store.list();
    expect(ops.filter((o) => o === 'PreviewFeedbackDefinitionCreate')).toHaveLength(1);
    expect(items.map((i) => [i.number, i.comment, i.status])).toEqual([
      [1, 'Logo', 'open'],
      [2, 'Colours', 'open'],
    ]);
  });

  it('appends replies and sets the status', async () => {
    const {admin} = fakeAdmin({hasDefinition: true});
    const store = createFeedbackStore(admin);
    await store.create(comment);
    const [item] = await store.list();
    await store.reply(item.id, {author: 'B', text: 'On it', at: 'x'});
    await store.reply(item.id, {author: 'A', text: 'Thanks', at: 'y'});
    await store.setStatus(item.id, 'resolved');
    const [after] = await store.list();
    expect(after.replies.map((r) => r.text)).toEqual(['On it', 'Thanks']);
    expect(after.status).toBe('resolved');
  });

  it('refuses metaobjects of another type', async () => {
    const {admin, objects} = fakeAdmin({hasDefinition: true});
    objects.set('gid://shopify/Metaobject/99', {type: 'filament', fields: {}});
    const store = createFeedbackStore(admin);
    await expect(store.setStatus('gid://shopify/Metaobject/99', 'resolved')).rejects.toThrow(
      'Not found',
    );
  });
});

describe('getClientCredentialsToken', () => {
  afterEach(() => clearTokenCache());

  it('caches the token until shortly before it expires', async () => {
    let clock = 0;
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({access_token: 'tok', expires_in: 86399})),
    );
    const args = {
      storeDomain: 'shop.myshopify.com',
      clientId: 'id',
      clientSecret: 'secret',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => clock,
    };
    expect(await getClientCredentialsToken(args)).toBe('tok');
    clock = 86_000_000;
    await getClientCredentialsToken(args);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    clock = 86_399_000;
    await getClientCredentialsToken(args);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('throws on a failed token request', async () => {
    const fetchImpl = async () => new Response('nope', {status: 400});
    await expect(
      getClientCredentialsToken({
        storeDomain: 's',
        clientId: 'i',
        clientSecret: 'x',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow('400');
  });
});

describe('createPreviewFeedbackRoute', () => {
  const route = createPreviewFeedbackRoute<{token?: string}>({
    credentials: (context) =>
      context.token ? {storeDomain: 'shop.myshopify.com', accessToken: context.token} : null,
  });

  async function status(promise: Promise<unknown>) {
    try {
      await promise;
      return 'ok';
    } catch (thrown) {
      return thrown instanceof Response ? thrown.status : thrown;
    }
  }

  it('answers 404 on production hosts and without credentials', async () => {
    expect(
      await status(route.loader({request: new Request('https://shop.example.com/api/preview-feedback'), context: {token: 't'}})),
    ).toBe(404);
    expect(
      await status(route.loader({request: new Request('http://localhost:3000/api/preview-feedback'), context: {}})),
    ).toBe(404);
  });

  it('rejects the honeypot and unknown intents before touching the store', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const post = (fields: Record<string, string>) => {
      const body = new FormData();
      for (const [k, v] of Object.entries(fields)) body.set(k, v);
      return route.action({
        request: new Request('http://localhost:3000/api/preview-feedback', {method: 'POST', body}),
        context: {token: 't'},
      });
    };
    const bot = (await post({intent: 'create', comment: 'spam', website: 'x'})) as {
      data: unknown;
      init: {status: number} | null;
    };
    expect(bot.init?.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
