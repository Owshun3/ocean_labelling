const express = require('express');
const { requireAdmin } = require('../../middleware/auth');

const router = express.Router();

router.use(requireAdmin);

router.use('/dashboard', require('./dashboard'));
router.use('/contestations', require('./contestations'));
router.use('/settings', require('./settings'));
router.use('/health', require('./health'));
router.use('/activity', require('./activity'));
router.use('/cleanup', require('./cleanup'));
router.use('/curation', require('./curation'));
router.use('/requests', require('./requests'));
router.use('/export',   require('./export'));
router.use('/species-tags', require('./species-tags'));
router.use('/help-video',   require('./help-video'));

module.exports = router;
