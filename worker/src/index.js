import { Hono } from 'hono';
import authRoutes from './routes/auth.js';
import publicRoutes from './routes/public.js';
import tenantRoutes from './routes/tenants.js';
import admissionRoutes from './routes/admissions.js';
import recordRoutes from './routes/records.js';
import financeRoutes from './routes/finance.js';
import dashboardRoutes from './routes/dashboard.js';
import reportRoutes from './routes/reports.js';
import adminRoutes, { lapseOffers } from './routes/admin.js';
import { runDaily } from './lib/finance.js';
import { json } from './lib/util.js';

const app = new Hono();

app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  c.header('Cache-Control', 'no-store');
});

// Same-origin enforcement for state-changing API calls (CSRF defence).
app.use('/api/*', async (c, next) => {
  const method = c.req.method.toUpperCase();
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
    const origin = c.req.header('origin');
    if (origin) {
      const reqUrl = new URL(c.req.url);
      let originHost = '';
      try {
        originHost = new URL(origin).host;
      } catch {
        originHost = '';
      }
      const allowed = (c.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
      if (originHost !== reqUrl.host && !allowed.includes(origin)) {
        return json({ error: 'Permintaan lintas asal disekat. / Cross-origin request blocked.' }, 403);
      }
    }
  }
  await next();
});

app.get('/api/health', async (c) => {
  const row = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM schools').first();
  return json({ ok: true, schools: row?.n ?? 0, r2: !!c.env.BUCKET, email: !!c.env.EMAIL });
});

app.route('/api/auth', authRoutes);
app.route('/api/public', publicRoutes);
app.route('/api', dashboardRoutes);
app.route('/api', tenantRoutes);
app.route('/api', admissionRoutes);
app.route('/api', recordRoutes);
app.route('/api', financeRoutes);
app.route('/api/reports', reportRoutes);
app.route('/api', adminRoutes);

app.notFound((c) => {
  if (c.req.path.startsWith('/api/')) return json({ error: 'Laluan tidak dijumpai. / Route not found.' }, 404);
  return c.text('Not found', 404);
});

app.onError((err, c) => {
  console.error('Unhandled error', err?.stack || err);
  return json({ error: 'Ralat sistem. Sila cuba lagi. / System error. Please try again.' }, 500);
});

async function scheduled(event, env, ctx) {
  ctx.waitUntil(
    (async () => {
      try {
        const summary = await runDaily(env);
        const lapsed = await lapseOffers(env);
        console.log('Scheduled run', JSON.stringify({ ...summary, lapsed, cron: event.cron }));
      } catch (err) {
        console.error('Scheduled run failed', err?.stack || err);
      }
    })(),
  );
}

export default {
  fetch: app.fetch,
  scheduled,
};
