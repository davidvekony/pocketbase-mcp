import { PocketBaseServer } from './pocketbase-server.js';

export { flattenErrors, pocketbaseErrorMessage } from './errors.js';

const server = new PocketBaseServer();
server.run().catch(console.error);
