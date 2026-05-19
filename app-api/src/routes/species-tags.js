'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { loadDefinitions } = require('../lib/speciesTagValidation');

const router = express.Router();

// Public (auth) : tous les rôles lisent la taxonomie pour leurs formulaires
// (annotateur lit pour son formulaire de proposition basique, curator pour le
// formulaire de création complète, admin pour gérer).
router.get('/', requireAuth, async (_req, res) => {
  try {
    const groups = await loadDefinitions();
    res.json({ groups });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
