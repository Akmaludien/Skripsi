const express = require('express');
const router = express.Router();

const stationRoutes = require('./stations');
const predictionRoutes = require('./predictions');
const dashboardRoutes = require('./dashboard');
const verificationRoutes = require('./verification');

const stationController = require('../controllers/stationController');
const predictionController = require('../controllers/predictionController');
const verificationController = require('../controllers/verificationController');

// Mount sub-routers
router.use('/stations', stationRoutes);
router.use('/predictions', predictionRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/verification', verificationRoutes);

// Standalone routes
router.get('/regions', stationController.getRegions);
router.get('/locations', stationController.getLocations);
router.get('/model-performance', predictionController.getModelPerformance);
router.get('/alerts', verificationController.getAlerts);
router.get('/extreme-weather', verificationController.getExtremeWeather);
router.get('/rainfall-map', require('../controllers/dashboardController').getRainfallMap);

module.exports = router;
