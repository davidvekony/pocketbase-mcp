import { spawn } from 'node:child_process';

function respondToMessage(message, pending) {
  if (message.id === undefined || !pending.has(message.id)) return;

  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(JSON.stringify(message.error)));
  else resolve(message.result);
}

function handleLine(line, pending) {
  if (!line) return;

  respondToMessage(JSON.parse(line), pending);
}

export function startServer(env = {}) {
  const child = spawn('node', ['build/index.js'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, POCKETBASE_URL: 'http://127.0.0.1:8090', ...env },
  });

  let buffer = '';
  let nextId = 1;
  let stderr = '';
  const pending = new Map();

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');

  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      handleLine(line, pending);
    }
  });

  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  function send(method, params) {
    const id = nextId++;
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  }

  function notify(method) {
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method })}\n`);
  }

  async function initialize() {
    const result = await send('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'pocketbase-mcp-test', version: '1.0.0' },
    });
    notify('notifications/initialized');
    return result;
  }

  async function close() {
    child.stdin.end();
    await new Promise((resolve) => {
      child.once('exit', resolve);
      setTimeout(() => {
        child.kill();
        resolve();
      }, 2000);
    });
  }

  return { child, send, notify, initialize, close, getStderr: () => stderr };
}

export async function callTool(client, name, args = {}) {
  return client.send('tools/call', { name, arguments: args });
}
