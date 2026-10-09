const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const pages = [
  ['/', '#threshold[data-state="house"]'],
  ['/rooms/conversation/', '#work[data-scene="running"]'],
  ...['colour', 'garden', 'listening', 'window', 'machine']
    .map(room => [`/rooms/${room}/`, '#room[data-state="running"]']),
  ['/rooms/afterimage/', '#room[data-state="performance"]'],
  ['/rooms/archive/', '#room[data-state="empty"]']
];
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml', '.png': 'image/png' };

(async () => {
  const server = http.createServer(async (request, response) => {
    try {
      let name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (name.endsWith('/')) name += 'index.html';
      const file = path.resolve(root, '.' + name);
      if (!file.startsWith(root + path.sep)) throw new Error('outside root');
      response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
      response.end(await fs.readFile(file));
    } catch {
      response.statusCode = 404;
      response.end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  let checks = 0;
  try {
    browser = await chromium.launch({ headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
      args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const origin = `http://127.0.0.1:${server.address().port}`;

    async function check(url, values, action, blocked = false, mobile = false) {
      const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } :
        { width: 1366, height: 900 }, isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => {
        if (response.status() >= 400 && ['document', 'script', 'stylesheet', 'media', 'image']
          .includes(response.request().resourceType())) errors.push(`${response.status()}: ${response.url()}`);
      });
      await page.addInitScript(({ values, blocked }) => {
        for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
        if (blocked) Object.defineProperty(window, 'localStorage', { get() {
          throw new DOMException('Storage disabled for this test', 'SecurityError');
        } });
      }, { values, blocked });
      try {
        await page.goto(origin + url, { waitUntil: 'domcontentloaded' });
        await action(page);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.deepEqual(errors, [], `${url}, blocked=${blocked}`);
        checks++;
      } finally { await context.close(); }
    }

    for (const raw of ['null', '[]', 'false', '42', '"old"', '{']) {
      await check('/', { 'house-room-visits': raw }, async page => {
        await page.locator('#enter').click();
        await page.locator('#threshold[data-state="house"]').waitFor();
        assert.equal(await page.evaluate(() => localStorage.getItem('house-room-visits')), raw);
      });
    }

    // Every original entrance must work with malformed memory and with storage
    // disabled. These checks enter the scores, rather than fast-forwarding them.
    for (const [url, state] of pages) {
      for (const blocked of [false, true]) {
        await check(url, { 'house-room-visits': 'null', 'house-archive': '{"seen":[],"pool":[null]}' },
          async page => {
            await page.locator('#enter').click();
            await page.locator(state).waitFor();
          }, blocked, blocked);
      }
    }

    const visits = JSON.stringify({ conversation: 1000, garden: 2000, futureRoom: 42 });
    const seed = '[1,3,5,7]';
    await check('/', { 'house-room-visits': visits, 'house-seed': seed }, async page => {
      assert.equal(await page.locator('.room.visited').count(), 2);
      assert.equal(await page.evaluate(() => localStorage.getItem('house-room-visits')), visits);
      assert.equal(await page.evaluate(() => localStorage.getItem('house-seed')), seed);
    });
    await check('/rooms/machine/', { 'house-room-visits': visits, 'house-seed': seed }, async page => {
      await page.locator('#enter').click();
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('house-room-visits')));
      assert.equal(saved.conversation, 1000);
      assert.equal(saved.garden, 2000);
      assert.equal(saved.futureRoom, 42);
      assert.ok(Number.isFinite(saved.machine));
      assert.equal(await page.evaluate(() => localStorage.getItem('house-seed')), seed);
    });
    for (const raw of ['null', '[]']) {
      await check('/rooms/machine/', { 'house-room-visits': raw }, async page => {
        await page.locator('#enter').click();
        const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('house-room-visits')));
        assert.ok(Number.isFinite(saved.machine));
        assert.equal(Array.isArray(saved), false);
      });
    }

    const fragment = { r: 'conversation', f: 1, s: 0.4 };
    const store = { seen: { conversation: 1000 }, pool: [fragment, null, false, {},
      { r: 'constructor', f: 0, s: 1 }, { r: 'conversation', f: -1, s: 1 },
      { r: 'conversation', f: 3, s: 1 }, { r: 'conversation', f: 0.5, s: 1 },
      { r: 'conversation', f: 0, s: '0.5' }, { r: 'conversation', f: 0, s: 0.12 },
      { r: 'conversation', f: 0, s: 2 }] };
    await check('/rooms/archive/', { 'house-room-visits': '{"conversation":1000}',
      'house-archive': JSON.stringify(store), 'house-seed': seed }, async page => {
      assert.equal(await page.evaluate(() => localStorage.getItem('house-archive')), JSON.stringify(store));
      await page.locator('#enter').click();
      await page.locator('#room[data-state="reading"]').waitFor();
      assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('house-archive'))),
        { seen: { conversation: 1000 }, pool: [fragment] });
      assert.equal(await page.evaluate(() => localStorage.getItem('house-seed')), seed);
    });
    await check('/rooms/archive/', { 'house-room-visits': '{"conversation":1000}',
      'house-archive': '{"seen":[],"pool":[null]}' }, async page => {
      await page.locator('#enter').click();
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('house-archive')));
      assert.deepEqual(saved.seen, { conversation: 1000 });
      assert.equal(saved.pool.length, 3);
      assert.ok(saved.pool.every(fragment => fragment.r === 'conversation' && fragment.s === 1));
    });
    console.log(`${checks} browser cases passed: threshold, eight entrances, malformed/blocked storage, preserved visits/seed/archive.`);
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
