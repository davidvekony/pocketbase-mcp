import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { pocketbaseErrorMessage } from '../errors.js';
import type { ToolContext } from './result.js';
import { jsonResult, messageResult, runTool } from './result.js';
import { importSummaryOutput, messageOutput, recordOutput, recordPageOutput } from './outputs.js';

export function registerRecordTools(server: McpServer, context: ToolContext): void {
  server.registerTool(
    'create_record',
    {
      title: 'Create Record',
      description: 'Create a new record in a collection',
      inputSchema: z.object({
        collection: z.string().describe('Collection name'),
        data: z.looseObject({}).describe('Record data'),
      }),
      outputSchema: recordOutput,
    },
    async (args) =>
      runTool('Failed to create record', async () => {
        const result = await context.pb.collection(args.collection).create(args.data);
        return jsonResult(result);
      })
  );

  server.registerTool(
    'list_records',
    {
      title: 'List Records',
      description: 'List records from a collection with optional filters',
      annotations: { readOnlyHint: true },
      inputSchema: z.object({
        collection: z.string().describe('Collection name'),
        filter: z.string().optional().describe('Filter query'),
        sort: z.string().optional().describe('Sort field and direction'),
        page: z.number().optional().describe('Page number'),
        perPage: z.number().optional().describe('Items per page'),
      }),
      outputSchema: recordPageOutput,
    },
    async (args) =>
      runTool('Failed to list records', async () => {
        const result = await context.pb.collection(args.collection).getList(
          args.page || 1,
          args.perPage || 50,
          {
            filter: args.filter,
            sort: args.sort,
          }
        );
        return jsonResult(result);
      })
  );

  server.registerTool(
    'update_record',
    {
      title: 'Update Record',
      description: 'Update an existing record',
      inputSchema: z.object({
        collection: z.string().describe('Collection name'),
        id: z.string().describe('Record ID'),
        data: z.looseObject({}).describe('Updated record data'),
      }),
      outputSchema: recordOutput,
    },
    async (args) =>
      runTool('Failed to update record', async () => {
        const result = await context.pb.collection(args.collection).update(args.id, args.data);
        return jsonResult(result);
      })
  );

  server.registerTool(
    'delete_record',
    {
      title: 'Delete Record',
      description: 'Delete a record',
      annotations: { destructiveHint: true },
      inputSchema: z.object({
        collection: z.string().describe('Collection name'),
        id: z.string().describe('Record ID'),
      }),
      outputSchema: messageOutput,
    },
    async (args) =>
      runTool('Failed to delete record', async () => {
        await context.pb.collection(args.collection).delete(args.id);
        return messageResult(`Successfully deleted record ${args.id} from collection ${args.collection}`);
      })
  );

  server.registerTool(
    'import_data',
    {
      title: 'Import Data',
      description: 'Import data into a collection',
      inputSchema: z.object({
        collection: z.string().describe('Collection name'),
        data: z.array(z.looseObject({})).describe('Array of records to import'),
        mode: z
          .enum(['create', 'update', 'upsert'])
          .default('create')
          .describe('Import mode (default: create)'),
      }),
      outputSchema: importSummaryOutput,
    },
    async (args) =>
      runTool('Failed to import data', async () => {
        const service = context.pb.collection(args.collection);
        const summary = {
          created: 0,
          updated: 0,
          failed: 0,
          errors: [] as { index: number; error: string }[],
        };

        for (const [index, record] of args.data.entries()) {
          const id = typeof record.id === 'string' ? record.id : undefined;
          try {
            if (args.mode === 'create' || (args.mode === 'upsert' && !id)) {
              await service.create(record);
              summary.created += 1;
            } else {
              if (!id) {
                throw new Error('Record is missing an "id" for update mode');
              }
              const { id: _id, ...body } = record;
              await service.update(id, body);
              summary.updated += 1;
            }
          } catch (error) {
            summary.failed += 1;
            summary.errors.push({ index, error: pocketbaseErrorMessage(error) });
          }
        }

        return { ...jsonResult(summary), isError: summary.failed > 0 };
      })
  );
}
