import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT_DIR, relativePath), 'utf8'));
}

test('brawler catalog has unique ids and required fields', () => {
  const brawlers = readJson('public/brawlers.json');
  assert.ok(Array.isArray(brawlers) && brawlers.length > 0);

  const ids = new Set();
  for (const brawler of brawlers) {
    assert.equal(typeof brawler.id, 'string');
    assert.equal(typeof brawler.name, 'string');
    assert.equal(typeof brawler.image, 'string');
    assert.ok(brawler.id.length > 0);
    assert.ok(brawler.name.length > 0);
    assert.ok(!ids.has(brawler.id), `Duplicated brawler id: ${brawler.id}`);
    ids.add(brawler.id);
  }
});

test('chat config exposes a default template and per-brawler object map', () => {
  const config = readJson('chat-config.json');
  assert.ok(Array.isArray(config.default?.welcomeMessages));
  assert.ok(Array.isArray(config.default?.statusTexts));
  assert.equal(typeof config.brawlers, 'object');
});

test('moderation config is UTF-8 clean and contains arrays', () => {
  const raw = fs.readFileSync(path.join(ROOT_DIR, 'moderation-config.json'), 'utf8');
  assert.ok(!raw.includes('�'), 'moderation-config.json still contains replacement characters');

  const config = JSON.parse(raw);
  assert.ok(Array.isArray(config.words));
  assert.ok(Array.isArray(config.nicknameBlacklist));
});