import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './config';
import { activateRoute } from './routes/activate';
import { verifyRoute } from './routes/verify';
import { statusRoute } from './routes/status';
import { pollPaymentRoute } from './routes/poll-payment';
import { turnOffRoute } from './routes/turn-off';

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors());

// Mount routes
activateRoute(app);
verifyRoute(app);
statusRoute(app);
pollPaymentRoute(app);
turnOffRoute(app);

export default app;
