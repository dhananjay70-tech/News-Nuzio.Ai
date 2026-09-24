import { z } from 'zod';
import newsPulseService, { NewsPulseError } from '../services/newsPulse.service.js';
import { buildNarration, getPulseArticleAudio } from '../services/newsPulseAudio.service.js';
import { TtsError } from '../services/audio.service.js';

// Postgres `integer` upper bound - cluster ids are serial ints in the AI service.
const MAX_CLUSTER_ID = 2147483647;
// Job ids are opaque to Node; this just keeps them to one safe path segment.
const JOB_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
// Article ids are serial ints in the AI service; they only feed the audio cache
// key, so this just keeps them short and free of surprises.
const ARTICLE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

// Body of POST /audio. The text is bounded here and again (down to what is
// actually spoken) in buildNarration.
const audioRequestSchema = z.object({
  articleId: z.union([z.string(), z.number()]).transform(String).pipe(z.string().regex(ARTICLE_ID_PATTERN)),
  title: z.string().trim().min(1).max(500),
  source: z.string().trim().max(200).optional(),
  content: z.string().max(10000).optional(),
  voice: z.string().trim().max(50).optional(),
});

// What POST /audio tells the client for each way text-to-speech can fail:
// [status, message, code]. The messages are fixed and safe to show; the
// provider's own detail (account/quota specifics, missing variable names) is
// only ever logged. 503 = unavailable/unconfigured on our side, 502 = the
// provider misbehaved, 504 = it didn't answer in time.
const TTS_FAILURES = {
  not_configured: [503, 'Audio is not configured on the server', 'TTS_NOT_CONFIGURED'],
  quota_exceeded: [503, 'The audio service has reached its usage limit', 'TTS_QUOTA_EXCEEDED'],
  auth_failed: [503, 'The audio service rejected the server credentials', 'TTS_AUTH_FAILED'],
  rate_limited: [503, 'The audio service is busy, please try again shortly', 'TTS_RATE_LIMITED'],
  timeout: [504, 'The audio service timed out', 'TTS_TIMEOUT'],
  upstream_error: [502, 'The audio service returned an error', 'TTS_UPSTREAM_ERROR'],
  storage_error: [500, 'Generated audio could not be saved', 'TTS_STORAGE_ERROR'],
};

const CLUSTER_FILTERS = ['limit'];
const TIMELINE_FILTERS = ['source', 'cluster_id', 'from', 'to', 'limit'];

const badRequest = (message) => new NewsPulseError(400, message, 'BAD_REQUEST');

// Picks only the supported query parameters off the request; empty values are
// dropped. Repeated params (?limit=1&limit=2) arrive as arrays and are rejected.
const pickFilters = (req, allowed) => {
  const filters = {};
  for (const key of allowed) {
    const value = req.query[key];
    if (value === undefined || value === '') continue;
    if (typeof value !== 'string') throw badRequest(`Invalid query parameter: ${key}`);
    filters[key] = value;
  }
  return filters;
};

/**
 * Wrap a handler that returns the payload to send. The FastAPI body is
 * forwarded as-is (the frontend interceptor only unwraps `{success, data}`
 * envelopes, so a raw body passes through untouched); any thrown error goes
 * to the router's error handler.
 */
const forward = (fn) => async (req, res, next) => {
  try {
    res.json(await fn(req));
  } catch (err) {
    next(err);
  }
};

/**
 * News Pulse controller - API gateway to the Python FastAPI AI service.
 */
export class NewsPulseController {
  /** GET /api/news-pulse/clusters?limit= */
  getClusters = forward((req) => newsPulseService.getClusters(pickFilters(req, CLUSTER_FILTERS)));

  /** GET /api/news-pulse/clusters/:id */
  getClusterById = forward((req) => {
    const { id } = req.params;
    const clusterId = /^\d+$/.test(id) ? Number(id) : NaN;
    if (!(clusterId >= 1 && clusterId <= MAX_CLUSTER_ID)) {
      throw badRequest('Invalid cluster id');
    }
    return newsPulseService.getClusterById(clusterId);
  });

  /**
   * GET /api/news-pulse/timeline
   * Forwards only the supported filters; FastAPI owns range/format checks
   * (limit bounds, ISO dates) and its 400s are passed back to the caller.
   */
  getTimeline = forward((req) => newsPulseService.getTimeline(pickFilters(req, TIMELINE_FILTERS)));

  /** POST /api/news-pulse/ingest/trigger - returns the job id, doesn't wait for the job */
  triggerIngestion = forward(() => newsPulseService.triggerIngestion());

  /** GET /api/news-pulse/ingest/status/:jobId */
  getIngestionStatus = forward((req) => {
    const { jobId } = req.params;
    if (!JOB_ID_PATTERN.test(jobId)) {
      throw badRequest('Invalid job id');
    }
    return newsPulseService.getIngestionStatus(jobId);
  });

  /**
   * POST /api/news-pulse/audio { articleId, title, source?, content?, voice? }
   * Narration audio for one article, generated on demand and cached. Not a
   * FastAPI passthrough: Pulse articles have no NewsArticle row, so the
   * existing POST /api/news/:id/audio can't serve them, but the TTS provider,
   * voices and audio directory are the same ones it uses.
   *
   * 200 { audioUrl, duration, cached } | 400 invalid request or nothing to
   * read | 503 TTS not configured / out of quota / bad credentials /
   * throttled | 502 provider error | 504 provider timeout. Each failure
   * carries its own `code` (TTS_*), and the reason is logged server-side.
   */
  getAudio = forward(async (req) => {
    const parsed = audioRequestSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Invalid audio request');

    const { articleId, voice } = parsed.data;
    const script = buildNarration(parsed.data);
    if (!script) throw badRequest('There is no article text to read aloud');

    try {
      return await getPulseArticleAudio({ articleId, script, voice });
    } catch (err) {
      if (!(err instanceof TtsError)) throw err;
      console.error(`[NewsPulse] audio for article ${articleId} failed (${err.kind}): ${err.message}`);
      const [status, message, code] = TTS_FAILURES[err.kind] || TTS_FAILURES.upstream_error;
      throw new NewsPulseError(status, message, code);
    }
  });
}

/**
 * Error handler scoped to the News Pulse router. Sends the fixed,
 * client-safe message from a NewsPulseError under both `error` (the gateway
 * contract) and `message` (the rest of this API's error shape). Anything that
 * isn't a NewsPulseError falls through to the global error middleware.
 */
export const newsPulseErrorHandler = (err, req, res, next) => {
  if (!(err instanceof NewsPulseError)) return next(err);
  return res.status(err.statusCode).json({
    success: false,
    error: err.message,
    message: err.message,
    code: err.code,
  });
};

export default new NewsPulseController();
