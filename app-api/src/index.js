const express = require('express');
const cookieParser = require('cookie-parser');
const { init } = require('./db');

const app = express();
app.set('trust proxy', 1);
app.use(cookieParser());

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'ocean-app-api' }));

// CVAT proxy must NOT be behind body-parser — streams the raw request body.
app.use('/cvat', require('./routes/cvatProxy'));

app.use(express.json({ limit: '10mb' }));

app.use('/auth', require('./routes/auth'));
app.use('/admin', require('./routes/admin'));
app.use('/users', require('./routes/users'));
app.use('/upload-history', require('./routes/history'));
app.use('/curator', require('./routes/curator'));
app.use('/moderation', require('./routes/moderation'));
app.use('/species', require('./routes/species'));
app.use('/studio', require('./routes/studio'));
app.use('/settings', require('./routes/settings'));
app.use('/media', require('./routes/media-metadata'));

app.use((_err, _req, res, _next) => {
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;

init()
  .then(() => app.listen(PORT, () => console.log(`[app-api] listening on :${PORT}`)))
  .catch(err => { console.error('[app-api] DB init failed:', err.message); process.exit(1); });
