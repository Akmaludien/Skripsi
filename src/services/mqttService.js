const mqtt = require('mqtt');
const { Point } = require('@influxdata/influxdb-client');
const db = require('../config/sqlite');
const config = require('../config/env');
const { writeApi, queryApi } = require('../config/influx');
const { broadcast } = require('./websocketService');
const stationMapper = require('../utils/stationMapper');
const { cleanEnvVar } = require('../utils/helpers');
const { MQTT_TOPICS, MQTT_TOPIC_CMD, REKLIM_DEFAULTS } = require('../utils/constants');

let mqttClient = null;
let lastLogTime = 0;
const LOG_INTERVAL = 15000;
const stationLastBroadcast = {};

async function handleSensorData(data) {
    try {
        const ts = data.timestamp || new Date().toISOString();
        const stationId = data.station_id;

        let pointTimestamp = new Date(ts);
        if (isNaN(pointTimestamp.getTime())) {
            pointTimestamp = new Date();
        }

        if (data._type === 'ARG') {
            if (writeApi) {
                const point = new Point('ARG')
                    .tag('id', stationId)
                    .tag('site', data.station_name || stationId)
                    .floatField('rain', data.rr || 0)
                    .floatField('log_temp', data.log_temp || 0)
                    .floatField('battery', data.batt || 0)
                    .timestamp(pointTimestamp);
                writeApi.writePoint(point);
            }
        } else {
            if (writeApi) {
                const pt = new Point(data._type || 'AWS')
                    .tag('id', stationId)
                    .tag('site', data.station_name || stationId)
                    .floatField('rain', data.rr || 0)
                    .floatField('log_temp', data.log_temp || 0)
                    .floatField('battery', data.batt || 0);

                if (data.temp !== undefined) pt.floatField('temp', data.temp);
                if (data.rh !== undefined) pt.floatField('rh', data.rh);
                if (data.ws !== undefined) pt.floatField('ws', data.ws);
                if (data.wd !== undefined) pt.floatField('wd', data.wd);
                if (data.press !== undefined) pt.floatField('press', data.press);
                if (data.sr !== undefined) pt.floatField('sr', data.sr);

                pt.timestamp(pointTimestamp);
                writeApi.writePoint(pt);
            }
        }

        try {
            db.prepare(`UPDATE stations SET last_update = ?, status = 'Online' WHERE id = ?`)
                .run(new Date().toISOString(), stationId);
        } catch(e) { console.error('[DB] Update station status failed:', e.message); }

        const nowMs = Date.now();
        if (!stationLastBroadcast[stationId] || nowMs - stationLastBroadcast[stationId] > 60000) {
            let realtime_rr = 0;
            const isMock = String(stationId).includes('-');
            
            if (isMock) {
                realtime_rr = data.rr || 0;
            } else {
                const query15mAgo = `
                    from(bucket: "${config.influx.bucket}")
                      |> range(start: -15m)
                      |> filter(fn: (r) => r["id"] == "${stationId}" and r["_field"] == "rain")
                      |> first()
                `;
                let earliestValue = data.rr || 0;
                if (queryApi) {
                    try {
                        const firstRows = await queryApi.collectRows(query15mAgo);
                        if (firstRows.length > 0) {
                            earliestValue = firstRows[0]._value || (data.rr || 0);
                        }
                    } catch (e) {}
                }
                const latestVal = data.rr || 0;
                if (latestVal < earliestValue) {
                    realtime_rr = latestVal < 2.0 ? latestVal : 0.0;
                } else {
                    realtime_rr = latestVal - earliestValue;
                }
            }

            broadcast('sensor_update', {
                ...data,
                realtime_rr: Math.round(realtime_rr * 10) / 10
            });
            stationLastBroadcast[stationId] = nowMs;
        }

        const rainfall = data.rr || 0;
        const stExists = db.prepare('SELECT 1 FROM stations WHERE id = ?').get(stationId);
        if (stExists && rainfall > 50) {
            const severity = rainfall > 100 ? 'SIAGA' : 'WASPADA';
            const stationName = data.station_name || stationId;
            const alert = {
                station_id: stationId,
                station_name: stationName,
                alert_type: 'HUJAN LEBAT',
                severity,
                message: `Curah hujan tinggi terdeteksi: ${rainfall}mm di ${stationName}`
            };
            try {
                db.prepare(`INSERT INTO alerts (station_id, alert_type, severity, message) VALUES (?, ?, ?, ?)`)
                    .run(alert.station_id, alert.alert_type, alert.severity, alert.message);
            } catch(e) { console.error('[DB] Insert alert failed:', e.message); }
            broadcast('alert', alert);
        }
    } catch (e) {
        console.error('[DB] Error processing sensor data:', e.message);
    }
}

function connectMQTT() {
    console.log(`[MQTT] Connecting to ${config.mqttBroker}...`);
    const clientId = `stmkg_srv_jabar_${Math.floor(Math.random() * 10000)}`;

    mqttClient = mqtt.connect(cleanEnvVar(config.mqttBroker), {
        clientId: clientId,
        username: cleanEnvVar(config.mqttUser),
        password: cleanEnvVar(config.mqttPass),
        reconnectPeriod: 15000,
        connectTimeout: 30000,
        keepalive: 60,
    });

    mqttClient.on('connect', () => {
        console.log('[MQTT] Connected to broker');
        MQTT_TOPICS.forEach(topic => {
            mqttClient.subscribe(topic, { qos: 0 }, (err) => {
                if (!err) console.log(`[MQTT] Subscribed to: ${topic}`);
            });
        });
    });

    mqttClient.on('message', (topic, message) => {
        try {
            const rawMessage = message.toString();
            let payload = JSON.parse(rawMessage);
            
            let extStationName = null;
            if (payload && payload.head && payload.head.environment && payload.head.environment.station_name) {
                extStationName = payload.head.environment.station_name;
            }

            let v = null;
            let isReklimObject = false;

            if (Array.isArray(payload)) {
                v = payload;
            } else if (payload && payload.vals && Array.isArray(payload.vals)) {
                v = payload.vals;
            } else if (payload && payload.data && Array.isArray(payload.data) && payload.data[0]) {
                if (payload.data[0].vals) {
                    v = payload.data[0].vals;
                } else if (payload.data[0].temperature !== undefined) {
                    isReklimObject = true;
                }
            }

            if (v) {
                let stId_v = v[0];
                const stRow_v = db.prepare('SELECT type FROM stations WHERE id = ?').get(stId_v);
                const stationType_v = stRow_v ? stRow_v.type : 'AWS';

                let p_date = v[1];
                let p_time = v[2];
                let valOffset = 3;

                const rawV1 = String(v[1]);
                if (rawV1.includes(' ')) {
                    const parts = rawV1.split(' ');
                    p_date = parts[0];
                    p_time = parts[1];
                    valOffset = 2;
                } else if (!isNaN(parseFloat(rawV1)) && !rawV1.includes('-202') && !rawV1.includes('/202')) {
                    if (v.length > 3 && (String(v[3]).includes('-') || String(v[3]).includes('/'))) {
                        p_date = v[3];
                        p_time = v[4];
                        valOffset = 5;
                    } else {
                        p_date = null;
                        p_time = null;
                        valOffset = 3;
                    }
                }

                payload = {
                    station_id: stId_v,
                    date: p_date,
                    time: p_time,
                    _type: stationType_v,
                    station_name: extStationName
                };

                const getVal = (defaultIndex) => {
                    const idx = valOffset === 2 ? defaultIndex - 1 : defaultIndex;
                    return parseFloat(v[idx]) || 0;
                };

                if (stationType_v === 'AWS' || stationType_v === 'AAWS') {
                    payload.ws = getVal(3);
                    payload.ws_max = getVal(4);
                    payload.wd = getVal(5);
                    payload.temp = getVal(6);
                    payload.temp_max = getVal(7);
                    payload.temp_min = getVal(8);
                    payload.rh = getVal(9);
                    payload.press = getVal(10);
                    payload.rr = getVal(11);
                    payload.sr = getVal(12);
                    payload.sr_max = getVal(13);
                    payload.batt = getVal(14);
                    payload.log_temp = getVal(15);
                } else if (stationType_v === 'ARG') {
                    payload.rr = getVal(3); 
                    payload.batt = getVal(4);
                    payload.log_temp = getVal(5);
                }
            } else if (isReklimObject) {
                const d = payload.data[0];
                payload.temp = d.temperature;
                payload.temp_max = d.temperature_max;
                payload.temp_min = d.temperature_min;
                payload.rh = d.humidity;
                payload.ws = d.wind_speed;
                payload.ws_max = d.wind_speed_max;
                payload.wd = d.wind_direction;
                payload.press = d.pressure;
                payload.rr = d.precipitation_24h || d.precipitation || 0;
                payload.sr = d.solar_radiation;
                payload.sr_max = d.solar_radiation_max;
                payload.batt = d.battery_voltage;
                payload.log_temp = d.logger_temperature;
                
                if (d.timestamp) {
                    const t = new Date(d.timestamp);
                    payload.date = t.toISOString().split('T')[0];
                    payload.time = t.toISOString().split('T')[1].substring(0, 8);
                }
            }

            if (!v && !isReklimObject) {
                if (payload.rr !== undefined) payload.rr = parseFloat(payload.rr) || 0;
                if (payload.batt !== undefined) payload.batt = parseFloat(payload.batt) || 0;
                if (payload.log_temp !== undefined) payload.log_temp = parseFloat(payload.log_temp) || 0;
                if (payload.temp !== undefined) payload.temp = parseFloat(payload.temp) || 0;
                if (payload.rh !== undefined) payload.rh = parseFloat(payload.rh) || 0;
            }

            let stId = payload.station_id || payload.id || payload.site;

            if (!stId) {
                const parts = topic.split('/');
                if (topic.includes('device/jabar/arg/') && parts.length >= 4) {
                    stId = parts[3];
                } else if (topic.startsWith('device/') && parts[2] === 'data' && parts.length >= 4) {
                    stId = parts[3];
                } else if (REKLIM_DEFAULTS) {
                    const rs = REKLIM_DEFAULTS.find(r => topic.includes(r.topic));
                    if (rs) stId = rs.id;
                }
            }

            if (!stId) return;

            const stRow = db.prepare('SELECT type FROM stations WHERE id = ?').get(stId);
            const stationType = stRow ? stRow.type : (payload.ws !== undefined ? 'AWS' : 'ARG');
            
            payload.station_id = stId;
            payload._type = payload._type || stationType;
            
            if (!payload.station_name) {
                if (stationMapper[String(stId)]) {
                    payload.station_name = stationMapper[String(stId)];
                } else {
                    const stRowName = db.prepare('SELECT name FROM stations WHERE id = ?').get(stId);
                    payload.station_name = extStationName || (stRowName ? stRowName.name : stId);
                }
            }
            
            if (!payload.timestamp && payload.date && payload.time) {
                let d = String(payload.date);
                if (d.includes('/')) {
                    const parts = d.split('/');
                    if (parts.length === 3) {
                        if (parts[2].length === 4) d = `${parts[2]}-${parts[1]}-${parts[0]}`;
                    }
                }
                payload.timestamp = `${d}T${payload.time}Z`;
            }
            
            const now = Date.now();
            if (now - lastLogTime > LOG_INTERVAL) {
                console.log(`[MQTT] Active receiving data stream from ${payload._type} network...`);
                lastLogTime = now;
            }

            if (payload._type === 'ARG') {
                payload.batt = payload.batt ?? payload.baterai;
            }

            const isOurStation = db.prepare('SELECT 1 FROM stations WHERE id = ?').get(payload.station_id);
            if (!isOurStation) return;

            handleSensorData(payload);
        } catch (e) {
            if (Math.random() < 0.01) console.error('[MQTT] Failed to parse message:', e.message);
        }
    });

    mqttClient.on('error', (err) => {
        if (!err.message.includes('ECONNRESET')) {
            console.error('[MQTT] Error:', err.message);
        }
    });
}

function connectReklimStations() {
    const brokerUrl = config.mqttBroker;
    REKLIM_DEFAULTS.forEach((station) => {
        const clientId = `stmkg_reklim_${station.id}_${Date.now() % 10000}`;
        const stationBroker = station.broker || brokerUrl;
        
        const client = mqtt.connect(stationBroker, {
            clientId: clientId,
            username: station.user,
            password: station.pass,
            clean: true,
            reconnectPeriod: 60000,
            connectTimeout: 30000,
            keepalive: 120,
        });

        client.on('connect', () => {
            console.log(`[Reklim] Connected: ${station.id} @ ${stationBroker}`);
            const topics = [`${station.topic}/data/#`, `${station.topic}/#`];
            topics.forEach(topic => {
                client.subscribe(topic, { qos: 0 }, (err, granted) => {
                    const qos = granted && granted[0] ? granted[0].qos : -1;
                    if (qos !== 128 && !err) {
                        console.log(`[Reklim] [OK] Subscribed ${station.id}: ${topic}`);
                    }
                });
            });
        });

        client.on('message', (topic, message) => {
            try {
                const rawMessage = message.toString();
                let payload = JSON.parse(rawMessage);

                if (payload && payload.data && Array.isArray(payload.data) && payload.data[0]) {
                    const d = payload.data[0];
                    const processed = {
                        station_id: station.id,
                        station_name: stationMapper[station.id] || station.id,
                        _type: 'AAWS',
                        temp: d.temperature,
                        temp_max: d.temperature_max,
                        temp_min: d.temperature_min,
                        rh: d.humidity,
                        ws: d.wind_speed,
                        ws_max: d.wind_speed_max,
                        wd: d.wind_direction,
                        press: d.pressure,
                        rr: d.precipitation_24h || d.precipitation || 0,
                        sr: d.solar_radiation,
                        sr_max: d.solar_radiation_max,
                        batt: d.battery_voltage,
                        log_temp: d.logger_temperature,
                        timestamp: d.timestamp || new Date().toISOString(),
                    };
                    handleSensorData(processed);
                } else if (Array.isArray(payload) && payload.length >= 10) {
                    const processed = {
                        station_id: station.id,
                        station_name: stationMapper[station.id] || station.id,
                        _type: 'AAWS',
                        timestamp: new Date().toISOString(),
                        ws: parseFloat(payload[3]) || 0,
                        wd: parseFloat(payload[5]) || 0,
                        temp: parseFloat(payload[6]) || 0,
                        rh: parseFloat(payload[9]) || 0,
                        press: parseFloat(payload[10]) || 0,
                        rr: parseFloat(payload[11]) || 0,
                        sr: parseFloat(payload[12]) || 0,
                        batt: parseFloat(payload[14]) || 0,
                    };
                    handleSensorData(processed);
                }
            } catch (e) {}
        });

        client.on('error', () => {});
    });
}

function sendCommand(stationId, commandType, payload) {
    const cmd = {
        station_id: stationId,
        command: commandType,
        payload: payload,
        timestamp: new Date().toISOString()
    };

    if (mqttClient && mqttClient.connected) {
        const topic = `${MQTT_TOPIC_CMD}/${stationId}`;
        mqttClient.publish(topic, JSON.stringify(cmd), { qos: 0 });

        db.prepare(`INSERT INTO commands (station_id, command_type, payload, status, sent_at) VALUES (?, ?, ?, 'sent', ?)`)
            .run(stationId, commandType, JSON.stringify(payload), new Date().toISOString());

        return { success: true, topic, command: cmd };
    }
    return { success: false, error: 'MQTT not connected' };
}

module.exports = {
    connectMQTT,
    connectReklimStations,
    sendCommand,
    handleSensorData
};
