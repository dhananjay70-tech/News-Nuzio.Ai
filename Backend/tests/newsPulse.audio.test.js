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

  // ttsBehavior returns audio bytes (wrapped as a real ElevenLabs reply, which
  // is audio/mpeg), or a full { data, headers } reply, or throws.
  mock.method(axios, 'post', async (url, body, options) => {
    ttsCalls.push({ url, body, headers: options?.headers });
    const result = await ttsBehavior();
    return Buffer.isBuffer(result) ? { data: result, headers: { 'content-type': 'audio/mpeg' } } : result;
  });
  mock.method(console, 'warn', (...args) => errorLog.push(inspect(args, { depth: 4 })));
  mock.method(console, 'error', (...args) => errorLog.push(inspect(args, { depth: 4 })));
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

  it('rejects an article with nothing to read aloud (400) instead of paying to synthesize silence', async () => {
    for (const body of [article({ title: '<b></b>', content: '' }), article({ title: '!!! ...', content: '<p> </p>' })]) {
      const res = await post('/direct/audio', body);
      assert.equal(res.status, 400);
      assert.equal((await res.json()).error, 'There is no article text to read aloud');
    }
    assert.equal(ttsCalls.length, 0);
  });

  it('handles an article with no description: reads the headline and source', async () => {
    const res = await post('/direct/audio', article({ content: undefined }));

    assert.equal(res.status, 200);
    assert.equal(ttsCalls[0].body.text, "Google Photos 'Clueless'-inspired virtual closet is now available. From TechCrunch.");
  });

  it('handles a bare headline (no source, no description)', async () => {
    const res = await post('/direct/audio', { articleId: 7, title: 'Short headline' });

    assert.equal(res.status, 200);
    assert.equal(ttsCalls[0].body.text, 'Short headline.');
  });

  it('requires a signed-in user on the real route', async () => {
    const res = await post('/api/news-pulse/audio', article());

    assert.equal(res.status, 401);
    assert.equal(ttsCalls.length, 0);
  });
});

// Each way TTS can fail gets its own status and code, never a blanket 503, and
// the provider's own words stay in the server log.
describe('POST /api/news-pulse/audio failures', () => {
  const providerError = (status, detail) =>
    Object.assign(new Error(`Request failed with status code ${status}`), {
      isAxiosError: true,
      response: { status, data: Buffer.from(JSON.stringify({ detail })) },
    });
  const failWith = (error) => {
    ttsBehavior = async () => {
      throw error;
    };
  };
  const expectFailure = async (status, code, message) => {
    const res = await post('/direct/audio', article());
    const body = await res.json();
    assert.equal(res.status, status);
    assert.equal(body.code, code);
    assert.equal(body.success, false);
    if (message) assert.equal(body.error, message);
    return body;
  };

  it('503 TTS_QUOTA_EXCEEDED when the account is out of credits - even though ElevenLabs sends it as a 401', async () => {
    failWith(
      providerError(401, {
        type: 'invalid_request',
        code: 'quota_exceeded',
        status: 'quota_exceeded',
        message: 'This request exceeds your quota of 10000. You have 70 credits remaining, while 112 credits are required.',
      })
    );

    const body = await expectFailure(503, 'TTS_QUOTA_EXCEEDED', 'The audio service has reached its usage limit');

    // The client is told what happened, not the account specifics; the log has them.
    assert.ok(!JSON.stringify(body).includes('70 credits'));
    assert.ok(errorLog.some((line) => line.includes('quota_exceeded') && line.includes('70 credits remaining')));
  });

  it('503 TTS_QUOTA_EXCEEDED for a 402 (plan limit)', async () => {
    failWith(providerError(402, { status: 'paid_plan_required', message: 'Free users cannot use library voices via the API' }));
    await expectFailure(503, 'TTS_QUOTA_EXCEEDED');
  });

  it('503 TTS_AUTH_FAILED for a rejected API key', async () => {
    failWith(providerError(401, { status: 'invalid_api_key', message: 'Invalid API key' }));
    await expectFailure(503, 'TTS_AUTH_FAILED', 'The audio service rejected the server credentials');
  });

  it('503 TTS_AUTH_FAILED for a key without the needed permission (403)', async () => {
    failWith(providerError(403, { status: 'missing_permissions', message: 'missing text_to_speech permission' }));
    await expectFailure(503, 'TTS_AUTH_FAILED');
  });

  it('503 TTS_RATE_LIMITED when the provider throttles', async () => {
    failWith(providerError(429, { status: 'too_many_concurrent_requests', message: 'slow down' }));
    await expectFailure(503, 'TTS_RATE_LIMITED');
  });

  it('504 TTS_TIMEOUT when the provider does not answer in time', async () => {
    failWith(Object.assign(new Error('timeout of 30000ms exceeded'), { isAxiosError: true, code: 'ECONNABORTED' }));
    await expectFailure(504, 'TTS_TIMEOUT', 'The audio service timed out');
  });

  it('502 TTS_UPSTREAM_ERROR for a provider 5xx', async () => {
    failWith(providerError(500, { message: 'internal error' }));
    await expectFailure(502, 'TTS_UPSTREAM_ERROR', 'The audio service returned an error');
  });

  it('502 TTS_UPSTREAM_ERROR when the request itself is rejected (e.g. an invalid voice, 400/422)', async () => {
    failWith(providerError(422, { status: 'voice_not_found', message: 'A voice with the voice_id was not found' }));
    await expectFailure(502, 'TTS_UPSTREAM_ERROR');
  });

  it('502 TTS_UPSTREAM_ERROR when the provider is unreachable', async () => {
    failWith(Object.assign(new Error('getaddrinfo ENOTFOUND api.elevenlabs.io'), { isAxiosError: true, code: 'ENOTFOUND' }));
    await expectFailure(502, 'TTS_UPSTREAM_ERROR');
  });

  it('502 TTS_UPSTREAM_ERROR for a 200 that has no audio in it, and caches nothing', async () => {
    ttsBehavior = async () => ({ data: Buffer.alloc(0), headers: { 'content-type': 'audio/mpeg' } });
    await expectFailure(502, 'TTS_UPSTREAM_ERROR');

    ttsBehavior = async () => ({ data: Buffer.from('<html>Bad gateway</html>'), headers: { 'content-type': 'text/html' } });
    await expectFailure(502, 'TTS_UPSTREAM_ERROR');

    assert.equal(audioFiles().length, 0);
  });

  it('500 TTS_STORAGE_ERROR when the generated audio cannot be saved', async () => {
    // A plain file where the audio directory should be makes mkdir/write fail.
    fs.mkdirSync(path.join(workDir, 'public'), { recursive: true });
    fs.writeFileSync(audioDir, 'not a directory');

    await expectFailure(500, 'TTS_STORAGE_ERROR');
    fs.rmSync(audioDir, { force: true });
  });

  it('503 TTS_NOT_CONFIGURED, without calling the provider, and the log names the missing variable', async () => {
    config.TTS_API_KEY = '';
    await expectFailure(503, 'TTS_NOT_CONFIGURED', 'Audio is not configured on the server');
    assert.ok(errorLog.some((line) => line.includes('TTS_API_KEY is not set')));

    config.TTS_API_KEY = 'test-tts-key';
    config.TTS_PROVIDER = '';
    await expectFailure(503, 'TTS_NOT_CONFIGURED');
    assert.ok(errorLog.some((line) => line.includes('TTS_PROVIDER is not set')));

    assert.equal(ttsCalls.length, 0);
  });

  it('503 TTS_NOT_CONFIGURED for an unknown or not-yet-implemented provider', async () => {
    config.TTS_PROVIDER = 'nope';
    await expectFailure(503, 'TTS_NOT_CONFIGURED');
    assert.ok(errorLog.some((line) => line.includes('Unknown TTS_PROVIDER "nope"')));

    config.TTS_PROVIDER = 'google'; // stub adapter, not implemented
    await expectFailure(503, 'TTS_NOT_CONFIGURED');
    assert.ok(errorLog.some((line) => line.includes('not implemented yet')));

    assert.equal(ttsCalls.length, 0);
  });

  it('never leaks the API key or provider text, whatever the failure', async () => {
    failWith(providerError(401, { status: 'invalid_api_key', message: 'Invalid API key test-tts-key' }));
    const res = await post('/direct/audio', article());
    assert.ok(!JSON.stringify(await res.json()).includes('test-tts-key'));
  });

  it('leaves nothing cached after a failure, and the next click retries and succeeds', async () => {
    failWith(providerError(500, { message: 'internal error' }));
    await expectFailure(502, 'TTS_UPSTREAM_ERROR');
    assert.equal(audioFiles().length, 0);

    ttsBehavior = async () => Buffer.from('fake-mp3-bytes');
    const retried = await post('/direct/audio', article());

    assert.equal(retried.status, 200);
    assert.equal(audioFiles().length, 1);
    assert.equal(ttsCalls.length, 2);
  });

  it('keeps the original Nuzio flow tolerant: AudioService.generateAudio still resolves null instead of throwing', async () => {
    const { default: audioService } = await import('../src/services/audio.service.js');

    failWith(providerError(401, { status: 'quota_exceeded', message: 'out of credits' }));
    assert.equal(await audioService.generateAudio('Hello there', 'en', 'Aria'), null);
    assert.ok(errorLog.some((line) => line.includes('frontend will fall back to SpeechSynthesis')));

    config.TTS_API_KEY = '';
    assert.equal(await audioService.generateAudio('Hello there', 'en', 'Aria'), null);
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

  it('reads the description when the headline is empty', () => {
    assert.equal(buildNarration({ title: '<i></i>', source: 'BBC', content: 'Only a description.' }), 'From BBC. Only a description.');
  });

  it('returns nothing when there is nothing speakable (no text, only markup or punctuation)', () => {
    assert.equal(buildNarration({}), '');
    assert.equal(buildNarration({ title: '<b></b>', source: 'BBC', content: '  ' }), '');
    assert.equal(buildNarration({ title: '!!! ...', content: '<p>-</p>' }), '');
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
