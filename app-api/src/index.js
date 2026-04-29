const express = require('express');

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'ocean-app-api' }));

app.use('/users', require('./routes/users'));
app.use('/upload-history', require('./routes/history'));

app.use((_err, _req, res, _next) => {
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[app-api] listening on :${PORT}`));
