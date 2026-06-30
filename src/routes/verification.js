const express = require('express');
const router = express.Router();
const verificationController = require('../controllers/verificationController');

router.get('/', verificationController.getVerification);

module.exports = router;
