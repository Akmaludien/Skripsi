const db = require('../config/sqlite');
const { queryApi } = require('../config/influx');
const config = require('../config/env');

async function getVerification(req, res) {
    try {
        const typeFilter = req.query.type && req.query.type !== 'all' ? req.query.type : null;
        const seasonFilter = req.query.season && req.query.season !== 'all' ? req.query.season : null; 
        const dateFilter = req.query.date;

        let queryArgs = [];
        let dateCondition = "";

        if (dateFilter) {
            dateCondition = "p.prediction_date = ?";
            queryArgs.push(dateFilter);
        } else if (seasonFilter) {
            if (seasonFilter === 'hujan') {
                dateCondition = "CAST(strftime('%m', p.prediction_date) AS INTEGER) IN (11, 12, 1, 2, 3, 4)";
            } else {
                dateCondition = "CAST(strftime('%m', p.prediction_date) AS INTEGER) IN (5, 6, 7, 8, 9, 10)";
            }
        } else {
            const latestPred = db.prepare(`SELECT DISTINCT prediction_date FROM predictions ORDER BY prediction_date DESC LIMIT 1`).get();
            if (!latestPred) return res.json({ date: new Date().toISOString().split('T')[0], data: [], summary: { rmse: 0, mae: 0, n: 0 } });
            dateCondition = "p.prediction_date = ?";
            queryArgs.push(latestPred.prediction_date);
        }

        let typeCondition = "";
        if (typeFilter) {
            typeCondition = " AND s.type = ?";
            queryArgs.push(typeFilter);
        }

        const preds = db.prepare(`
            SELECT p.station_id, p.prediction_date, p.predicted_rainfall, s.name as station_name, s.type as station_type, s.latitude, s.longitude 
            FROM predictions p 
            JOIN stations s ON p.station_id = s.id 
            WHERE ${dateCondition}${typeCondition}
        `).all(...queryArgs);
        
        if (preds.length === 0) {
            return res.json({ date: dateFilter || 'N/A', data: [], summary: { rmse: 0, mae: 0, n: 0 } });
        }
        
        const validStations = db.prepare('SELECT id, name FROM stations').all();
        const validIds = new Set(validStations.map(s => s.id));

        if (!queryApi) {
            const data = preds.filter(p => validIds.has(p.station_id)).map(p => ({ ...p, actual_rainfall: 0, error: p.predicted_rainfall }));
            return res.json({ date: dateFilter || 'N/A', data: data, summary: { rmse: 0, mae: 0, n: data.length } });
        }

        const uniqueDates = [...new Set(preds.map(p => p.prediction_date))];
        const actualMap = {}; 
        
        for (const targetDate of uniqueDates) {
            try {
                const query = `from(bucket: "${config.influx.bucket}") |> range(start: ${targetDate}T00:00:00Z, stop: ${targetDate}T23:59:59Z) |> filter(fn: (r) => (r["_measurement"] == "AWS" or r["_measurement"] == "ARG" or r["_measurement"] == "AAWS") and r["_field"] == "rain") |> group(columns: ["id"]) |> max()`;
                const actualRows = await queryApi.collectRows(query);
                actualRows.forEach(r => { actualMap[`${r.id}_${targetDate}`] = Math.round((r._value || 0) * 10) / 10 });
            } catch (e) {
                console.error('[InfluxDB] Query failed for date', targetDate, e.message);
            }
        }

        const data = preds
            .filter(p => validIds.has(p.station_id))
            .map(p => {
                const actual = actualMap[`${p.station_id}_${p.prediction_date}`] || 0;
                const predicted = Math.round(p.predicted_rainfall * 10) / 10;
                const error = Math.round((predicted - actual) * 10) / 10;
                return { ...p, predicted_rainfall: predicted, actual_rainfall: Math.round(actual * 10) / 10, error };
            });

        let sumSqErr = 0; let sumAbsErr = 0;
        data.forEach(d => { sumSqErr += Math.pow(d.error, 2); sumAbsErr += Math.abs(d.error); });
        const n = data.length;
        const rmse = n > 0 ? Math.sqrt(sumSqErr / n) : 0;
        const mae = n > 0 ? sumAbsErr / n : 0;

        res.json({
            date: dateFilter || (uniqueDates.length === 1 ? uniqueDates[0] : 'Multiple Dates'),
            data: data,
            summary: { rmse: Math.round(rmse * 100) / 100, mae: Math.round(mae * 100) / 100, n: n }
        });
    } catch (e) {
        console.error('/api/verification error:', e);
        res.status(500).json({ error: e.message });
    }
}

function getAlerts(req, res) {
    const limit = parseInt(req.query.limit) || 20;
    const alerts = db.prepare(`
        SELECT a.*, s.name as station_name 
        FROM alerts a 
        INNER JOIN stations s ON a.station_id = s.id 
        WHERE a.is_active = 1 
        ORDER BY a.created_at DESC
        LIMIT ?
    `).all(limit);
    res.json(alerts);
}

async function getExtremeWeather(req, res) {
    if (!queryApi) return res.status(500).json({ error: 'InfluxDB not configured' });
    try {
        const query = `
            from(bucket: "${config.influx.bucket}")
              |> range(start: -30d)
              |> filter(fn: (r) => (r["_measurement"] == "AWS" or r["_measurement"] == "ARG" or r["_measurement"] == "AAWS") and r["_field"] == "rain")
              |> max()
              |> group(columns: ["id", "_measurement"])
        `;
        const rows = await queryApi.collectRows(query);
        
        let extremeStations = [];
        for (const row of rows) {
            if (row._value > 0) { 
                extremeStations.push({
                    station_id: row.id,
                    type: row._measurement,
                    max_rainfall: Math.round(row._value * 10) / 10
                });
            }
        }
        
        extremeStations.sort((a, b) => b.max_rainfall - a.max_rainfall);
        const top5 = extremeStations.slice(0, 5);
        
        const validStations = db.prepare('SELECT id, name, location FROM stations').all();
        const stationMap = {};
        validStations.forEach(s => stationMap[s.id] = s);
        
        const result = top5.map(s => {
            const info = stationMap[s.station_id] || { name: 'Unknown', location: 'Unknown' };
            return {
                ...s,
                station_name: info.name,
                location: info.location
            };
        });
        
        res.json(result);
    } catch (err) {
        console.error('Error fetching extreme weather:', err);
        res.status(500).json({ error: 'Failed to fetch extreme weather data' });
    }
}

module.exports = {
    getVerification,
    getAlerts,
    getExtremeWeather
};
