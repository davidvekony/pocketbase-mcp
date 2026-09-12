import type PocketBase from 'pocketbase';
import type { CallToolResult } from '@modelcontextprotocol/server';
import { pocketbaseErrorMessage } from '../errors.js';

export interface ToolContext {
  pb: PocketBase;
  authorizeAsAdmin: () => Promise<void>;
}

export function jsonResult(data: object): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2),
      },
    ],
    structuredContent: { ...data },
  };
}

export function messageResult(message: string): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: message,
      },
    ],
    structuredContent: { success: true, message },
  };
}

export function successResult(success: boolean): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ success }, null, 2),
      },
    ],
    structuredContent: { success },
  };
}

export async function runTool<T>(prefix: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw new Error(`${prefix}: ${pocketbaseErrorMessage(error)}`);
  }
}
