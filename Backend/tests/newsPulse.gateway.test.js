/**
 * News Pulse gateway tests (node:test - no extra dependencies).
 *
 * A fake FastAPI server is started on an ephemeral port, the Node router is
 * mounted on a throwaway Express app, and requests go over real HTTP. That
 * exercises the actual axios client (URL/query encoding, timeouts, connection
 * failures) without needing the Python service, the database or live RSS.
 *
 * Run: npm test
 */
import { describe, it, before, after, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { inspect } from 'node:util';
import express from 'express';

// --- Fake FastAPI service ---------------------------------------------------

let upstream; // per-test handler: (req, res) => void
let upstreamCalls; // [{ method, url }] seen by the fake service
let pendingTimers;
let fakeServer;
let fakeBase;

const sendJson = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

const delayed = (ms, fn) => {
  pendingTimers.push(setTimeout(fn, ms));
};

// --- Gateway under test -----------------------------------------------------

let gateway;
let gatewayBase;
let NewsPulseService;
let NewsPulseError;
let errorLog;

const get = (path) => fetch(`${gatewayBase}${path}`);
const post = (path) => fetch(`${gatewayBase}${path}`, { method: 'POST' });

const listen = (server) =>
  new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));

before(async () => {
  fakeServer = http.createServer((req, res) => {
    upstreamCalls.push({ method: req.method, url: req.url });
    upstream(req, res);
  });
  const fakePort = await listen(fakeServer);
  fakeBase = `http://127.0.0.1:${fakePort}`;

  // The service singleton reads its config at import time, so set the
  // environment first. Short timeouts keep the timeout tests fast.
  process.env.AI_SERVICE_URL = fakeBase;
  process.env.AI_SERVICE_TIMEOUT_MS = '250';
  process.env.AI_SERVICE_TRIGGER_TIMEOUT_MS = '250';

  ({ NewsPulseService, NewsPulseError } = await import('../src/services/newsPulse.service.js'));
  const { default: router } = await import('../src/routes/newsPulse.routes.js');
  const { errorHandler, notFoundHandler } = await import('../src/middleware/error.middleware.js');

  const app = express();
  app.use('/api/news-pulse', router);
  app.use(notFoundHandler);
  app.use(errorHandler);
  gateway = http.createServer(app);
  gatewayBase = `http://127.0.0.1:${await listen(gateway)}/api/news-pulse`;
});

after(() => {
  fakeServer.closeAllConnections();
  gateway.closeAllConnections();
  fakeServer.close();
  gateway.close();
});

beforeEach(() => {
  upstreamCalls = [];
  pendingTimers = [];
  upstream = (req, res) => sendJson(res, 200, {});
  errorLog = [];
  mock.method(console, 'error', (...args) => errorLog.push(inspect(args, { depth: 4 })));
});

afterEach(() => {
  pendingTimers.forEach(clearTimeout);
  mock.restoreAll();
});

// --- GET /clusters ----------------------------------------------------------

describe('GET /api/news-pulse/clusters', () => {
  it('forwards the FastAPI response unchanged', async () => {
    const body = {
      clusters: [{ id: 1, label: 'OpenAI AI Model', article_count: 4, latest_published_at: '2026-09-24T10:30:00Z' }],
      count: 1,
    };
    upstream = (req, res) => sendJson(res, 200, body);

    const res = await get('/clusters');

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), body);
    assert.deepEqual(upstreamCalls, [{ method: 'GET', url: '/clusters' }]);
  });

  it('forwards ?limit= to FastAPI and drops unsupported or empty parameters', async () => {
    upstream = (req, res) => sendJson(res, 200, { clusters: [], count: 0 });

    const res = await get('/clusters?limit=500&offset=10&foo=bar');

    assert.equal(res.status, 200);
    assert.deepEqual(upstreamCalls, [{ method: 'GET', url: '/clusters?limit=500' }]);
  });

  it('sends no query string when no limit is given (default behaviour unchanged)', async () => {
    upstream = (req, res) => sendJson(res, 200, { clusters: [], count: 0 });

    await get('/clusters?offset=10');

    assert.deepEqual(upstreamCalls, [{ method: 'GET', url: '/clusters' }]);
  });

  it('rejects a repeated limit with 400 without calling the AI service', async () => {
    const res = await get('/clusters?limit=1&limit=2');

    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'Invalid query parameter: limit');
    assert.equal(upstreamCalls.length, 0);
  });

  it('forwards a FastAPI 400 for an out-of-range limit', async () => {
    upstream = (req, res) => sendJson(res, 400, { detail: 'Invalid request parameter' });

    const res = await get('/clusters?limit=0');

    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'Invalid request parameter');
  });

  it('returns 503 when the AI service drops the connection', async () => {
    upstream = (req) => req.socket.destroy();

    const res = await get('/clusters');

    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error, 'News intelligence service unavailable');
    assert.equal(body.success, false);
    assert.equal(body.code, 'AI_SERVICE_UNAVAILABLE');
  });

  it('returns 504 when the AI service is too slow', async () => {
    upstream = (req, res) => delayed(1000, () => sendJson(res, 200, { clusters: [], count: 0 }));

    const res = await get('/clusters');

    assert.equal(res.status, 504);
    assert.equal((await res.json()).error, 'News intelligence service timed out');
  });

  it('returns a clean 502 for an upstream 500 and never leaks its internals', async () => {
    const leak =
      'Traceback (most recent call last): File "C:\\Users\\niran\\Desktop\\Nuzio.Ai\\Ai_Service\\app\\main.py", ' +
      'line 12 psycopg2.OperationalError: postgresql://nuzio:hunter2@db.example.com:5432/postgres';
    upstream = (req, res) => sendJson(res, 500, { detail: leak });

    const res = await get('/clusters');
    const text = await res.text();

    assert.equal(res.status, 502);
    assert.equal(JSON.parse(text).error, 'News intelligence service error');
    for (const secret of ['Traceback', 'C:\\Users', 'postgresql://', 'hunter2', 'main.py']) {
      assert.ok(!text.includes(secret), `response leaked "${secret}"`);
    }
    // ...but the detail is logged server-side
    assert.ok(errorLog.some((line) => line.includes('hunter2') || line.includes('Traceback')));
  });

  it('returns a clean 502 for a non-JSON upstream 500', async () => {
    upstream = (req, res) => {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    };

    const res = await get('/clusters');

    assert.equal(res.status, 502);
    assert.equal((await res.json()).error, 'News intelligence service error');
  });

  it('returns 502 when the upstream 200 is not a JSON object', async () => {
    upstream = (req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html>not the AI service</html>');
    };

    const res = await get('/clusters');

    assert.equal(res.status, 502);
    assert.equal((await res.json()).code, 'AI_SERVICE_INVALID_RESPONSE');
  });
});

// --- GET /clusters/:id ------------------------------------------------------

describe('GET /api/news-pulse/clusters/:id', () => {
  it('forwards the cluster detail', async () => {
    const body = { id: 3, label: 'Monsoon Flooding Mumbai', articles: [{ id: 9, title: 'x' }] };
    upstream = (req, res) => sendJson(res, 200, body);

    const res = await get('/clusters/3');

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), body);
    assert.deepEqual(upstreamCalls, [{ method: 'GET', url: '/clusters/3' }]);
  });

  it('preserves a FastAPI 404 as 404 (not 500)', async () => {
    upstream = (req, res) => sendJson(res, 404, { detail: 'Topic cluster 999 not found' });

    const res = await get('/clusters/999');

    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error, 'Cluster not found');
    assert.equal(body.code, 'NOT_FOUND');
  });

  for (const id of ['abc', '0', '-1', '1.5', '1e3', '99999999999', '..%2Fhealth', '%20']) {
    it(`rejects invalid cluster id "${id}" with 400 without calling the AI service`, async () => {
      const res = await get(`/clusters/${id}`);

      assert.equal(res.status, 400);
      assert.equal((await res.json()).error, 'Invalid cluster id');
      assert.equal(upstreamCalls.length, 0);
    });
  }

  it('returns 503 when the AI service is unavailable', async () => {
    upstream = (req) => req.socket.destroy();

    const res = await get('/clusters/1');

    assert.equal(res.status, 503);
  });
});

// --- GET /timeline ----------------------------------------------------------

describe('GET /api/news-pulse/timeline', () => {
  it('forwards all supported query parameters, properly encoded', async () => {
    upstream = (req, res) => sendJson(res, 200, { articles: [], count: 0 });

    const res = await get(
      '/timeline?source=BBC%20News&cluster_id=3&from=2026-09-01&to=2026-09-24T10%3A00%3A00Z&limit=20',
    );

    assert.equal(res.status, 200);
    assert.equal(upstreamCalls.length, 1);
    const seen = new URL(upstreamCalls[0].url, fakeBase);
    assert.equal(seen.pathname, '/timeline');
    assert.deepEqual(Object.fromEntries(seen.searchParams), {
      source: 'BBC News',
      cluster_id: '3',
      from: '2026-09-01',
      to: '2026-09-24T10:00:00Z',
      limit: '20',
    });
    // axios form-encodes a space as "+" (FastAPI decodes it back to a space)
    assert.match(upstreamCalls[0].url, /source=BBC(\+|%20)News/);
  });

  it('encodes characters that would otherwise break out of the query string', async () => {
    upstream = (req, res) => sendJson(res, 200, { articles: [], count: 0 });

    await get(`/timeline?source=${encodeURIComponent('A&B=C#D+E')}`);

    const seen = new URL(upstreamCalls[0].url, fakeBase);
    assert.equal(seen.searchParams.get('source'), 'A&B=C#D+E');
    assert.deepEqual([...seen.searchParams.keys()], ['source']);
  });

  it('forwards no parameters when none are given', async () => {
    upstream = (req, res) => sendJson(res, 200, { articles: [], count: 0 });

    await get('/timeline');

    assert.deepEqual(upstreamCalls, [{ method: 'GET', url: '/timeline' }]);
  });

  it('drops unsupported and empty parameters', async () => {
    upstream = (req, res) => sendJson(res, 200, { articles: [], count: 0 });

    await get('/timeline?limit=5&source=&foo=bar&offset=10');

    const seen = new URL(upstreamCalls[0].url, fakeBase);
    assert.deepEqual(Object.fromEntries(seen.searchParams), { limit: '5' });
  });

  it('rejects repeated parameters with 400 without calling the AI service', async () => {
    const res = await get('/timeline?limit=1&limit=2');

    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'Invalid query parameter: limit');
    assert.equal(upstreamCalls.length, 0);
  });

  it('forwards a FastAPI 400 as 400 with its client-facing detail', async () => {
    upstream = (req, res) =>
      sendJson(res, 400, { detail: "Invalid date format for 'from'. Expected ISO 8601 string." });

    const res = await get('/timeline?from=yesterday');

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, "Invalid date format for 'from'. Expected ISO 8601 string.");
    assert.equal(body.code, 'BAD_REQUEST');
  });

  it('collapses FastAPI validation errors to a clean 400', async () => {
    upstream = (req, res) =>
      sendJson(res, 400, { detail: 'Invalid request parameter', errors: [{ loc: ['query', 'limit'], input: 'x' }] });

    const res = await get('/timeline?limit=x');

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'Invalid request parameter');
    assert.equal(body.errors, undefined);
  });

  it('returns 503 when the AI service is unavailable', async () => {
    upstream = (req) => req.socket.destroy();

    assert.equal((await get('/timeline')).status, 503);
  });
});

// --- POST /ingest/trigger ---------------------------------------------------

describe('POST /api/news-pulse/ingest/trigger', () => {
  it('returns the job id without waiting for ingestion', async () => {
    upstream = (req, res) => sendJson(res, 200, { job_id: 'e92a85126b58', status: 'QUEUED' });

    const started = Date.now();
    const res = await post('/ingest/trigger');

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { job_id: 'e92a85126b58', status: 'QUEUED' });
    assert.deepEqual(upstreamCalls, [{ method: 'POST', url: '/ingest/trigger' }]);
    assert.ok(Date.now() - started < 250);
  });

  it('does not wait indefinitely: returns 504 when the AI service stalls', async () => {
    upstream = (req, res) => delayed(1000, () => sendJson(res, 200, { job_id: 'late', status: 'QUEUED' }));

    const res = await post('/ingest/trigger');

    assert.equal(res.status, 504);
    assert.equal((await res.json()).error, 'News intelligence service timed out');
  });

  it('returns 503 when the AI service is unavailable', async () => {
    upstream = (req) => req.socket.destroy();

    const res = await post('/ingest/trigger');

    assert.equal(res.status, 503);
    assert.equal((await res.json()).error, 'News intelligence service unavailable');
  });

  it('does not expose GET on the trigger route', async () => {
    assert.equal((await get('/ingest/trigger')).status, 404);
    assert.equal(upstreamCalls.length, 0);
  });
});

// --- GET /ingest/status/:jobId ----------------------------------------------

describe('GET /api/news-pulse/ingest/status/:jobId', () => {
  it('forwards the job status', async () => {
    const body = {
      job_id: 'e92a85126b58',
      status: 'COMPLETED',
      started_at: '2026-09-24T10:00:00Z',
      completed_at: '2026-09-24T10:01:10Z',
      articles_fetched: 20,
      articles_inserted: 12,
      articles_skipped: 8,
      clusters_created: 4,
      error: null,
    };
    upstream = (req, res) => sendJson(res, 200, body);

    const res = await get('/ingest/status/e92a85126b58');

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), body);
    assert.deepEqual(upstreamCalls, [{ method: 'GET', url: '/ingest/status/e92a85126b58' }]);
  });

  it('preserves a FastAPI 404 as 404', async () => {
    upstream = (req, res) => sendJson(res, 404, { detail: "Ingestion job 'nope' not found" });

    const res = await get('/ingest/status/nope');

    assert.equal(res.status, 404);
    assert.equal((await res.json()).error, 'Ingestion job not found');
  });

  // (a bare ".." is collapsed by the HTTP client before it reaches the server)
  for (const jobId of ['has%20space', 'a.b', '..%2Fhealth', 'x'.repeat(65), 'semi;colon', 'q%3Fa%3D1']) {
    it(`rejects invalid job id "${jobId.slice(0, 20)}" with 400 without calling the AI service`, async () => {
      const res = await get(`/ingest/status/${jobId}`);

      assert.equal(res.status, 400);
      assert.equal((await res.json()).error, 'Invalid job id');
      assert.equal(upstreamCalls.length, 0);
    });
  }

  it('returns 503 when the AI service is unavailable', async () => {
    upstream = (req) => req.socket.destroy();

    assert.equal((await get('/ingest/status/abc123')).status, 503);
  });
});

// --- Service-level behaviour -------------------------------------------------

describe('NewsPulseService', () => {
  it('reports a closed port (ECONNREFUSED) as 503 without leaking the URL', async () => {
    const probe = net.createServer();
    await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
    const { port } = probe.address();
    await new Promise((resolve) => probe.close(resolve));

    const service = new NewsPulseService({ baseURL: `http://127.0.0.1:${port}`, timeout: 500 });

    await assert.rejects(service.getClusters(), (err) => {
      assert.ok(err instanceof NewsPulseError);
      assert.equal(err.statusCode, 503);
      assert.equal(err.message, 'News intelligence service unavailable');
      assert.ok(!err.message.includes(String(port)));
      return true;
    });
    assert.ok(errorLog.some((line) => line.includes('ECONNREFUSED')));
  });

  it('treats an invalid AI_SERVICE_URL as a logged server fault (500), not a client error', async () => {
    const service = new NewsPulseService({ baseURL: 'not a url', timeout: 500 });

    await assert.rejects(service.getClusters(), {
      statusCode: 500,
      message: 'Failed to contact news intelligence service',
    });
    assert.ok(errorLog.some((line) => line.includes('Invalid URL')));
  });

  it('URL-encodes path segments so an id cannot change the route', async () => {
    upstream = (req, res) => sendJson(res, 200, {});
    const service = new NewsPulseService({ baseURL: fakeBase, timeout: 500 });

    await service.getIngestionStatus('a/b?c=d');

    assert.equal(upstreamCalls[0].url, '/ingest/status/a%2Fb%3Fc%3Dd');
  });

  it('uses the tighter trigger timeout for POST /ingest/trigger only', async () => {
    upstream = (req, res) => delayed(300, () => sendJson(res, 200, { job_id: 'j', status: 'QUEUED' }));
    const service = new NewsPulseService({ baseURL: fakeBase, timeout: 2000, triggerTimeout: 100 });

    await assert.rejects(service.triggerIngestion(), { statusCode: 504 });
    assert.deepEqual(await service.getClusters(), { job_id: 'j', status: 'QUEUED' });
  });
});
