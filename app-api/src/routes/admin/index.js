const express = require('express');
const { requireAdmin } = require('../../middleware/auth');

const router = express.Router();

router.use(requireAdmin);

router.use('/dashboard', require('./dashboard'));

module.exports = router;
