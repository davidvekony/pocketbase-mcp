import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, callTool } from './helpers.mjs';

const enabled =
  process.env.RUN_INTEGRATION === '1' &&
  !!process.env.POCKETBASE_URL &&
  !!process.env.POCKETBASE_ADMIN_EMAIL &&
  !!process.env.POCKETBASE_ADMIN_PASSWORD;

test(
  'exercises collection, record, import, auth and backup tools against a live PocketBase',
  { skip: enabled ? false : 'set RUN_INTEGRATION=1 plus POCKETBASE_URL and admin credentials' },
  async () => {
    const suffix = Date.now();
    const dataCollection = `mcp_test_data_${suffix}`;
    const authCollection = `mcp_test_auth_${suffix}`;

    const client = startServer();
    try {
      await client.initialize();

      const createdCollection = await callTool(client, 'create_collection', {
        name: dataCollection,
        type: 'base',
        fields: [{ name: 'title', type: 'text' }],
      });
      assert.equal(createdCollection.isError, undefined);

      const createdRecord = await callTool(client, 'create_record', {
        collection: dataCollection,
        data: { title: 'first' },
      });
      const record = JSON.parse(createdRecord.content[0].text);
      assert.equal(record.title, 'first');

      const listed = await callTool(client, 'list_records', { collection: dataCollection });
      const page = JSON.parse(listed.content[0].text);
      assert.ok(page.totalItems >= 1);

      const updated = await callTool(client, 'update_record', {
        collection: dataCollection,
        id: record.id,
        data: { title: 'updated' },
      });
      assert.equal(JSON.parse(updated.content[0].text).title, 'updated');

      const imported = await callTool(client, 'import_data', {
        collection: dataCollection,
        data: [{ title: 'a' }, { title: 'b' }],
        mode: 'create',
      });
      const summary = JSON.parse(imported.content[0].text);
      assert.equal(summary.created, 2);
      assert.equal(summary.failed, 0);

      const deleted = await callTool(client, 'delete_record', {
        collection: dataCollection,
        id: record.id,
      });
      assert.match(deleted.content[0].text, /Successfully deleted record/);

      await callTool(client, 'create_collection', {
        name: authCollection,
        type: 'auth',
        fields: [],
      });
      await callTool(client, 'create_user', {
        collection: authCollection,
        email: `user_${suffix}@example.com`,
        password: 'passw0rd123',
        passwordConfirm: 'passw0rd123',
      });
      const auth = await callTool(client, 'authenticate_user', {
        collection: authCollection,
        email: `user_${suffix}@example.com`,
        password: 'passw0rd123',
      });
      assert.equal(auth.isError, undefined);
      const methods = await callTool(client, 'list_auth_methods', { collection: authCollection });
      assert.equal(methods.isError, undefined);

      const backup = await callTool(client, 'backup_database', { name: `mcp_test_${suffix}` });
      assert.equal(backup.isError, undefined);

      await callTool(client, 'delete_collection', { collectionIdOrName: dataCollection });
      await callTool(client, 'delete_collection', { collectionIdOrName: authCollection });
    } finally {
      await client.close();
    }
  }
);
