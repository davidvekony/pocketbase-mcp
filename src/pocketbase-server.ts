import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import PocketBase from 'pocketbase';
import { registerAuthTools } from './tools/auth.js';
import { registerBackupTools } from './tools/backup.js';
import { registerCollectionTools } from './tools/collections.js';
import { registerRecordTools } from './tools/records.js';
import type { ToolContext } from './tools/result.js';

export class PocketBaseServer {
  private readonly server: McpServer;
  private readonly context: ToolContext;

  constructor() {
    const url = process.env.POCKETBASE_URL;
    if (!url) {
      throw new Error('POCKETBASE_URL environment variable is required');
    }

    const pb = new PocketBase(url);
    const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL ?? '';
    const adminPassword = process.env.POCKETBASE_ADMIN_PASSWORD ?? '';

    this.context = {
      pb,
      authorizeAsAdmin: async () => {
        await pb.collection('_superusers').authWithPassword(adminEmail, adminPassword);
      },
    };

    this.server = new McpServer(
      { name: 'pocketbase-server', version: '0.1.0' },
      {
        instructions:
          'This server manages a single PocketBase instance at POCKETBASE_URL. Collection management, backups, and impersonation require POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD. User-scoped auth tools share one session auth state, so call authenticate_user before request_email_change or auth_refresh.',
      }
    );
    this.server.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    registerCollectionTools(this.server, this.context);
    registerRecordTools(this.server, this.context);
    registerAuthTools(this.server, this.context);
    registerBackupTools(this.server, this.context);

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('PocketBase MCP server running on stdio');
  }
}
