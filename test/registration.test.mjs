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
      assert.ok(tool.description && tool.description.length > 0, `${tool.name} has a description`);
      assert.ok(tool.title && tool.title.length > 0, `${tool.name} has a title`);
      assert.equal(tool.outputSchema?.type, 'object', `${tool.name} has an object output schema`);
      if (READ_ONLY.has(tool.name)) {
        assert.equal(tool.annotations?.readOnlyHint, true, `${tool.name} is read-only`);
      }
      if (DESTRUCTIVE.has(tool.name)) {
        assert.equal(tool.annotations?.destructiveHint, true, `${tool.name} is destructive`);
      }
    }
  } finally {
    await client.close();
  }
});
