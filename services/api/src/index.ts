import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { submitRoute } from './routes/submit';
import { leaderboardRoute } from './routes/leaderboard';

const app = Fastify({ logger: true });

app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });
app.register(submitRoute);
app.register(leaderboardRoute);

app.listen({ port: Number(process.env.API_PORT ?? 3000), host: '0.0.0.0' }, (err) => {
  if (err) { app.log.error(err); process.exit(1); }
});
