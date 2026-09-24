import axios from 'axios';
import { config } from '../config/env.js';

/**
 * An error safe to show to API clients: `message` is always a fixed,
 * client-facing string, never raw upstream text, so nothing from the Python
 * service (stack traces, file paths, connection strings) can leak through it.
 * `statusCode`/`code` follow the shape the global error middleware expects.
 */
export class NewsPulseError extends Error {
  constructor(statusCode, message, code) {
    super(message);
    this.name = 'NewsPulseError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

const UNAVAILABLE = ['News intelligence service unavailable', 'AI_SERVICE_UNAVAILABLE'];
const TIMEOUT_CODES = new Set(['ECONNABORTED', 'ETIMEDOUT']);

/**
 * Client for the Python FastAPI news-intelligence service (clusters,
 * timeline, ingestion). Each method returns the FastAPI JSON body unchanged
 * and throws a NewsPulseError on failure.
 */
export class NewsPulseService {
  constructor({
    baseURL = config.AI_SERVICE_URL,
    timeout = config.AI_SERVICE_TIMEOUT_MS,
    triggerTimeout = config.AI_SERVICE_TRIGGER_TIMEOUT_MS,
  } = {}) {
    this.triggerTimeout = triggerTimeout;
    this.client = axios.create({
      baseURL,
      timeout,
      headers: { Accept: 'application/json' },
    });
  }

  /**
   * @param {Object} filters - limit. FastAPI returns the newest 100 clusters by
   *   default (500 max), so callers that need them all pass a larger limit.
   */
  getClusters(filters = {}) {
    return this.#request('/clusters', { params: filters });
  }

  getClusterById(clusterId) {
    return this.#request(`/clusters/${encodeURIComponent(clusterId)}`, {
      notFoundMessage: 'Cluster not found',
    });
  }

  /**
   * @param {Object} filters - source, cluster_id, from, to, limit. Passed as
   *   axios `params`, so values are URL-encoded rather than string-built.
   */
  getTimeline(filters = {}) {
    return this.#request('/timeline', { params: filters });
  }

  /** Enqueues an ingestion job; FastAPI returns immediately with a job id. */
  triggerIngestion() {
    return this.#request('/ingest/trigger', {
      method: 'POST',
      timeout: this.triggerTimeout,
    });
  }

  getIngestionStatus(jobId) {
    return this.#request(`/ingest/status/${encodeURIComponent(jobId)}`, {
      notFoundMessage: 'Ingestion job not found',
    });
  }

  async #request(path, { method = 'GET', params, timeout, notFoundMessage = 'Resource not found' } = {}) {
    let response;
    try {
      response = await this.client.request({ method, url: path, params, timeout });
    } catch (err) {
      throw this.#translateError(err, `${method} ${path}`, notFoundMessage);
    }

    // Every FastAPI endpoint here returns a JSON object. Anything else means
    // AI_SERVICE_URL points at something that isn't the AI service.
    if (response.data === null || typeof response.data !== 'object') {
      console.error(`[NewsPulse] ${method} ${path} returned a non-JSON-object body (HTTP ${response.status})`);
      throw new NewsPulseError(502, 'News intelligence service returned an invalid response', 'AI_SERVICE_INVALID_RESPONSE');
    }
    return response.data;
  }

  /**
   * Map an axios failure to a NewsPulseError, preserving meaningful client
   * statuses (400, 404, ...) and hiding everything else. Detailed causes are
   * logged server-side only.
   */
  #translateError(err, label, notFoundMessage) {
    if (err.response) {
      const { status, data } = err.response;

      if (status === 404) {
        return new NewsPulseError(404, notFoundMessage, 'NOT_FOUND');
      }

      if (status >= 400 && status < 500) {
        // FastAPI's 4xx `detail` is deliberately client-facing (e.g. an
        // invalid date format), unlike its 5xx bodies. Only pass strings.
        const detail = typeof data?.detail === 'string' ? data.detail : 'Invalid request';
        return new NewsPulseError(status, detail, status === 400 ? 'BAD_REQUEST' : 'AI_SERVICE_REJECTED');
      }

      if (status === 503) {
        console.error(`[NewsPulse] ${label} -> upstream HTTP 503`);
        return new NewsPulseError(503, ...UNAVAILABLE);
      }

      console.error(`[NewsPulse] ${label} -> upstream HTTP ${status}:`, data);
      return new NewsPulseError(502, 'News intelligence service error', 'AI_SERVICE_ERROR');
    }

    if (axios.isAxiosError(err)) {
      if (TIMEOUT_CODES.has(err.code)) {
        console.error(`[NewsPulse] ${label} timed out: ${err.message}`);
        return new NewsPulseError(504, 'News intelligence service timed out', 'AI_SERVICE_TIMEOUT');
      }
      // ECONNREFUSED, ECONNRESET, ENOTFOUND, invalid AI_SERVICE_URL, ...
      console.error(`[NewsPulse] ${label} failed (${err.code || 'no code'}): ${err.message}`);
      return new NewsPulseError(503, ...UNAVAILABLE);
    }

    console.error(`[NewsPulse] ${label} unexpected error:`, err);
    return new NewsPulseError(500, 'Failed to contact news intelligence service', 'INTERNAL_ERROR');
  }
}

export default new NewsPulseService();
