const db = require('../config/sqlite');
const { queryApi } = require('../config/influx');
const config = require('../config/env');

async function getLatestInfluxData() {
    if (!queryApi) return {};
    
    // Get our station IDs to filter
    const ourStations = db.prepare('SELECT id FROM stations').all().map(s => s.id);
    if (ourStations.length === 0) return {};
    const idFilter = ourStations.map(id => `r["id"] == "${id}"`).join(' or ');
    if (!idFilter) return {};
    
    // Query each field's last value, filtered to only our stations
    const query = `
        from(bucket: "${config.influx.bucket}")
          |> range(start: -2h)
          |> filter(fn: (r) => r["_measurement"] == "AWS" or r["_measurement"] == "ARG" or r["_measurement"] == "AAWS")
          |> filter(fn: (r) => ${idFilter})
          |> last()
    `;
    const queryRain15m = `
        from(bucket: "${config.influx.bucket}")
          |> range(start: -15m)
          |> filter(fn: (r) => (r["_measurement"] == "AWS" or r["_measurement"] == "ARG" or r["_measurement"] == "AAWS") and r["_field"] == "rain")
          |> filter(fn: (r) => ${idFilter})
    `;
    try {
        const [rows, rainRows] = await Promise.all([
            queryApi.collectRows(query),
            queryApi.collectRows(queryRain15m).catch(e => {
                console.error('[InfluxDB] Query 15m rain error:', e.message);
                return [];
            })
        ]);

        // Group rows by station ID to calculate 15m delta
        const rainGroups = {};
        rainRows.forEach(row => {
            if (!rainGroups[row.id]) rainGroups[row.id] = [];
            rainGroups[row.id].push(row);
        });

        const realtimeRainMap = {};
        for (const [id, points] of Object.entries(rainGroups)) {
            points.sort((a, b) => new Date(a._time) - new Date(b._time));
            const earliest = points[0];
            const latest = points[points.length - 1];

            const isMock = String(id).includes('-');
            let realtime_rr = 0;

            if (isMock) {
                realtime_rr = latest._value || 0;
            } else {
                const latestVal = latest._value || 0;
                const earliestVal = earliest._value || 0;
                if (latestVal < earliestVal) {
                    realtime_rr = latestVal < 2.0 ? latestVal : 0.0;
                } else {
                    realtime_rr = latestVal - earliestVal;
                }
            }
            realtimeRainMap[id] = Math.round(realtime_rr * 10) / 10;
        }

        // Merge all fields per station
        const map = {};
        for (const r of rows) {
            const stId = r.id;
            if (!stId) continue;
            if (!map[stId]) {
                map[stId] = { latest_data_time: r._time, realtime_rr: 0 };
            }
            switch (r._field) {
                case 'rain': map[stId].latest_rr = r._value; break;
                case 'temp': map[stId].latest_temp = r._value; break;
                case 'rh': map[stId].latest_rh = r._value; break;
                case 'press': map[stId].latest_press = r._value; break;
                case 'ws': map[stId].latest_ws = r._value; break;
                case 'wd': map[stId].latest_wd = r._value; break;
                case 'sr': map[stId].latest_sr = r._value; break;
                case 'log_temp': map[stId].latest_log_temp = r._value; break;
                case 'battery': map[stId].latest_batt = r._value; break;
            }
        }

        for (const id of Object.keys(map)) {
            map[id].realtime_rr = realtimeRainMap[id] !== undefined ? realtimeRainMap[id] : 0.0;
        }

        return map;
    } catch (e) {
        console.error('[InfluxDB] Query latest error:', e.message);
        return {};
    }
}

async function getLatestInfluxDataForStation(id) {
    if (!queryApi) return null;
    const query = `
        from(bucket: "${config.influx.bucket}")
          |> range(start: -24h)
          |> filter(fn: (r) => (r["_measurement"] == "AWS" or r["_measurement"] == "ARG" or r["_measurement"] == "AAWS") and r["id"] == "${id}")
          |> last()
    `;
    try {
        const rows = await queryApi.collectRows(query);
        if (rows.length === 0) return null;
        const result = { station_id: id, timestamp: rows[0]._time };
        for (const r of rows) {
            switch (r._field) {
                case 'rain': result.rr = r._value; break;
                case 'temp': result.temp = r._value; break;
                case 'rh': result.rh = r._value; break;
                case 'press': result.press = r._value; break;
                case 'ws': result.ws = r._value; break;
                case 'wd': result.wd = r._value; break;
                case 'sr': result.sr = r._value; break;
                case 'log_temp': result.log_temp = r._value; break;
                case 'battery': result.batt = r._value; break;
            }
        }
        return result;
    } catch (e) {
        console.error('[InfluxDB] Query station error:', e.message);
        return null;
    }
}

module.exports = {
    getLatestInfluxData,
    getLatestInfluxDataForStation
};
