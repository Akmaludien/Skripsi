const { sendCommand } = require('../services/mqttService');
const config = require('../config/env');

function requireApiKey(req, res, next) {
    if (!config.apiKey) return next(); 
    const key = req.headers['x-api-key'] || req.query.api_key;
    if (key !== config.apiKey) {
        return res.status(403).json({ error: 'Invalid or missing API key' });
    }
    next();
}

function postCommand(req, res) {
    const { command_type, payload } = req.body;
    if (!command_type) return res.status(400).json({ error: 'command_type required' });

    const result = sendCommand(req.params.id, command_type, payload || {});
    res.json(result);
}

module.exports = {
    requireApiKey,
    postCommand
};
