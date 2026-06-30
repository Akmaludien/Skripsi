const db = require('../config/sqlite');
const { getLatestInfluxData } = require('../services/influxQueryService');
const { queryApi } = require('../config/influx');
const config = require('../config/env');

async function getDashboardSummary(req, res) {
    const totalStations = db.prepare('SELECT COUNT(*) as total FROM stations').get().total;
    const onlineStations = db.prepare("SELECT COUNT(*) as total FROM stations WHERE status != 'Offline'").get().total;
    let activeAlerts = db.prepare("SELECT COUNT(*) as total FROM alerts WHERE is_active = 1").get().total;
    let alertDetails = db.prepare(`
        SELECT a.*, s.name as station_name 
        FROM alerts a 
        LEFT JOIN stations s ON a.station_id = s.id 
        WHERE a.is_active = 1 
        ORDER BY a.created_at DESC LIMIT 5
    `).all();

    let avgRainfall = 0;
    let lastUpdateStr = null;
    let maxRainfall24h = { value: 0, station_name: '-', station_id: '-' };

    if (queryApi) {
        try {
            const queryAvg = `
                from(bucket: "${config.influx.bucket}")
                  |> range(start: -24h)
                  |> filter(fn: (r) => (r["_measurement"] == "AWS" or r["_measurement"] == "ARG" or r["_measurement"] == "AAWS") and r["_field"] == "rain")
                  |> mean()
            `;
            const meanRows = await queryApi.collectRows(queryAvg);
            if (meanRows.length > 0) {
                const sumAvg = meanRows.reduce((sum, r) => sum + (r._value || 0), 0);
                avgRainfall = Math.round((sumAvg / meanRows.length) * 10) / 10;
            }

            const influxMap = await getLatestInfluxData();
            
            const validStations = db.prepare('SELECT id, name FROM stations').all();
            const validIds = new Set(validStations.map(s => s.id));
            const idToName = {};
            validStations.forEach(s => { idToName[s.id] = s.name });

            let maxVal = 0;
            let maxStationId = null;
            let dynamicActiveAlerts = 0;
            let dynamicAlertDetails = [];

            for (const [id, sData] of Object.entries(influxMap)) {
                const val = sData.latest_rr || 0;
                
                if (validIds.has(id)) {
                    if (val >= maxVal && val < 500) {
                        maxVal = val;
                        maxStationId = id;
                    }
                    
                    if (val >= 50 && val < 500) {
                        dynamicActiveAlerts++;
                        let severity = val > 100 ? 'AWAS' : (val > 80 ? 'SIAGA' : 'WASPADA');
                        dynamicAlertDetails.push({
                            station_id: id,
                            station_name: idToName[id] || id,
                            severity: severity,
                            message: `Curah hujan ${val} mm terdeteksi`,
                            val: val,
                            created_at: new Date().toISOString()
                        });
                    }
                }
            }
            
            activeAlerts = dynamicActiveAlerts;
            alertDetails = dynamicAlertDetails.sort((a,b) => b.val - a.val).slice(0, 5);

            if (maxStationId) {
                maxRainfall24h = {
                    value: Math.round(maxVal * 10) / 10,
                    station_name: idToName[maxStationId] || maxStationId,
                    station_id: maxStationId
                };
            } else if (validStations.length > 0) {
                const activeStation = db.prepare("SELECT id, name FROM stations WHERE status != 'Offline' LIMIT 1").get();
                const defaultStation = activeStation || validStations[0];
                maxRainfall24h = {
                    value: 0.0,
                    station_name: defaultStation.name,
                    station_id: defaultStation.id
                };
            }

            const queryLast = `
                from(bucket: "${config.influx.bucket}")
                  |> range(start: -24h)
                  |> filter(fn: (r) => (r["_measurement"] == "AWS" or r["_measurement"] == "ARG" or r["_measurement"] == "AAWS"))
                  |> last()
                  |> limit(n: 1)
            `;
            const lastRows = await queryApi.collectRows(queryLast);
            if (lastRows.length > 0) lastUpdateStr = lastRows[0]._time;

        } catch (e) {
            console.error('[InfluxDB] Summary error:', e.message);
        }
    }

    res.json({
        total_stations: totalStations,
        online_stations: onlineStations,
        online_percentage: totalStations > 0 ? Math.round((onlineStations / totalStations) * 100) : 0,
        avg_rainfall: avgRainfall,
        max_rainfall_24h: maxRainfall24h,
        active_alerts: activeAlerts,
        alert_details: alertDetails,
        last_update: lastUpdateStr
    });
}

async function getRainfallSummary(req, res) {
    let result = [];
    if (queryApi) {
        try {
            const query = `
                from(bucket: "${config.influx.bucket}")
                  |> range(start: -24h)
                  |> filter(fn: (r) => (r["_measurement"] == "AWS" or r["_measurement"] == "ARG" or r["_measurement"] == "AAWS") and r["_field"] == "rain")
                  |> group(columns: ["id"])
                  |> sum()
            `;
            const rows = await queryApi.collectRows(query);

            const mapQuery = db.prepare('SELECT id, name FROM stations');
            const stations = mapQuery.all();
            const idToName = {};
            stations.forEach(s => { idToName[s.id] = s.name });

            result = rows
                .filter(r => idToName[r.id] && (r._value || 0) < 1000)
                .map(r => ({
                    id: r.id,
                    name: idToName[r.id],
                    total_rainfall: Math.round((r._value || 0) * 10) / 10
                }));

            result.sort((a, b) => b.total_rainfall - a.total_rainfall);
            result = result.slice(0, 8); 

        } catch (e) {
            console.error('[InfluxDB] Rainfall summary error:', e.message);
        }
    }
    res.json(result);
}

async function getRainfallMap(req, res) {
    try {
        const hours = parseInt(req.query.hours) || 0;
        const stations = db.prepare('SELECT id, name, type, latitude, longitude FROM stations WHERE latitude IS NOT NULL AND longitude IS NOT NULL').all();
        
        if (hours === 0 || !queryApi) {
            const fullStations = db.prepare('SELECT * FROM stations WHERE latitude IS NOT NULL').all();
            return res.json(fullStations.map(s => ({
                station_id: s.id,
                name: s.name,
                type: s.type,
                latitude: s.latitude,
                longitude: s.longitude,
                rainfall: s.latest_rr || 0
            })));
        }

        const query = `
            from(bucket: "${config.influx.bucket}")
              |> range(start: -${hours}h)
              |> filter(fn: (r) => (r["_measurement"] == "AWS" or r["_measurement"] == "ARG" or r["_measurement"] == "AAWS") and r["_field"] == "rain")
              |> group(columns: ["id"])
              |> sum()
        `;
        
        let rows = [];
        try {
            rows = await queryApi.collectRows(query);
        } catch (influxErr) {
            console.error('[API] InfluxDB rainfall-map query failed:', influxErr.message);
        }
        
        const actualMap = {};
        rows.forEach(r => { 
            actualMap[r.id] = Math.round((r._value || 0) * 10) / 10;
        });

        const data = stations.map(s => ({
            station_id: s.id,
            name: s.name,
            type: s.type,
            latitude: s.latitude,
            longitude: s.longitude,
            rainfall: actualMap[s.id] || 0
        }));

        res.json(data);
    } catch (e) {
        console.error('[API] /api/rainfall-map error:', e);
        res.status(500).json({ error: e.message });
    }
}

module.exports = {
    getDashboardSummary,
    getRainfallSummary,
    getRainfallMap
};
