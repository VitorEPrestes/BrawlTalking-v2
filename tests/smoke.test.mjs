import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    const cleanup = () => {
      clearTimeout(timeout);
      child.stdout.off('data', onStdout);
      child.stderr.off('data', onStderr);
      child.off('exit', onExit);
    };

    const onStdout = (chunk) => {
      stdout += chunk;
      const match = stdout.match(/rodando em http:\/\/127\.0\.0\.1:(\d+)/) || stdout.match(/rodando em http:\/\/localhost:(\d+)/);
      if (!match) return;
      cleanup();
      resolve({ port: Number(match[1]), stdout, stderr });
    };

    const onStderr = (chunk) => {
      stderr += chunk;
    };

    const onExit = (code, signal) => {
      cleanup();
      reject(new Error(`Servidor encerrou antes de iniciar (${code ?? signal}).\n${stderr || stdout}`));
    };

    const timeout = setTimeout(() => {
      cleanup();
      child.kill();
      reject(new Error(`Tempo excedido aguardando o servidor iniciar.\n${stderr || stdout}`));
    }, 10000);

    child.stdout.on('data', onStdout);
    child.stderr.on('data', onStderr);
    child.on('exit', onExit);
  });
}

test('server smoke flow responds and enforces user session secret', { timeout: 20000 }, async (t) => {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: '0',
      NODE_ENV: 'development'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  t.after(() => {
    child.kill();
  });

  const { port } = await waitForServer(child);
  const baseUrl = `http://127.0.0.1:${port}`;

  const homeResponse = await fetch(baseUrl);
  assert.equal(homeResponse.status, 200);
  assert.match(await homeResponse.text(), /Brawl Talking/i);

  const cssResponse = await fetch(`${baseUrl}/styles.css?v=test-cache`);
  assert.equal(cssResponse.status, 200);
  assert.match(cssResponse.headers.get('cache-control') || '', /immutable/i);

  const brawlersResponse = await fetch(`${baseUrl}/api/brawlers`);
  assert.equal(brawlersResponse.status, 200);
  const brawlersPayload = await brawlersResponse.json();
  assert.ok(Array.isArray(brawlersPayload.brawlers));
  assert.ok(brawlersPayload.brawlers.length > 0);

  const sessionId = `smoke-${Date.now()}`;
  const sessionSecret = 'smoke-secret';
  const brawler = brawlersPayload.brawlers[0];

  const joinResponse = await fetch(`${baseUrl}/api/user/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userName: 'SmokeTester',
      brawler: { id: brawler.id, name: brawler.name },
      sessionId,
      sessionSecret
    })
  });
  assert.equal(joinResponse.status, 200);
  const joinPayload = await joinResponse.json();
  assert.equal(typeof joinPayload.streamToken, 'string');
  assert.ok(joinPayload.streamToken.length > 0);

  const forbiddenMessage = await fetch(`${baseUrl}/api/user/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      sessionSecret: 'wrong-secret',
      text: 'Olá'
    })
  });
  assert.equal(forbiddenMessage.status, 403);

  const allowedMessage = await fetch(`${baseUrl}/api/user/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      sessionSecret,
      text: 'Olá do smoke test'
    })
  });
  assert.equal(allowedMessage.status, 201);
});