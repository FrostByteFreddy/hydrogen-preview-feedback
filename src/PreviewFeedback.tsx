import {useEffect, useMemo, useState} from 'react';
import {useFetcher, useLocation, useNavigate} from 'react-router';
import {
  LOCALES,
  type PreviewFeedbackLabels,
  type PreviewFeedbackLocale,
} from './labels.js';
import type {
  FeedbackAnchor,
  FeedbackItem,
  FeedbackResponse,
  FeedbackStatus,
} from './shared.js';

const POPOVER_W = 320;

export type PreviewFeedbackProps = {
  /** URL of the route created with createPreviewFeedbackRoute. */
  endpoint?: string;
  /** Built-in UI language. */
  locale?: PreviewFeedbackLocale;
  /** Override single labels of the chosen locale. */
  labels?: Partial<PreviewFeedbackLabels>;
  /** Locale for dates, e.g. "de-CH". Defaults to the browser's. */
  dateLocale?: string;
  /** localStorage key that remembers the commenter's name. */
  storageKey?: string;
};

type Point = {x: number; y: number};
type Draft = {anchor: FeedbackAnchor | null; element: string; at: Point | null};

/**
 * Review comments on a preview: click a spot, leave a comment, and it shows
 * up as a numbered pin for everyone who opens the preview. Render it only
 * on preview hosts (see isPreviewHost).
 */
export function PreviewFeedback({
  endpoint = '/api/preview-feedback',
  locale = 'en',
  labels,
  dateLocale,
  storageKey = 'hydrogen-preview-feedback-author',
}: PreviewFeedbackProps) {
  const t = useMemo(() => ({...LOCALES[locale], ...labels}), [locale, labels]);
  const list = useFetcher<FeedbackResponse>();
  const write = useFetcher<FeedbackResponse>();
  const {pathname, search} = useLocation();
  const navigate = useNavigate();

  const [mounted, setMounted] = useState(false);
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [panel, setPanel] = useState(false);
  const [hideDone, setHideDone] = useState(false);
  const [author, setAuthor] = useState('');
  const [, setLayoutTick] = useState(0);

  useEffect(() => {
    setMounted(true);
    try {
      setAuthor(localStorage.getItem(storageKey) ?? '');
    } catch {
      // Storage blocked: the name just isn't remembered.
    }
    void list.load(endpoint);
    // Pins follow layout changes (images loading, steps switching).
    const relayout = () => setLayoutTick((n) => n + 1);
    const interval = window.setInterval(relayout, 1500);
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') void list.load(endpoint);
    }, 30_000);
    window.addEventListener('resize', relayout);
    return () => {
      window.clearInterval(interval);
      window.clearInterval(poll);
      window.removeEventListener('resize', relayout);
    };
  }, []);

  useEffect(() => {
    if (list.data?.ok) setItems(list.data.items);
  }, [list.data]);

  useEffect(() => {
    if (write.data?.ok) {
      setItems(write.data.items);
      setDraft(null);
    }
  }, [write.data]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setPicking(false);
      setDraft(null);
      setOpenId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!mounted) return null;

  const saving = write.state !== 'idle';
  const failed = write.data?.ok === false;
  const onPage = items.filter((item) => samePath(item.page, pathname));
  const openItem = items.find((item) => item.id === openId) ?? null;
  const openCount = items.filter((item) => item.status === 'open').length;

  const rememberAuthor = (name: string) => {
    setAuthor(name);
    try {
      localStorage.setItem(storageKey, name);
    } catch {
      // Not remembered, still submitted.
    }
  };

  const submit = (fields: Record<string, string>) => {
    void write.submit(fields, {method: 'post', action: endpoint});
  };

  const startPicking = () => {
    setDraft(null);
    setOpenId(null);
    setPanel(false);
    setPicking(true);
  };

  const pick = (event: React.MouseEvent) => {
    const {clientX, clientY} = event;
    const target = document
      .elementsFromPoint(clientX, clientY)
      .find((el) => !el.closest('[data-preview-feedback]'));
    const at = {x: clientX + window.scrollX, y: clientY + window.scrollY};
    const anchor: FeedbackAnchor = {
      selector: '',
      rx: 0,
      ry: 0,
      px: at.x / document.documentElement.scrollWidth,
      py: at.y,
    };
    if (target) {
      const rect = target.getBoundingClientRect();
      anchor.selector = cssPath(target);
      anchor.rx = rect.width ? (clientX - rect.left) / rect.width : 0;
      anchor.ry = rect.height ? (clientY - rect.top) / rect.height : 0;
    }
    setPicking(false);
    setDraft({anchor, element: describe(target), at});
  };

  const goTo = (item: FeedbackItem) => {
    setPanel(false);
    setOpenId(item.id);
    if (!samePath(item.page, pathname)) {
      void navigate(item.page);
      return;
    }
    const at = item.anchor ? locate(item.anchor) : null;
    if (at) {
      window.scrollTo({
        top: Math.max(at.y - window.innerHeight / 3, 0),
        behavior: 'smooth',
      });
    }
  };

  return (
    <div data-preview-feedback className="pf-root">
      <div className="pf-layer">
        {onPage.map((item) => {
          const at = item.anchor ? locate(item.anchor) : null;
          if (!at) return null;
          return (
            <button
              key={item.id}
              type="button"
              className={`pf-pin${item.status === 'resolved' ? ' is-done' : ''}${
                item.id === openId ? ' is-active' : ''
              }`}
              style={{left: at.x, top: at.y}}
              aria-label={t.openPin(item.number)}
              onClick={() => {
                setDraft(null);
                setOpenId(item.id === openId ? null : item.id);
              }}
            >
              {item.number}
            </button>
          );
        })}
        {draft?.at && (
          <span
            className="pf-pin is-draft"
            style={{left: draft.at.x, top: draft.at.y}}
          >
            +
          </span>
        )}
      </div>

      {draft && (
        <Popover
          at={draft.at}
          onClose={() => setDraft(null)}
          title={t.newComment}
          closeLabel={t.close}
        >
          <form
            className="pf-form"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const name = String(form.get('author') ?? '').trim();
              rememberAuthor(name);
              submit({
                intent: 'create',
                comment: String(form.get('comment') ?? ''),
                author: name,
                website: String(form.get('website') ?? ''),
                page: `${pathname}${search}`,
                anchor:
                  draft.anchor && draft.at ? JSON.stringify(draft.anchor) : '',
                element: draft.element,
                context: deviceContext(),
              });
            }}
          >
            {draft.element && <p className="pf-meta">{draft.element}</p>}
            <label className="pf-field">
              <span>{t.yourName}</span>
              <input
                name="author"
                defaultValue={author}
                placeholder={t.namePlaceholder}
                maxLength={60}
                autoComplete="name"
              />
            </label>
            <label className="pf-field">
              <span>{t.commentLabel}</span>
              <textarea
                name="comment"
                required
                ref={focusOnMount}
                rows={4}
                maxLength={2000}
                placeholder={t.commentPlaceholder}
                onKeyDown={submitOnCmdEnter}
              />
            </label>
            <input
              name="website"
              className="pf-hp"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
            />
            {failed && (
              <p className="pf-error">
                {t.saveFailed}
              </p>
            )}
            <div className="pf-actions">
              <button
                type="button"
                className="pf-ghost"
                onClick={() => setDraft(null)}
              >
                {t.cancel}
              </button>
              <button type="submit" className="pf-primary" disabled={saving}>
                {saving ? t.saving : t.save}
              </button>
            </div>
          </form>
        </Popover>
      )}

      {openItem && !draft && (
        <Popover
          at={
            openItem.anchor && samePath(openItem.page, pathname)
              ? locate(openItem.anchor)
              : null
          }
          onClose={() => setOpenId(null)}
          title={`#${openItem.number} · ${openItem.status === 'resolved' ? t.statusResolved : t.statusOpen}`}
          closeLabel={t.close}
        >
          <Thread
            item={openItem}
            author={author}
            saving={saving}
            failed={failed}
            labels={t}
            dateLocale={dateLocale}
            onReply={(text, name) => {
              rememberAuthor(name);
              submit({intent: 'reply', id: openItem.id, text, author: name});
            }}
            onStatus={(status) =>
              submit({intent: 'status', id: openItem.id, status})
            }
          />
        </Popover>
      )}

      {picking && (
        <div className="pf-overlay" onClick={pick}>
          <p className="pf-hint" onClick={(event) => event.stopPropagation()}>
            {t.pickHint}
            <button
              type="button"
              onClick={() => {
                setPicking(false);
                setDraft({anchor: null, element: '', at: null});
              }}
            >
              {t.withoutSpot}
            </button>
            <button type="button" onClick={() => setPicking(false)}>
              {t.cancel}
            </button>
          </p>
        </div>
      )}

      {panel && (
        <aside className="pf-panel" aria-label={t.allComments}>
          <div className="pf-panel-head">
            <strong>{t.allComments}</strong>
            <label>
              <input
                type="checkbox"
                checked={hideDone}
                onChange={(e) => setHideDone(e.target.checked)}
              />
              {t.hideResolved}
            </label>
            <button
              type="button"
              className="pf-close"
              aria-label={t.close}
              onClick={() => setPanel(false)}
            >
              ×
            </button>
          </div>
          {items.length === 0 && (
            <p className="pf-empty">{t.empty}</p>
          )}
          <ol className="pf-list">
            {items
              .filter((item) => !hideDone || item.status === 'open')
              .map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => goTo(item)}
                    className={item.status === 'resolved' ? 'is-done' : ''}
                  >
                    <span className="pf-num">{item.number}</span>
                    <span className="pf-text">
                      {item.comment}
                      <small>
                        {item.author || t.unknownAuthor} · {pageLabel(item.page, t.homePage)}
                        {item.replies.length > 0 &&
                          ` · ${t.replies(item.replies.length)}`}
                      </small>
                    </span>
                  </button>
                </li>
              ))}
          </ol>
        </aside>
      )}

      <div className="pf-bar">
        <button type="button" className="pf-primary" onClick={startPicking}>
          {t.comment}
        </button>
        <button
          type="button"
          className="pf-ghost"
          onClick={() => setPanel(!panel)}
          aria-expanded={panel}
        >
          {t.openCount(openCount)}
        </button>
      </div>
    </div>
  );
}

function Popover({
  at,
  title,
  closeLabel,
  onClose,
  children,
}: {
  at: Point | null;
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  let style: React.CSSProperties | undefined;
  if (at) {
    const right = window.scrollX + window.innerWidth - 12;
    const left =
      at.x + 22 + POPOVER_W > right ? at.x - 22 - POPOVER_W : at.x + 22;
    style = {
      left: Math.max(left, window.scrollX + 12),
      top: Math.max(at.y - 20, 12),
    };
  }
  return (
    <div
      className={`pf-pop${at ? '' : ' is-floating'}`}
      style={style}
      role="dialog"
      aria-label={title}
    >
      <div className="pf-pop-head">
        <strong>{title}</strong>
        <button
          type="button"
          className="pf-close"
          aria-label={closeLabel}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {children}
    </div>
  );
}

function Thread({
  item,
  author,
  saving,
  failed,
  labels: t,
  dateLocale,
  onReply,
  onStatus,
}: {
  item: FeedbackItem;
  author: string;
  saving: boolean;
  failed: boolean;
  labels: PreviewFeedbackLabels;
  dateLocale?: string;
  onReply: (text: string, author: string) => void;
  onStatus: (status: FeedbackStatus) => void;
}) {
  return (
    <div className="pf-thread">
      <Message
        author={item.author || t.unknownAuthor}
        at={item.createdAt}
        text={item.comment}
        dateLocale={dateLocale}
      />
      {item.element && <p className="pf-meta">{item.element}</p>}
      {item.replies.map((reply, index) => (
        <Message
          key={index}
          author={reply.author || t.unknownAuthor}
          at={reply.at}
          text={reply.text}
          dateLocale={dateLocale}
        />
      ))}
      <form
        key={item.replies.length}
        className="pf-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          onReply(
            String(form.get('text') ?? ''),
            String(form.get('author') ?? '').trim(),
          );
        }}
      >
        <label className="pf-field">
          <span>{t.yourName}</span>
          <input
            name="author"
            defaultValue={author}
            placeholder={t.namePlaceholder}
            maxLength={60}
            autoComplete="name"
          />
        </label>
        <label className="pf-field">
          <span>{t.reply}</span>
          <textarea
            name="text"
            required
            rows={2}
            maxLength={2000}
            placeholder={t.replyPlaceholder}
            onKeyDown={submitOnCmdEnter}
          />
        </label>
        {failed && (
          <p className="pf-error">
            {t.saveFailed}
          </p>
        )}
        <div className="pf-actions">
          <button
            type="button"
            className="pf-ghost"
            disabled={saving}
            onClick={() =>
              onStatus(item.status === 'open' ? 'resolved' : 'open')
            }
          >
            {item.status === 'open' ? t.markResolved : t.reopen}
          </button>
          <button type="submit" className="pf-primary" disabled={saving}>
            {t.sendReply}
          </button>
        </div>
      </form>
    </div>
  );
}

function Message({
  author,
  at,
  text,
  dateLocale,
}: {
  author: string;
  at: string;
  text: string;
  dateLocale?: string;
}) {
  const date = at ? new Date(at) : null;
  return (
    <div className="pf-msg">
      <p className="pf-msg-head">
        <strong>{author}</strong>
        {date && !Number.isNaN(date.getTime()) && (
          <time dateTime={at}>
            {date.toLocaleString(dateLocale, {
              dateStyle: 'short',
              timeStyle: 'short',
            })}
          </time>
        )}
      </p>
      <p className="pf-msg-text">{text}</p>
    </div>
  );
}

/** Stable callback ref, so the field is focused once when it appears and
 * not again on every re-render. */
function focusOnMount(el: HTMLTextAreaElement | null) {
  el?.focus();
}

function submitOnCmdEnter(event: React.KeyboardEvent<HTMLTextAreaElement>) {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }
}

function samePath(page: string, pathname: string) {
  return page.split('?')[0] === pathname;
}

function pageLabel(page: string, homeLabel: string) {
  const path = page.split('?')[0];
  return path === '/' ? homeLabel : path;
}

/** Page position of an anchor: on its element if it's still there and
 * visible, otherwise the stored page coordinates. */
function locate(anchor: FeedbackAnchor): Point {
  let el: Element | null = null;
  try {
    el = anchor.selector ? document.querySelector(anchor.selector) : null;
  } catch {
    el = null;
  }
  if (el) {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return {
        x: rect.left + window.scrollX + anchor.rx * rect.width,
        y: rect.top + window.scrollY + anchor.ry * rect.height,
      };
    }
  }
  return {x: anchor.px * document.documentElement.scrollWidth, y: anchor.py};
}

function cssPath(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node !== document.body && node !== document.documentElement) {
    if (node.id) {
      parts.unshift(`#${CSS.escape(node.id)}`);
      return parts.join(' > ');
    }
    const parent: Element | null = node.parentElement;
    if (!parent) break;
    const tag = node.tagName;
    const siblings = Array.from(parent.children).filter(
      (child) => child.tagName === tag,
    );
    const name = tag.toLowerCase();
    parts.unshift(
      siblings.length > 1
        ? `${name}:nth-of-type(${siblings.indexOf(node) + 1})`
        : name,
    );
    node = parent;
  }
  return ['body', ...parts].join(' > ');
}

/** Short human description of the clicked element for the admin entry. */
function describe(el: Element | undefined): string {
  if (!el) return '';
  const section = el.closest(
    'section[id], section[aria-label], header, footer, [id]',
  );
  const where = section
    ? section.id
      ? `#${section.id}`
      : (section.getAttribute('aria-label') ?? section.tagName.toLowerCase())
    : '';
  const text =
    el.getAttribute('aria-label') ??
    el.getAttribute('alt') ??
    (el instanceof HTMLElement ? el.innerText : '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 80);
  const what = `${el.tagName.toLowerCase()}${text ? ` «${text}»` : ''}`;
  return [where, what].filter(Boolean).join(' · ').slice(0, 250);
}

function deviceContext() {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : '';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : '';
  return `${window.innerWidth}×${window.innerHeight} · ${[browser, os].filter(Boolean).join(' / ')}`;
}
