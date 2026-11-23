/**
 * Comments stored as Shopify metaobjects (Content > Metaobjects in the
 * admin). The definition is created on first use.
 */
import type {AdminGraphql} from './admin.js';
import {
  FEEDBACK_STATUS,
  newFeedbackFields,
  parseReplies,
  toFeedbackItems,
  type FeedbackItem,
  type FeedbackReply,
  type FeedbackStatus,
  type NewFeedback,
} from './shared.js';

export const DEFAULT_METAOBJECT_TYPE = 'preview_feedback';

const DEFINITION_QUERY = `
  query PreviewFeedbackDefinition($type: String!) {
    metaobjectDefinitionByType(type: $type) {
      id
    }
  }
`;

const DEFINITION_CREATE = `
  mutation PreviewFeedbackDefinitionCreate(
    $definition: MetaobjectDefinitionCreateInput!
  ) {
    metaobjectDefinitionCreate(definition: $definition) {
      metaobjectDefinition {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const LIST_QUERY = `
  query PreviewFeedbackList($type: String!) {
    metaobjects(type: $type, first: 250, sortKey: "id") {
      nodes {
        id
        fields {
          key
          value
        }
      }
    }
  }
`;

const ONE_QUERY = `
  query PreviewFeedbackOne($id: ID!) {
    metaobject(id: $id) {
      type
      replies: field(key: "replies") {
        value
      }
    }
  }
`;

const CREATE = `
  mutation PreviewFeedbackCreate($metaobject: MetaobjectCreateInput!) {
    metaobjectCreate(metaobject: $metaobject) {
      metaobject {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const UPDATE = `
  mutation PreviewFeedbackUpdate($id: ID!, $metaobject: MetaobjectUpdateInput!) {
    metaobjectUpdate(id: $id, metaobject: $metaobject) {
      metaobject {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

function definitionFor(type: string) {
  return {
    name: 'Preview feedback',
    type,
    description:
      'Comments left on preview deployments (hydrogen-preview-feedback). Safe to delete after launch.',
    displayNameKey: 'comment',
    access: {storefront: 'NONE'},
    fieldDefinitions: [
      {key: 'comment', name: 'Comment', type: 'multi_line_text_field', required: true},
      {key: 'author', name: 'Author', type: 'single_line_text_field'},
      {key: 'page', name: 'Page', type: 'single_line_text_field'},
      {key: 'element', name: 'Element', type: 'single_line_text_field'},
      {key: 'context', name: 'Device', type: 'single_line_text_field'},
      {
        key: 'status',
        name: 'Status',
        type: 'single_line_text_field',
        validations: [{name: 'choices', value: JSON.stringify(FEEDBACK_STATUS)}],
      },
      {key: 'created_at', name: 'Created', type: 'date_time'},
      {key: 'anchor', name: 'Position', type: 'json'},
      {key: 'replies', name: 'Replies', type: 'json'},
    ],
  };
}

function assertOk(result: {data?: any; errors?: unknown}, field?: string) {
  if (result.errors) {
    throw new Error(`Admin API error: ${JSON.stringify(result.errors)}`);
  }
  const userErrors = field ? (result.data?.[field]?.userErrors ?? []) : [];
  if (userErrors.length > 0) {
    throw new Error(`${field}: ${JSON.stringify(userErrors)}`);
  }
}

export function createFeedbackStore(
  admin: AdminGraphql,
  type: string = DEFAULT_METAOBJECT_TYPE,
) {
  let definitionReady = false;

  async function ensureDefinition() {
    if (definitionReady) return;
    const found = await admin(DEFINITION_QUERY, {type});
    assertOk(found);
    if (!found.data?.metaobjectDefinitionByType) {
      const created = await admin(DEFINITION_CREATE, {
        definition: definitionFor(type),
      });
      assertOk(created, 'metaobjectDefinitionCreate');
    }
    definitionReady = true;
  }

  /** Loads a comment and checks it is one of ours, not some other
   * metaobject reachable through a crafted ID. */
  async function loadOwn(id: string) {
    const found = await admin(ONE_QUERY, {id});
    assertOk(found);
    const node = found.data?.metaobject;
    if (!node || node.type !== type) throw new Error('Not found');
    return node as {replies: {value: string | null} | null};
  }

  async function update(id: string, fields: Array<{key: string; value: string}>) {
    const result = await admin(UPDATE, {id, metaobject: {fields}});
    assertOk(result, 'metaobjectUpdate');
  }

  return {
    async list(): Promise<FeedbackItem[]> {
      await ensureDefinition();
      const result = await admin(LIST_QUERY, {type});
      assertOk(result);
      return toFeedbackItems(result.data?.metaobjects?.nodes ?? []);
    },

    async create(input: NewFeedback) {
      await ensureDefinition();
      const result = await admin(CREATE, {
        metaobject: {type, fields: newFeedbackFields(input)},
      });
      assertOk(result, 'metaobjectCreate');
    },

    async reply(id: string, reply: FeedbackReply) {
      const node = await loadOwn(id);
      const replies = [...parseReplies(node.replies?.value), reply];
      await update(id, [{key: 'replies', value: JSON.stringify(replies)}]);
    },

    async setStatus(id: string, status: FeedbackStatus) {
      await loadOwn(id);
      await update(id, [{key: 'status', value: status}]);
    },
  };
}
