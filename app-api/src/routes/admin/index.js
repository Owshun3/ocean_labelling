const express = require('express');
const { requireAdmin } = require('../../middleware/auth');

const router = express.Router();

router.use(requireAdmin);

router.use('/dashboard', require('./dashboard'));
router.use('/contestations', require('./contestations'));
router.use('/settings', require('./settings'));
router.use('/health', require('./health'));
router.use('/activity', require('./activity'));

module.exports = router;
