/**
 * Server side: a resource route (loader + action) for React Router /
 * Hydrogen that lists and stores comments through the Admin API.
 */
import {data} from 'react-router';
import {adminFromCredentials, type AdminCredentials} from './admin.js';
import {
  FEEDBACK_STATUS,
  isPreviewHost as defaultIsPreviewHost,
  parseNewFeedback,
  parseReply,
  type FeedbackResponse,
  type FeedbackStatus,
} from './shared.js';
import {createFeedbackStore, DEFAULT_METAOBJECT_TYPE} from './store.js';

export type {AdminCredentials, AdminGraphql} from './admin.js';
export {
  adminFromCredentials,
  clearTokenCache,
  createAdminGraphql,
  getClientCredentialsToken,
} from './admin.js';
export {createFeedbackStore, DEFAULT_METAOBJECT_TYPE} from './store.js';
export * from './shared.js';

export type PreviewFeedbackRouteOptions<Context> = {
  /** Admin API credentials for the store, or null to disable the route. */
  credentials: (context: Context) => AdminCredentials | null | undefined;
  /** Which hosts may use the route. Defaults to *.myshopify.dev and localhost. */
  isPreviewHost?: (hostname: string) => boolean;
  /** Metaobject type the comments are stored as. */
  metaobjectType?: string;
  apiVersion?: string;
};

type RouteArgs<Context> = {request: Request; context: Context};

function json(body: FeedbackResponse, status = 200) {
  return data(body, {status, headers: {'Cache-Control': 'no-store'}});
}

const notFound = () => {
  throw new Response('Not found', {status: 404});
};

/**
 * Creates the loader (GET: list) and action (POST: create, reply, status)
 * for the feedback endpoint. Off review hosts, or without credentials, it
 * answers 404 so production never exposes it.
 */
export function createPreviewFeedbackRoute<Context>(
  options: PreviewFeedbackRouteOptions<Context>,
) {
  const allowed = options.isPreviewHost ?? defaultIsPreviewHost;
  const type = options.metaobjectType ?? DEFAULT_METAOBJECT_TYPE;

  async function storeFor({request, context}: RouteArgs<Context>) {
    if (!allowed(new URL(request.url).hostname)) return null;
    const credentials = options.credentials(context);
    if (!credentials) return null;
    const admin = await adminFromCredentials(credentials, options.apiVersion);
    return createFeedbackStore(admin, type);
  }

  async function loader(args: RouteArgs<Context>) {
    let store;
    try {
      store = await storeFor(args);
    } catch (error) {
      console.error('[preview-feedback] admin access failed', error);
      return json({ok: false, error: 'unavailable'}, 502);
    }
    if (!store) return notFound();
    try {
      return json({ok: true, items: await store.list()});
    } catch (error) {
      console.error('[preview-feedback] list failed', error);
      return json({ok: false, error: 'unavailable'}, 502);
    }
  }

  async function action(args: RouteArgs<Context>) {
    if (args.request.method !== 'POST') {
      throw new Response('Method not allowed', {status: 405});
    }
    let store;
    try {
      store = await storeFor(args);
    } catch (error) {
      console.error('[preview-feedback] admin access failed', error);
      return json({ok: false, error: 'unavailable'}, 502);
    }
    if (!store) return notFound();

    const form = await args.request.formData();
    // Honeypot against bots that find a public preview URL.
    if (form.get('website')) return json({ok: false, error: 'invalid'}, 400);

    try {
      const intent = form.get('intent');
      const id = String(form.get('id') ?? '');
      if (intent === 'create') {
        const input = parseNewFeedback(form);
        if (!input) return json({ok: false, error: 'invalid'}, 400);
        await store.create(input);
      } else if (intent === 'reply') {
        const reply = parseReply(form);
        if (!reply || !id) return json({ok: false, error: 'invalid'}, 400);
        await store.reply(id, reply);
      } else if (intent === 'status') {
        const status = form.get('status') as FeedbackStatus;
        if (!id || !FEEDBACK_STATUS.includes(status)) {
          return json({ok: false, error: 'invalid'}, 400);
        }
        await store.setStatus(id, status);
      } else {
        return json({ok: false, error: 'invalid'}, 400);
      }
      return json({ok: true, items: await store.list()});
    } catch (error) {
      console.error('[preview-feedback] write failed', error);
      return json({ok: false, error: 'unavailable'}, 502);
    }
  }

  return {loader, action};
}
