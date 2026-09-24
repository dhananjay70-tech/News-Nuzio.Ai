import express from 'express';
import newsPulseController, { newsPulseErrorHandler } from '../controllers/newsPulse.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = express.Router();

// API gateway to the Python FastAPI AI service. The frontend calls these;
// it never talks to FastAPI directly.

/** GET /api/news-pulse/clusters */
router.get('/clusters', newsPulseController.getClusters);

/** GET /api/news-pulse/clusters/:id */
router.get('/clusters/:id', newsPulseController.getClusterById);

/** GET /api/news-pulse/timeline?source=&cluster_id=&from=&to=&limit= */
router.get('/timeline', newsPulseController.getTimeline);

/** POST /api/news-pulse/ingest/trigger */
router.post('/ingest/trigger', newsPulseController.triggerIngestion);

/** GET /api/news-pulse/ingest/status/:jobId */
router.get('/ingest/status/:jobId', newsPulseController.getIngestionStatus);

/**
 * POST /api/news-pulse/audio
 * Unlike the read-only routes above this spends TTS credits, so it needs a
 * signed-in user (same as POST /api/news/:id/audio).
 */
router.post('/audio', requireAuth, newsPulseController.getAudio);

// Must come after the routes above
router.use(newsPulseErrorHandler);

export default router;
