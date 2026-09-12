import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { ToolContext } from './result.js';
import { runTool, successResult } from './result.js';
import { successOutput } from './outputs.js';

export function registerBackupTools(server: McpServer, context: ToolContext): void {
  server.registerTool(
    'backup_database',
    {
      title: 'Backup Database',
      description: 'Create a backup of the PocketBase database',
      inputSchema: z.object({
        name: z.string().optional().describe('backup name'),
      }),
      outputSchema: successOutput,
    },
    async (args) =>
      runTool('Failed to backup database', async () => {
        await context.authorizeAsAdmin();
        const result = await context.pb.backups.create(args.name ?? '', {});
        return successResult(result);
      })
  );
}
