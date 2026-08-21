const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', 'data', 'monitoring.db');
const schemaPath = path.join(__dirname, 'schema.sql');

// Ensure data directory exists
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Delete old database if exists
if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
    console.log('✓ Old database removed');
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Run schema
const schema = fs.readFileSync(schemaPath, 'utf-8');
db.exec(schema);
console.log('✓ Schema created successfully');

// ─── 50 Real Stations ──────────────────────────────
const stations = require('../src/config/stationsData');

const insertStation = db.prepare(`
    INSERT OR REPLACE INTO stations (id, name, type, location, region, elevation, latitude, longitude, model, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

function extractRegion(location) {
    return location.replace('Kab. ', '').replace('Kota ', '');
}

function getModel(type) {
    switch (type) {
        case 'AWS': return 'Vaisala WXT536';
        case 'ARG': return 'OTT Pluvio2';
        case 'AAWS': return 'Davis Pro2';
        default: return '';
    }
}

for (const s of stations) {
    insertStation.run(
        s.id, s.name, s.type, s.location,
        extractRegion(s.location),
        s.elevation, s.lat, s.lng,
        getModel(s.type),
        s.status
    );
}
console.log(`✓ ${stations.length} stations seeded`);

// ─── Seed sensor data (last 24 hours) ──────────────
// ARG only has: rr, log_temp, batt
const insertSensorARG = db.prepare(`
    INSERT INTO sensor_data (station_id, timestamp, rr, log_temp, batt, source)
    VALUES (?, ?, ?, ?, ?, 'seed')
`);

// AWS has 7 main params + max/min + log_temp + batt
// NOTE: sensor_data seeding disabled. All sensor data comes from real MQTT via InfluxDB.
// SQLite sensor_data is only used as backup when InfluxDB is unavailable.
console.log(`✓ sensor_data seeding skipped (real data comes from MQTT/InfluxDB)`);

// ─── Seed predictions (next 7 days) ────────────────
const insertPrediction = db.prepare(`
    INSERT INTO predictions (station_id, prediction_date, predicted_rainfall, category, confidence, model_version)
    VALUES (?, ?, ?, ?, ?, 'Bi-LSTM-v1.0')
`);

const categories = [
    { min: 0, max: 20, name: 'RINGAN' },
    { min: 20, max: 50, name: 'SEDANG' },
    { min: 50, max: 100, name: 'LEBAT' },
    { min: 100, max: 300, name: 'SANGAT LEBAT' }
];

const predTransaction = db.transaction(() => {
    for (const s of stations) {
        for (let d = 0; d < 8; d++) {
            const date = new Date(Date.now() + d * 86400000);
            const dateStr = date.toISOString().split('T')[0];
            const rainfall = 0.0;
            const cat = categories[0]; // RINGAN
            const confidence = 0.0;
            insertPrediction.run(s.id, dateStr, rainfall, cat.name, confidence);
        }
    }
});
predTransaction();
console.log(`✓ ${stations.length * 8} predictions seeded`);

// ─── Seed alerts ───────────────────────────────────
const insertAlert = db.prepare(`
    INSERT INTO alerts (station_id, alert_type, severity, message, is_active)
    VALUES (?, ?, ?, ?, 1)
`);

const alertStations = stations.filter(s => s.status.includes('Alert') || s.status.includes('Warning'));
alertStations.forEach(s => {
    if (s.status.includes('Alert')) {
        insertAlert.run(s.id, 'HUJAN LEBAT', 'WASPADA', `Curah hujan tinggi terdeteksi di stasiun ${s.name}, ${s.location}.`);
    } else {
        insertAlert.run(s.id, 'POTENSI HUJAN', 'SIAGA', `Potensi hujan lebat di wilayah ${s.location} berdasarkan data ${s.name}.`);
    }
});
console.log(`✓ ${alertStations.length} alerts seeded`);

// ─── Seed model performance ────────────────────────
const insertPerf = db.prepare(`
    INSERT INTO model_performance (rmse, mae, r_squared, accuracy, pod, far, csi, training_date, model_version, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
insertPerf.run(12.4, 9.1, 0.85, 88.0, 0.89, 0.12, 0.78, '2024-05-24', 'Bi-LSTM-v1.0', 'Model Bi-LSTM trained on 5 years historical data from 50 stations');
console.log('✓ Model performance seeded');

db.close();
console.log(`\n✅ Database seeded successfully at:`, dbPath);
console.log(`   Total: ${stations.length} stations, ${stations.length} sensor records, ${stations.length * 7} predictions, ${alertStations.length} alerts`);
