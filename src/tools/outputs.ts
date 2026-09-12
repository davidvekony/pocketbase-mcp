import { z } from 'zod';

export const recordOutput = z.looseObject({
  id: z.string().describe('Record ID'),
  collectionId: z.string().describe('ID of the collection the record belongs to'),
  collectionName: z.string().describe('Name of the collection the record belongs to'),
  created: z.string().optional().describe('Record creation timestamp'),
  updated: z.string().optional().describe('Record last update timestamp'),
});

export const collectionOutput = z.looseObject({
  id: z.string().describe('Collection ID'),
  name: z.string().describe('Collection name'),
  type: z.string().describe('Collection type'),
  system: z.boolean().optional().describe('Whether this is a system collection'),
  fields: z.array(z.looseObject({})).optional().describe('Collection fields'),
});

export const recordPageOutput = z.object({
  page: z.number().describe('Current page number'),
  perPage: z.number().describe('Number of items per page'),
  totalItems: z.number().describe('Total number of records'),
  totalPages: z.number().describe('Total number of pages'),
  items: z.array(recordOutput).describe('Records in this page'),
});

export const collectionListOutput = z.object({
  page: z.number().optional().describe('Current page number'),
  perPage: z.number().optional().describe('Number of items per page'),
  totalItems: z.number().optional().describe('Total number of collections'),
  totalPages: z.number().optional().describe('Total number of pages'),
  items: z.array(collectionOutput).describe('Collections'),
});

export const authResponseOutput = z.object({
  token: z.string().describe('Authentication token'),
  record: recordOutput.describe('Authenticated record'),
  meta: z.looseObject({}).optional().describe('Additional authentication metadata (OAuth2)'),
});

export const successOutput = z.object({
  success: z.boolean().describe('Whether the operation succeeded'),
});

export const messageOutput = z.object({
  success: z.literal(true).describe('Whether the operation succeeded'),
  message: z.string().describe('Human readable result message'),
});

export const importSummaryOutput = z.object({
  created: z.number().describe('Number of created records'),
  updated: z.number().describe('Number of updated records'),
  failed: z.number().describe('Number of failed records'),
  errors: z
    .array(z.object({ index: z.number(), error: z.string() }))
    .describe('Errors for failed records'),
});
