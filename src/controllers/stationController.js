const db = require('../config/sqlite');
const { getLatestInfluxData, getLatestInfluxDataForStation } = require('../services/influxQueryService');
const { queryApi } = require('../config/influx');
const config = require('../config/env');

async function getStations(req, res) {
    const { type, region, search, status } = req.query;

    let sql = `SELECT * FROM stations WHERE 1=1`;
    const params = [];
    if (type && type !== 'all') { sql += ' AND type = ?'; params.push(type); }
    if (region && region !== 'all') { sql += ' AND region = ?'; params.push(region); }
    if (status && status !== 'all') { sql += ' AND status = ?'; params.push(status); }
    if (search) {
        sql += ' AND (name LIKE ? OR id LIKE ? OR location LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    sql += ' ORDER BY id';

    const stations = db.prepare(sql).all(...params);
    const influxMap = await getLatestInfluxData();

    const enriched = stations.map(s => {
        const influxData = influxMap[s.id];
        
        if (influxData && (influxData.latest_rr != null || influxData.latest_temp != null)) {
            return { ...s, status: 'Online', ...influxData };
        }
        
        const fallback = db.prepare(`
            SELECT rr, temp, rh, press, ws, wd, sr, log_temp, batt, timestamp
            FROM sensor_data 
            WHERE station_id = ? AND source = 'mqtt'
            ORDER BY timestamp DESC 
            LIMIT 1
        `).get(s.id);

        if (fallback) {
            return {
                ...s,
                latest_rr: fallback.rr,
                latest_temp: fallback.temp,
                latest_rh: fallback.rh,
                latest_press: fallback.press,
                latest_ws: fallback.ws,
                latest_wd: fallback.wd,
                latest_sr: fallback.sr,
                latest_log_temp: fallback.log_temp,
                latest_batt: fallback.batt,
                latest_data_time: fallback.timestamp,
                realtime_rr: fallback.rr || 0,
            };
        }
        
        return { ...s };
    });

    res.json(enriched);
}

async function getStationDetail(req, res) {
    const station = db.prepare('SELECT * FROM stations WHERE id = ?').get(req.params.id);
    if (!station) return res.status(404).json({ error: 'Station not found' });

    const latestData = await getLatestInfluxDataForStation(req.params.id);
    res.json({ ...station, latest_data: latestData });
}

async function getStationHistory(req, res) {
    const hours = parseInt(req.query.hours) || 24;
    const stationId = req.params.id;

    if (!queryApi) return res.json([]);

    const query = `
        from(bucket: "${config.influx.bucket}")
          |> range(start: -${hours}h)
          |> filter(fn: (r) => (r["_measurement"] == "AWS" or r["_measurement"] == "ARG" or r["_measurement"] == "AAWS") and r["id"] == "${stationId}")
          |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
          |> sort(columns: ["_time"], desc: false)
    `;

    try {
        const rows = await queryApi.collectRows(query);
        const data = rows.map(r => ({
            station_id: r.id,
            timestamp: r._time,
            rr: r.rain,
            log_temp: r.log_temp,
            batt: r.battery,
            temp: r.temp,
            rh: r.rh,
            ws: r.ws,
            wd: r.wd,
            press: r.press,
            sr: r.sr
        }));
        res.json(data);
    } catch (e) {
        console.error('[InfluxDB] History Query error:', e.message);
        res.json([]);
    }
}

async function exportStationHistory(req, res) {
    const hours = parseInt(req.query.hours) || 24;
    const stationId = req.params.id;
    const station = db.prepare('SELECT name, type FROM stations WHERE id = ?').get(stationId);
    const isARG = station && station.type === 'ARG';
    const filename = `${stationId}_${station ? station.name.replace(/\s+/g, '_') : 'data'}_${hours}h.csv`;
    
    let csv = isARG 
        ? 'Timestamp,Rainfall (mm),Logger Temp (°C),Battery (V)\n'
        : 'Timestamp,Rainfall (mm),Temperature (°C),Humidity (%),Pressure (hPa),Wind Speed (m/s),Wind Dir (°),Solar Rad (W/m²),Battery (V)\n';

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    if (!queryApi) {
        try {
            const sqliteRows = db.prepare(`
                SELECT * FROM sensor_data 
                WHERE station_id = ? 
                AND timestamp >= datetime('now', ?)
                ORDER BY timestamp ASC
            `).all(stationId, `-${hours} hours`);
            
            sqliteRows.forEach(r => {
                const ts = new Date(r.timestamp).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
                if (isARG) {
                    csv += `${ts},${r.rr || 0},${r.log_temp || ''},${r.batt || ''}\n`;
                } else {
                    csv += `${ts},${r.rr || 0},${r.temp || ''},${r.rh || ''},${r.press || ''},${r.ws || ''},${r.wd || ''},${r.sr || ''},${r.batt || ''}\n`;
                }
            });
            return res.send(csv);
        } catch (e) {
            console.error('[Export Fallback] Error:', e.message);
            return res.status(500).send('Export failed');
        }
    }

    const query = `
        from(bucket: "${config.influx.bucket}")
          |> range(start: -${hours}h)
          |> filter(fn: (r) => (r["_measurement"] == "AWS" or r["_measurement"] == "ARG" or r["_measurement"] == "AAWS") and r["id"] == "${stationId}")
          |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
          |> sort(columns: ["_time"], desc: false)
    `;

    try {
        const rows = await queryApi.collectRows(query);
        rows.forEach(r => {
            const ts = new Date(r._time).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
            if (isARG) {
                csv += `${ts},${r.rain || 0},${r.log_temp || ''},${r.battery || ''}\n`;
            } else {
                csv += `${ts},${r.rain || 0},${r.temp || ''},${r.rh || ''},${r.press || ''},${r.ws || ''},${r.wd || ''},${r.sr || ''},${r.battery || ''}\n`;
            }
        });

        res.send(csv);
    } catch (e) {
        console.error('[Export] Error:', e.message);
        res.status(500).send('Export failed');
    }
}

function getRegions(req, res) {
    const regions = db.prepare('SELECT DISTINCT region FROM stations ORDER BY region').all();
    res.json(regions.map(r => r.region));
}

function getLocations(req, res) {
    const locations = db.prepare('SELECT DISTINCT location FROM stations ORDER BY location').all();
    res.json(locations.map(l => l.location));
}

module.exports = {
    getStations,
    getStationDetail,
    getStationHistory,
    exportStationHistory,
    getRegions,
    getLocations
};
