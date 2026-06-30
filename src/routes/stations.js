const express = require('express');
const router = express.Router();
const stationController = require('../controllers/stationController');
const { requireApiKey, postCommand } = require('../controllers/commandController');

router.get('/', stationController.getStations);
router.get('/:id', stationController.getStationDetail);
router.get('/:id/history', stationController.getStationHistory);
router.get('/:id/export', stationController.exportStationHistory);
router.post('/:id/command', requireApiKey, postCommand);

module.exports = router;
