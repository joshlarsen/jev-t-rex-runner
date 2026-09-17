import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';

import {
  createDecisionService,
  normalizeServiceError,
  validateDecisionRequest,
} from './server/decision-service.mjs';

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));

export function createApp({ decisionService = createDecisionService() } = {}) {
  const app = express();

  app.use(express.json({ limit: '16kb' }));

  app.get('/api/health', (_request, response) => {
    response.json({
      configured: decisionService.configured,
      model: decisionService.model,
    });
  });

  app.post('/api/decision', async (request, response) => {
    const errors = validateDecisionRequest(request.body);
    if (errors.length > 0) {
      response.status(400).json({
        error: {
          code: 'invalid_request',
          message: errors.join(' '),
          retryable: false,
        },
      });
      return;
    }

    try {
      response.json(await decisionService.decide(request.body));
    } catch (error) {
      const normalized = normalizeServiceError(error);
      response.status(normalized.status).json(normalized.body);
    }
  });

  app.use((error, _request, response, next) => {
    if (error?.type === 'entity.parse.failed') {
      response.status(400).json({
        error: {
          code: 'invalid_json',
          message: 'Request body must contain valid JSON.',
          retryable: false,
        },
      });
      return;
    }
    if (error?.type === 'entity.too.large') {
      response.status(413).json({
        error: {
          code: 'request_too_large',
          message: 'Request body exceeds the 16kb limit.',
          retryable: false,
        },
      });
      return;
    }
    next(error);
  });

  app.use(express.static(rootDirectory));
  return app;
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const port = Number.parseInt(process.env.PORT || '3000', 10);
  const app = createApp();
  app.listen(port, '127.0.0.1', () => {
    console.log(`T-Rex AI demo: http://127.0.0.1:${port}`);
  });
}
