/**
 * News Pulse "Listen" audio tests (node:test - no extra dependencies).
 *
 * The real AudioService/controller run against a throwaway Express app and a
 * temp working directory, so nothing touches the real public/audio folder or
 * .env. Only the ElevenLabs HTTP call (axios.post) is faked, which lets the
 * tests assert exactly when the paid provider is - and is not - called.
 *
 * Run: npm test
 */
import { describe, it, before, after, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { inspect } from 'node:util';
import axios from 'axios';
import express from 'express';

// AudioService resolves public/audio from process.cwd() at import time and
// dotenv reads .env from it too, so run from an empty temp directory with the
// TTS settings supplied explicitly (and no database).
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-audio-'));
const originalCwd = process.cwd();
process.chdir(workDir);
delete process.env.DATABASE_URL;
process.env.TTS_PROVIDER = 'elevenlabs';
process.env.TTS_API_KEY = 'test-tts-key';
process.env.BACKEND_URL = 'http://audio.test';

const audioDir = path.join(workDir, 'public', 'audio');

let server;
let base;
let config;
let buildNarration;
let ttsCalls; // [{ url, body, headers }] the fake ElevenLabs saw
let ttsBehavior; // per-test: async () => Buffer (or throws)
let errorLog;

const post = (path, body) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const article = (overrides = {}) => ({
  articleId: 42,
  title: "Google Photos 'Clueless'-inspired virtual closet is now available",
  source: 'TechCrunch',
  content: 'The AI-powered feature builds a virtual wardrobe from your photos.',
  voice: 'Aria',
  ...overrides,
});

const audioFiles = () => (fs.existsSync(audioDir) ? fs.readdirSync(audioDir) : []);

before(async () => {
  ({ config } = await import('../src/config/env.js'));
  ({ buildNarration } = await import('../src/services/newsPulseAudio.service.js'));
  const { default: controller, newsPulseErrorHandler } = await import('../src/controllers/newsPulse.controller.js');
  const { default: router } = await import('../src/routes/newsPulse.routes.js');
  const { errorHandler, notFoundHandler } = await import('../src/middleware/error.middleware.js');

  const app = express();
  app.use(express.json());
  // The controller alone (requireAuth needs a database) ...
  app.post('/direct/audio', controller.getAudio, newsPulseErrorHandler);
  // ... and the real router, to prove the route is guarded.
  app.use('/api/news-pulse', router);
  app.use(notFoundHandler);
  app.use(errorHandler);

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.closeAllConnections();
  server.close();
  process.chdir(originalCwd);
  fs.rmSync(workDir, { recursive: true, force: true });
});

beforeEach(() => {
  ttsCalls = [];
  errorLog = [];
  ttsBehavior = async () => Buffer.from('fake-mp3-bytes');
  fs.rmSync(audioDir, { recursive: true, force: true });
  config.TTS_PROVIDER = 'elevenlabs';
  config.TTS_API_KEY = 'test-tts-key';

  mock.method(axios, 'post', async (url, body, options) => {
    ttsCalls.push({ url, body, headers: options?.headers });
    return { data: await ttsBehavior() };
  });
  mock.method(console, 'warn', (...args) => errorLog.push(inspect(args, { depth: 4 })));
});

afterEach(() => {
  mock.restoreAll();
});

describe('POST /api/news-pulse/audio (Listen)', () => {
  it('generates audio on demand, storing it in the existing audio directory', async () => {
    const res = await post('/direct/audio', article());
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.match(body.audioUrl, /^http:\/\/audio\.test\/audio\/pulse-[0-9a-f]{32}\.mp3$/);
    assert.equal(body.cached, false);
    assert.ok(body.duration >= 15);
    assert.equal(ttsCalls.length, 1);
    assert.deepEqual(audioFiles(), [body.audioUrl.split('/').pop()]);
  });

  it('sends the narration (headline, source, description) and the persona voice to the provider', async () => {
    await post('/direct/audio', article({ voice: 'Kai' }));

    const [call] = ttsCalls;
    assert.match(call.url, /\/v1\/text-to-speech\/ErXwobaYiN019PkySvjV$/); // Kai -> Antoni
    assert.equal(
      call.body.text,
      "Google Photos 'Clueless'-inspired virtual closet is now available. From TechCrunch. " +
        'The AI-powered feature builds a virtual wardrobe from your photos.'
    );
    assert.equal(call.headers['xi-api-key'], 'test-tts-key');
  });

  it('never returns the TTS key or upstream details to the client', async () => {
    const res = await post('/direct/audio', article());
    assert.ok(!JSON.stringify(await res.json()).includes('test-tts-key'));
  });

  it('reuses the cached file for the same article instead of calling the provider again', async () => {
    const first = await (await post('/direct/audio', article())).json();
    const second = await (await post('/direct/audio', article())).json();

    assert.equal(ttsCalls.length, 1);
    assert.equal(second.cached, true);
    assert.equal(second.audioUrl, first.audioUrl);
    assert.equal(audioFiles().length, 1);
  });

  it('serves cached audio even when no provider is configured any more', async () => {
    const first = await (await post('/direct/audio', article())).json();
    config.TTS_API_KEY = '';

    const res = await post('/direct/audio', article());

    assert.equal(res.status, 200);
    assert.equal((await res.json()).audioUrl, first.audioUrl);
  });

  it('shares one provider call between simultaneous requests for the same article', async () => {
    let release;
    ttsBehavior = () => new Promise((resolve) => (release = () => resolve(Buffer.from('fake-mp3-bytes'))));

    const pending = [post('/direct/audio', article()), post('/direct/audio', article())];
    await new Promise((resolve) => setTimeout(resolve, 50));
    release();
    const [a, b] = await Promise.all(pending.map(async (p) => (await p).json()));

    assert.equal(ttsCalls.length, 1);
    assert.equal(a.audioUrl, b.audioUrl);
  });

  it('keeps separate audio per article, per voice, and per changed text', async () => {
    const urls = new Set();
    for (const overrides of [{}, { articleId: 43 }, { voice: 'Kai' }, { content: 'Updated description.' }]) {
      urls.add((await (await post('/direct/audio', article(overrides))).json()).audioUrl);
    }
    assert.equal(urls.size, 4);
    assert.equal(ttsCalls.length, 4);
  });

  it('treats an unknown voice as the default persona rather than a new cache entry', async () => {
    const a = await (await post('/direct/audio', article({ voice: 'Aria' }))).json();
    const b = await (await post('/direct/audio', article({ voice: 'not-a-voice' }))).json();

    assert.equal(a.audioUrl, b.audioUrl);
    assert.equal(ttsCalls.length, 1);
  });

  it('returns a client-safe 503 when the provider fails, leaves nothing cached, and succeeds on retry', async () => {
    ttsBehavior = async () => {
      throw new Error('quota_exceeded: secret upstream detail');
    };

    const failed = await post('/direct/audio', article());
    const failedBody = await failed.json();

    assert.equal(failed.status, 503);
    assert.equal(failedBody.error, 'Audio is unavailable right now');
    assert.equal(failedBody.code, 'AUDIO_UNAVAILABLE');
    assert.ok(!JSON.stringify(failedBody).includes('secret upstream detail'));
    assert.equal(audioFiles().length, 0);

    ttsBehavior = async () => Buffer.from('fake-mp3-bytes');
    const retried = await post('/direct/audio', article());

    assert.equal(retried.status, 200);
    assert.equal(ttsCalls.length, 2);
  });

  it('returns 503 without calling any provider when TTS is not configured', async () => {
    config.TTS_API_KEY = '';

    const res = await post('/direct/audio', article());

    assert.equal(res.status, 503);
    assert.equal(ttsCalls.length, 0);
  });

  it('rejects malformed requests with 400 and never calls the provider', async () => {
    const bad = [
      undefined, // no body
      {},
      article({ title: '   ' }),
      article({ title: 'x'.repeat(501) }),
      article({ articleId: '../etc/passwd' }),
      article({ articleId: '' }),
      article({ content: 'x'.repeat(10001) }),
      { ...article(), title: 42 },
    ];
    for (const body of bad) {
      const res = await post('/direct/audio', body);
      assert.equal(res.status, 400, `expected 400 for ${inspect(body).slice(0, 60)}`);
    }
    assert.equal(ttsCalls.length, 0);
  });

  it('requires a signed-in user on the real route', async () => {
    const res = await post('/api/news-pulse/audio', article());

    assert.equal(res.status, 401);
    assert.equal(ttsCalls.length, 0);
  });
});

describe('buildNarration', () => {
  it('reads headline, source and description', () => {
    assert.equal(
      buildNarration({ title: 'Big news', source: 'BBC', content: 'Details follow.' }),
      'Big news. From BBC. Details follow.'
    );
  });

  it('does not double the headline punctuation or repeat a description that is just the headline', () => {
    assert.equal(buildNarration({ title: 'Big news!', source: 'BBC', content: 'big NEWS' }), 'Big news! From BBC.');
  });

  it('strips markup and collapses whitespace from feed text', () => {
    assert.equal(
      buildNarration({ title: 'Big <b>news</b>', source: '', content: '<p>Line one</p>\n\n  <a href="x">line   two</a>' }),
      'Big news. Line one line two'
    );
  });

  it('copes with a missing description and source', () => {
    assert.equal(buildNarration({ title: 'Just a headline' }), 'Just a headline.');
  });

  it('caps long text at a sentence end, never mid-word', () => {
    const sentence = 'This is a fairly ordinary sentence about the news. ';
    const spoken = buildNarration({ title: 'Headline', source: 'Src', content: sentence.repeat(100) });

    assert.ok(spoken.length <= 1200);
    assert.ok(spoken.endsWith('news.'));
  });

  it('caps long unpunctuated text at a word boundary', () => {
    const spoken = buildNarration({ title: 'Headline', content: 'word '.repeat(1000) });

    assert.ok(spoken.length <= 1201);
    assert.match(spoken, /word\.$/);
  });
});
