import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.mjs';

const EXPECTED_TOOLS = [
  'create_collection',
  'update_collection',
  'create_record',
  'list_records',
  'update_record',
  'delete_record',
  'list_auth_methods',
  'authenticate_user',
  'authenticate_with_oauth2',
  'authenticate_with_otp',
  'auth_refresh',
  'request_verification',
  'confirm_verification',
  'request_password_reset',
  'confirm_password_reset',
  'request_email_change',
  'confirm_email_change',
  'impersonate_user',
  'create_user',
  'get_collection',
  'backup_database',
  'import_data',
  'list_collections',
  'delete_collection',
];

const READ_ONLY = new Set([
  'get_collection',
  'list_collections',
  'list_records',
  'list_auth_methods',
]);

const DESTRUCTIVE = new Set(['delete_collection', 'delete_record']);

function readAnnotation(tool, hint) {
  return tool.annotations ? tool.annotations[hint] : undefined;
}

function assertToolAnnotations(tool) {
  if (READ_ONLY.has(tool.name)) {
    assert.equal(readAnnotation(tool, 'readOnlyHint'), true, `${tool.name} is read-only`);
  }
  if (DESTRUCTIVE.has(tool.name)) {
    assert.equal(readAnnotation(tool, 'destructiveHint'), true, `${tool.name} is destructive`);
  }
}

function assertToolMetadata(tool) {
  assert.ok(tool.description, `${tool.name} has a description`);
  assert.ok(tool.title, `${tool.name} has a title`);

  const outputSchemaType = tool.outputSchema && tool.outputSchema.type;
  assert.equal(outputSchemaType, 'object', `${tool.name} has an object output schema`);
  assertToolAnnotations(tool);
}

test('server registers the full tool inventory', async () => {
  const client = startServer();
  try {
    await client.initialize();
    const { tools } = await client.send('tools/list', {});

    assert.equal(tools.length, 24);
    assert.deepEqual(
      tools.map((tool) => tool.name).sort(),
      [...EXPECTED_TOOLS].sort()
    );

    for (const tool of tools) {
      assertToolMetadata(tool);
    }
  } finally {
    await client.close();
  }
});
