import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { ToolContext } from './result.js';
import { runTool, textMessage, textResult } from './result.js';

const fieldSchema = z.looseObject({
  name: z.string().describe('Field name'),
  type: z
    .enum([
      'bool',
      'date',
      'number',
      'text',
      'email',
      'url',
      'editor',
      'autodate',
      'select',
      'file',
      'relation',
      'json',
      'geoPoint',
    ])
    .describe('Field type'),
  required: z.boolean().optional().describe('Is field required?'),
  values: z.array(z.string()).optional().describe('Allowed values for select type fields'),
  collectionId: z.string().optional().describe('Collection ID for relation type fields'),
});

const passwordAuthSchema = z.looseObject({
  enabled: z.boolean().optional().describe('Is password authentication enabled?'),
  identityFields: z
    .array(z.string())
    .optional()
    .describe('Fields used for identity in password authentication'),
});

const ruleFields = {
  createRule: z.string().optional().describe('API rule for creating records'),
  updateRule: z.string().optional().describe('API rule for updating records'),
  deleteRule: z.string().optional().describe('API rule for deleting records'),
  listRule: z.string().optional().describe('API rule for listing and viewing records'),
  viewRule: z.string().optional().describe('API rule for viewing a single record'),
};

export function registerCollectionTools(server: McpServer, context: ToolContext): void {
  server.registerTool(
    'create_collection',
    {
      title: 'Create Collection',
      description:
        'Create a new collection in PocketBase note never use created and updated because these are already created',
      inputSchema: z.looseObject({
        name: z
          .string()
          .describe('Unique collection name (used as a table name for the records table)'),
        type: z.enum(['base', 'view', 'auth']).default('base').describe('Type of the collection'),
        fields: z.array(fieldSchema).describe('List with the collection fields'),
        ...ruleFields,
        viewQuery: z.string().optional().describe('SQL query for view collections'),
        passwordAuth: passwordAuthSchema
          .optional()
          .describe('Password authentication options'),
      }),
    },
    async (args) =>
      runTool('Failed to create collection', async () => {
        await context.authorizeAsAdmin();

        const defaultFields = [
          {
            hidden: false,
            id: 'autodate_created',
            name: 'created',
            onCreate: true,
            onUpdate: false,
            presentable: false,
            system: false,
            type: 'autodate',
          },
          {
            hidden: false,
            id: 'autodate_updated',
            name: 'updated',
            onCreate: true,
            onUpdate: true,
            presentable: false,
            system: false,
            type: 'autodate',
          },
        ];

        const collectionData = {
          ...args,
          fields: [...(args.fields || []), ...defaultFields],
        };

        const result = await context.pb.collections.create(collectionData as any);
        return textResult(result);
      })
  );

  server.registerTool(
    'update_collection',
    {
      title: 'Update Collection',
      description: 'Update an existing collection in PocketBase (admin only)',
      inputSchema: z.looseObject({
        collectionIdOrName: z
          .string()
          .describe('ID or name of the collection to update'),
        name: z.string().optional().describe('New unique collection name'),
        type: z.enum(['base', 'view', 'auth']).optional().describe('Type of the collection'),
        fields: z
          .array(fieldSchema)
          .optional()
          .describe(
            'List with the new collection fields. If not empty, the old schema will be replaced with the new one.'
          ),
        ...ruleFields,
        viewQuery: z.string().optional().describe('SQL query for view collections'),
        passwordAuth: passwordAuthSchema
          .optional()
          .describe('Password authentication options'),
      }),
    },
    async (args) =>
      runTool('Failed to update collection', async () => {
        await context.authorizeAsAdmin();

        const { collectionIdOrName, ...updateData } = args;
        const result = await context.pb.collections.update(collectionIdOrName, updateData as any);
        return textResult(result);
      })
  );

  server.registerTool(
    'get_collection',
    {
      title: 'Get Collection',
      description: 'Get details for a collection',
      annotations: { readOnlyHint: true },
      inputSchema: z.object({
        collectionIdOrName: z
          .string()
          .describe('ID or name of the collection to view'),
        fields: z
          .string()
          .optional()
          .describe('Comma separated string of the fields to return in the JSON response'),
      }),
    },
    async (args) =>
      runTool('Failed to get collection', async () => {
        await context.authorizeAsAdmin();

        const collection = await context.pb.collections.getOne(args.collectionIdOrName, {
          fields: args.fields,
        });

        return textResult(collection);
      })
  );

  server.registerTool(
    'list_collections',
    {
      title: 'List Collections',
      description: 'List all collections in PocketBase',
      annotations: { readOnlyHint: true },
      inputSchema: z.object({
        filter: z.string().optional().describe('Filter query for collections'),
        sort: z.string().optional().describe('Sort order for collections'),
      }),
    },
    async (args) =>
      runTool('Failed to list collections', async () => {
        await context.authorizeAsAdmin();

        let collections: unknown;
        if (args.filter) {
          collections = await context.pb.collections.getFirstListItem(args.filter);
        } else if (args.sort) {
          collections = await context.pb.collections.getFullList({ sort: args.sort });
        } else {
          collections = await context.pb.collections.getList(1, 100);
        }

        return textResult(collections);
      })
  );

  server.registerTool(
    'delete_collection',
    {
      title: 'Delete Collection',
      description: 'Delete a collection from PocketBase (admin only)',
      annotations: { destructiveHint: true },
      inputSchema: z.object({
        collectionIdOrName: z
          .string()
          .describe('ID or name of the collection to delete'),
      }),
    },
    async (args) =>
      runTool('Failed to delete collection', async () => {
        await context.authorizeAsAdmin();

        await context.pb.collections.delete(args.collectionIdOrName);

        return textMessage(`Successfully deleted collection ${args.collectionIdOrName}`);
      })
  );
}
