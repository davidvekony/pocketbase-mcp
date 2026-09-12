import type PocketBase from 'pocketbase';
import type { CallToolResult } from '@modelcontextprotocol/server';
import { pocketbaseErrorMessage } from '../errors.js';

export interface ToolContext {
  pb: PocketBase;
  authorizeAsAdmin: () => Promise<void>;
}

export function textResult(data: unknown): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

export function textMessage(message: string): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: message,
      },
    ],
  };
}

export async function runTool<T>(prefix: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw new Error(`${prefix}: ${pocketbaseErrorMessage(error)}`);
  }
}
