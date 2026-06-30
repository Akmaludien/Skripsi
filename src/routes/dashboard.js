const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const stationController = require('../controllers/stationController');

router.get('/summary', dashboardController.getDashboardSummary);
router.get('/rainfall-summary', dashboardController.getRainfallSummary);
router.get('/rainfall-map', dashboardController.getRainfallMap);

module.exports = router;
