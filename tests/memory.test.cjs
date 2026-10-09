const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { readVisits } = require('../house-memory.js');

test('missing, malformed, and non-record memories remain readable', () => {
  for (const raw of [null, '', '{', 'null', '[]', '[1]', 'false', '42', '"old"']) {
    assert.deepEqual(readVisits({ getItem: () => raw }), {}, String(raw));
  }
});

test('reads preserve valid memories, including older values, without writing', () => {
  const original = { conversation: 1750000000000, garden: true, futureRoom: 42 };
  const storage = {
    getItem(key) {
      assert.equal(key, 'house-room-visits');
      return JSON.stringify(original);
    },
    setItem() { assert.fail('a read must never rewrite memory'); },
    removeItem() { assert.fail('a read must never clear memory'); }
  };
  assert.deepEqual(readVisits(storage), original);
});

test('storage denial does not prevent entry', () => {
  assert.deepEqual(readVisits({ getItem() { throw new Error('denied'); } }), {});
});

test('the threshold and all eight rooms load memory before their own scripts', () => {
  const root = path.resolve(__dirname, '..');
  const pages = ['index.html', ...fs.readdirSync(path.join(root, 'rooms'))
    .map(room => `rooms/${room}/index.html`)];
  assert.equal(pages.length, 9);
  for (const page of pages) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    const scripts = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map(match => match[1]);
    assert.equal(scripts.filter(src => src.includes('house-memory.js')).length, 1, page);
    assert.ok(scripts.findIndex(src => src.includes('house-memory.js')) <
      scripts.findIndex(src => src.startsWith('script.js')), page);
    for (const src of scripts) {
      assert.ok(fs.existsSync(path.resolve(root, path.dirname(page), src.split('?')[0])), `${page}: ${src}`);
    }
  }
});
