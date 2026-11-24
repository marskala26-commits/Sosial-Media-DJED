import 'dotenv/config';
import express from 'express';
import { createApiRouter } from '../server/routes.ts';

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

const apiRouter = createApiRouter();
app.use('/api', apiRouter);
app.use('/', apiRouter);

export default app;
