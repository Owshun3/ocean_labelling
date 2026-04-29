const express = require('express');
const { init } = require('./db');

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'ocean-app-api' }));

app.use('/users', require('./routes/users'));
app.use('/upload-history', require('./routes/history'));
app.use('/curator', require('./routes/curator'));

app.use((_err, _req, res, _next) => {
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;

init()
  .then(() => app.listen(PORT, () => console.log(`[app-api] listening on :${PORT}`)))
  .catch(err => { console.error('[app-api] DB init failed:', err.message); process.exit(1); });
