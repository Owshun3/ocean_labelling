'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { loadDefinitions } = require('../lib/speciesTagValidation');

const router = express.Router();

router.get('/', requireAuth, async (_req, res) => {
  try {
    const groups = await loadDefinitions();
    res.json({ groups });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
