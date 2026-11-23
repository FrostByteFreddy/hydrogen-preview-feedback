# hydrogen-preview-feedback

Pin comments on your **Shopify Hydrogen** preview deployments.

Your client opens the Oxygen preview, clicks **Comment**, clicks the spot they mean and writes what should change. The comment shows up as a numbered pin for everyone who opens the preview, with replies and an open/resolved status. A list shows every comment across all pages.

Comments are stored as **metaobjects in the store itself**, so there's no extra service, no database and no third-party script. The widget only renders on preview hosts (`*.myshopify.dev`, `localhost`), never on your live domain.

- Pins stick to the element that was clicked, so they survive layout changes and other screen sizes
- Each comment records the page (with query string), the clicked element and the device/browser
- English and German built in, every label can be overridden
- Themeable with CSS variables, about 6 KB of CSS, no dependencies besides React and React Router

> Status: early (0.x). It's used in production previews, but the API may still change.

## Requirements

- A Hydrogen (React Router 7) storefront
- Admin API access to the store with these scopes:
  `read_metaobjects`, `write_metaobjects`, `read_metaobject_definitions`, `write_metaobject_definitions`

## Setup

### 1. Install

```sh
npm install hydrogen-preview-feedback
```

### 2. Admin API access

Create an app in the [Shopify Dev Dashboard](https://dev.shopify.com/dashboard) with the scopes above and install it on the store. Then add its credentials to your environment (locally in `.env`, on Oxygen under **Hydrogen → Storefront → Environments and variables**):

```sh
PRIVATE_SHOPIFY_CLIENT_ID=...
PRIVATE_SHOPIFY_CLIENT_SECRET=...
```

The package exchanges them for a short-lived Admin API token (client credentials grant) and caches it. This only works while the app and the store belong to the **same Shopify organization**. If you have a fixed Admin API access token instead, pass `{storeDomain, accessToken}`.

### 3. Add the route

`app/routes/api.preview-feedback.tsx`:

```ts
import {createPreviewFeedbackRoute} from 'hydrogen-preview-feedback/server';

export const {loader, action} = createPreviewFeedbackRoute({
  credentials: (context: any) =>
    context.env.PRIVATE_SHOPIFY_CLIENT_ID
      ? {
          storeDomain: context.env.PUBLIC_STORE_DOMAIN,
          clientId: context.env.PRIVATE_SHOPIFY_CLIENT_ID,
          clientSecret: context.env.PRIVATE_SHOPIFY_CLIENT_SECRET,
        }
      : null,
});
```

The comment metaobject definition (`preview_feedback`) is created automatically on first use. On non-preview hosts, or without credentials, the route answers 404.

### 4. Render the widget

In `app/root.tsx`, decide in the loader whether to show it, and render it next to your layout:

```tsx
import {PreviewFeedback, isPreviewHost} from 'hydrogen-preview-feedback';
import previewFeedbackStyles from 'hydrogen-preview-feedback/styles.css?url';

export function links() {
  return [/* ... */ {rel: 'stylesheet', href: previewFeedbackStyles}];
}

export async function loader({request, context}: Route.LoaderArgs) {
  return {
    // ...
    previewFeedback:
      isPreviewHost(new URL(request.url).hostname) &&
      Boolean(context.env.PRIVATE_SHOPIFY_CLIENT_ID),
  };
}

export default function App() {
  const data = useRouteLoaderData<typeof loader>('root');
  return (
    <>
      <Outlet />
      {data?.previewFeedback && <PreviewFeedback locale="en" />}
    </>
  );
}
```

That's it. Deploy, open the preview and click **Comment** in the bottom left corner.

## Options

### `<PreviewFeedback />`

| Prop | Default | |
|---|---|---|
| `endpoint` | `"/api/preview-feedback"` | URL of your route |
| `locale` | `"en"` | `"en"` or `"de"` |
| `labels` | | Override single labels, e.g. `{comment: 'Feedback'}` |
| `dateLocale` | browser locale | Locale for dates, e.g. `"de-CH"` |
| `storageKey` | `"hydrogen-preview-feedback-author"` | localStorage key that remembers the commenter's name |

### `createPreviewFeedbackRoute(options)`

| Option | Default | |
|---|---|---|
| `credentials(context)` | required | Returns `{storeDomain, clientId, clientSecret}`, `{storeDomain, accessToken}` or `null` |
| `isPreviewHost(hostname)` | `*.myshopify.dev` and `localhost` | Which hosts may use the route |
| `metaobjectType` | `"preview_feedback"` | Metaobject type for the comments |
| `apiVersion` | `"2026-04"` | Admin API version |

If you pass your own `isPreviewHost` to the route, use the same check in your root loader.

### Theming

Override the CSS variables on `.pf-root`:

```css
.pf-root {
  --pf-accent: #1d4ed8; /* buttons, pins, headings */
  --pf-resolved: #15803d; /* resolved pins */
  --pf-draft: #fde047; /* the pin while writing */
}
```

All variables: `--pf-accent`, `--pf-accent-text`, `--pf-resolved`, `--pf-draft`, `--pf-text`, `--pf-muted`, `--pf-border`, `--pf-subtle`, `--pf-overlay`, `--pf-surface`.

## Managing comments

Comments are regular metaobjects: Shopify admin → **Content → Metaobjects → Preview feedback**. You can read, edit or delete them there. Before launch, delete the entries and the definition, and remove the app or its credentials.

## Security notes

- The widget and the route only work on preview hosts. Your production domain answers 404.
- Anyone who can open the preview can read and write comments. Oxygen previews are private by default (Shopify login required). If you share a public preview link, treat the comments as visible to whoever has that link.
- The route only touches metaobjects of its own type; IDs of other metaobjects are rejected.
- A hidden honeypot field filters simple bots.

## Limitations and roadmap

- No screenshots yet (the page URL, element and device are recorded instead)
- No per-user accounts or access tokens for public previews
- Up to 250 comments per store
- Client credentials need the app and the store in the same Shopify organization; for client stores in another organization, create the app in that organization or use an Admin API token

Contributions and ideas are welcome.

## License

MIT
