import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, callTool } from './helpers.mjs';
import { startPocketBase } from './pocketbase.mjs';

const runIntegration = process.env.RUN_INTEGRATION === '1';
const useExternal = runIntegration && !!process.env.POCKETBASE_URL;
const enabled = runIntegration
  ? useExternal
    ? !!process.env.POCKETBASE_ADMIN_EMAIL && !!process.env.POCKETBASE_ADMIN_PASSWORD
    : true
  : false;

async function startEnvironment(useExternal) {
  const managed = useExternal ? null : await startPocketBase();
  const client = startServer(
    managed
      ? {
          POCKETBASE_URL: managed.url,
          POCKETBASE_ADMIN_EMAIL: managed.email,
          POCKETBASE_ADMIN_PASSWORD: managed.password,
        }
      : {},
  );
  return { managed, client };
}

async function cleanup(client, managed, collections) {
  for (const name of collections) {
    try {
      await callTool(client, 'delete_collection', { collectionIdOrName: name });
    } catch {}
  }
  await client.close();
  if (managed) await managed.stop();
}

test(
  'exercises collection, record, import, auth and backup tools against a live PocketBase',
  {
    skip: enabled
      ? false
      : 'set RUN_INTEGRATION=1 (downloads a PocketBase binary), or RUN_INTEGRATION=1 plus POCKETBASE_URL and admin credentials to use an existing instance',
    timeout: 180000,
  },
  async () => {
    const suffix = Date.now();
    const dataCollection = `mcp_test_data_${suffix}`;
    const authCollection = `mcp_test_auth_${suffix}`;

    const { managed, client } = await startEnvironment(useExternal);
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
      assert.equal(createdRecord.structuredContent.title, 'first');
      assert.equal(createdRecord.structuredContent.id, record.id);

      const listed = await callTool(client, 'list_records', { collection: dataCollection });
      const page = JSON.parse(listed.content[0].text);
      assert.ok(page.totalItems >= 1);
      assert.ok(Array.isArray(listed.structuredContent.items));
      assert.equal(listed.structuredContent.totalItems, page.totalItems);

      const updated = await callTool(client, 'update_record', {
        collection: dataCollection,
        id: record.id,
        data: { title: 'updated' },
      });
      assert.equal(JSON.parse(updated.content[0].text).title, 'updated');
      assert.equal(updated.structuredContent.title, 'updated');

      const imported = await callTool(client, 'import_data', {
        collection: dataCollection,
        data: [{ title: 'a' }, { title: 'b' }],
        mode: 'create',
      });
      const summary = JSON.parse(imported.content[0].text);
      assert.equal(summary.created, 2);
      assert.equal(summary.failed, 0);
      assert.deepEqual(imported.structuredContent, summary);

      const deleted = await callTool(client, 'delete_record', {
        collection: dataCollection,
        id: record.id,
      });
      assert.match(deleted.content[0].text, /Successfully deleted record/);
      assert.equal(deleted.structuredContent.success, true);
      assert.equal(deleted.structuredContent.message, deleted.content[0].text);

      const collections = await callTool(client, 'list_collections', { filter: `name = '${dataCollection}'` });
      assert.ok(collections.structuredContent.items.some((item) => item.name === dataCollection));

      await callTool(client, 'create_collection', {
        name: authCollection,
        type: 'auth',
        fields: [],
      });
      const user = await callTool(client, 'create_user', {
        collection: authCollection,
        email: `user_${suffix}@example.com`,
        password: 'passw0rd123',
        passwordConfirm: 'passw0rd123',
      });
      assert.equal(user.isError, undefined);
      assert.ok(user.structuredContent.id);
      const auth = await callTool(client, 'authenticate_user', {
        collection: authCollection,
        email: `user_${suffix}@example.com`,
        password: 'passw0rd123',
      });
      assert.equal(auth.isError, undefined);
      assert.ok(auth.structuredContent.token);
      assert.equal(auth.structuredContent.record.id, user.structuredContent.id);
      const methods = await callTool(client, 'list_auth_methods', { collection: authCollection });
      assert.equal(methods.isError, undefined);
      assert.equal(typeof methods.structuredContent, 'object');

      const impersonated = await callTool(client, 'impersonate_user', {
        collectionIdOrName: authCollection,
        id: user.structuredContent.id,
      });
      assert.equal(impersonated.isError, undefined);
      assert.ok(impersonated.structuredContent.token);
      assert.equal(impersonated.structuredContent.record.id, user.structuredContent.id);

      const backup = await callTool(client, 'backup_database', { name: `mcp_test_${suffix}.zip` });
      assert.equal(backup.isError, undefined);
      assert.equal(backup.structuredContent.success, true);
    } finally {
      await cleanup(client, managed, [dataCollection, authCollection]);
    }
  }
);
