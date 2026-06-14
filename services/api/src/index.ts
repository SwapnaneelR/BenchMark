import express from 'express';
import cors from 'cors';
import { submitRouter } from './routes/submit';
import { leaderboardRouter } from './routes/leaderboard';
import { teamRouter } from './routes/team';
import { logsRouter } from './routes/logs';

const app = express();
app.use(cors());
app.use(express.json());

app.use(teamRouter);
app.use(logsRouter);
app.use(submitRouter);
app.use(leaderboardRouter);

app.get('/health', (_req, res) => res.json({ ok: true }));

const port = Number(process.env.API_PORT ?? 3000);
app.listen(port, '0.0.0.0', () => {
  console.log(`API listening on port ${port}`);
});
