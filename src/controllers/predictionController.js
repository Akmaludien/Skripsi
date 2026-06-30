const db = require('../config/sqlite');
const { MODEL_METRICS } = require('../utils/constants');

function getPredictions(req, res) {
    const day = req.query.day || 0;
    const targetDate = new Date(Date.now() + parseInt(day) * 86400000).toISOString().split('T')[0];
    const { station_type, region, station_id } = req.query;

    let query = `
        SELECT p.*, s.name as station_name, s.type as station_type, s.location,
               s.latitude, s.longitude, s.region, s.elevation, s.status
        FROM predictions p
        JOIN stations s ON p.station_id = s.id
        WHERE p.prediction_date = ?
    `;
    const params = [targetDate];

    if (station_type && station_type !== 'all') {
        query += ' AND s.type = ?';
        params.push(station_type);
    }
    if (region && region !== 'all') {
        query += ' AND s.region = ?';
        params.push(region);
    }
    if (station_id) {
        query += ' AND s.id = ?';
        params.push(station_id);
    }

    query += ' ORDER BY p.predicted_rainfall DESC';
    const predictions = db.prepare(query).all(...params);
    
    const rounded = predictions.map(p => ({
        ...p,
        predicted_rainfall: Math.round(p.predicted_rainfall * 10) / 10,
        confidence: Math.round(p.confidence * 10) / 10
    }));
    res.json(rounded);
}

function getModelPerformance(req, res) {
    // Return Bab IV metrics (Tahap 6 requirement)
    res.json(MODEL_METRICS);
}

module.exports = {
    getPredictions,
    getModelPerformance
};
