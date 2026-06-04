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
const stations = [
    { id: 'AAWS3010', name: 'AAWS Dramaga', type: 'AAWS', location: 'Kab. Bogor', lat: -6.55324, lng: 106.74283, elevation: 180, status: 'Active / Normal' },
    { id: 'STA3008', name: 'AAWS Pelabuhan Ratu', type: 'AAWS', location: 'Kab. Sukabumi', lat: -7.00589, lng: 106.562, elevation: 10, status: 'Active / Normal' },
    { id: 'STA3005', name: 'AAWS Ujung Genteng', type: 'AAWS', location: 'Kab. Sukabumi', lat: -7.32476, lng: 106.41298, elevation: 10, status: 'Active / Normal' },
    { id: 'STA2043', name: 'AWS Jagorawi', type: 'AWS', location: 'Kab. Bogor', lat: -6.46052, lng: 106.86946, elevation: 0, status: 'Active / Normal' },
    { id: 'STA3009', name: 'AAWS Indramayu', type: 'AAWS', location: 'Kab. Indramayu', lat: -6.4904, lng: 107.92409, elevation: 0, status: 'Active / Normal' },
    { id: 'STA3006', name: 'AAWS Banjarsari Ciamis', type: 'AAWS', location: 'Kab. Ciamis', lat: -7.49796, lng: 108.61577, elevation: 0, status: 'Active / Normal' },
    { id: 'AAWS0354', name: 'AAWS Jatinangor ITB', type: 'AAWS', location: 'Kab. Sumedang', lat: -6.92924, lng: 107.76995, elevation: 0, status: 'Active / Normal' },
    { id: 'STA3004', name: 'AAWS Sumedang', type: 'AAWS', location: 'Kab. Sumedang', lat: -6.82425, lng: 107.84493, elevation: 0, status: 'Active / Normal' },
    { id: 'AAWS0348', name: 'AAWS Lemah Abang', type: 'AAWS', location: 'Kab. Cirebon', lat: -6.82313, lng: 108.61802, elevation: 0, status: 'Active / Normal' },
    { id: '160033', name: 'AWS UI', type: 'AWS', location: 'Kota Depok', lat: -6.37191, lng: 106.82762, elevation: 0, status: 'Active / Normal' },
    { id: 'STA2045', name: 'AWS IPB', type: 'AWS', location: 'Kab. Bogor', lat: -6.600471, lng: 106.8054, elevation: 0, status: 'Active / Normal' },
    { id: 'STA2064', name: 'AWS Cibeureum', type: 'AWS', location: 'Kab. Bogor', lat: -6.600471, lng: 106.95029, elevation: 0, status: 'Active / Normal' },
    { id: 'STA2042', name: 'AWS SMPK Bojong Pucung', type: 'AWS', location: 'Kab. Cianjur', lat: -6.83688, lng: 107.27382, elevation: 0, status: 'Active / Normal' },
    { id: 'STA2115', name: 'AWS Stageof Bandung', type: 'AWS', location: 'Kota Bandung', lat: -6.88351, lng: 107.59731, elevation: 0, status: 'Active / Normal' },
    { id: 'STA2083', name: 'AWS Sukamandi', type: 'AWS', location: 'Kab. Subang', lat: -6.37032, lng: 107.62513, elevation: 0, status: 'Active / Normal' },
    { id: 'STA2084', name: 'AWS Losrang', type: 'AWS', location: 'Kab. Indramayu', lat: -6.42064, lng: 108.16681, elevation: 0, status: 'Active / Normal' },
    { id: 'STA2086', name: 'AWS Tasikmalaya', type: 'AWS', location: 'Kota Tasikmalaya', lat: -7.368, lng: 108.11336, elevation: 0, status: 'Active / Normal' },
    { id: 'STA2085', name: 'AWS Kadugede', type: 'AWS', location: 'Kab. Kuningan', lat: -6.99982, lng: 108.45685, elevation: 0, status: 'Active / Normal' },
    { id: 'STA2087', name: 'AWS Cimalaka', type: 'AWS', location: 'Kab. Sumedang', lat: -6.81536, lng: 107.94875, elevation: 0, status: 'Active / Normal' },
    { id: 'STA2116', name: 'AWS Cisolok', type: 'AWS', location: 'Kab. Sukabumi', lat: -6.95955, lng: 106.47628, elevation: 0, status: 'Active / Normal' },
    { id: 'STA3254', name: 'ARG Cimahi', type: 'ARG', location: 'Kota Cimahi', lat: -6.86876, lng: 107.5557, elevation: 0, status: 'Active / Normal' },
    { id: 'STA0145', name: 'ARG Ciwidey', type: 'ARG', location: 'Kab. Bandung', lat: -7.09838, lng: 107.43417, elevation: 0, status: 'Active / Normal' },
    { id: 'STA9010', name: 'ARG Rekayasa Cisadane', type: 'ARG', location: 'Kab. Bogor', lat: -6.60785, lng: 106.79298, elevation: 0, status: 'Active / Normal' },
    { id: 'STA0038', name: 'ARG Jampang Kulon', type: 'ARG', location: 'Kab. Sukabumi', lat: -7.25618, lng: 106.62553, elevation: 0, status: 'Active / Normal' },
    { id: '30005', name: 'ARG PH Digital Bekasi Timur', type: 'ARG', location: 'Kota Bekasi', lat: -6.24974, lng: 106.99718, elevation: 0, status: 'Active / Normal' },
    { id: 'STA0239', name: 'ARG Rekayasa Cibinong', type: 'ARG', location: 'Kab. Bogor', lat: -6.48438, lng: 106.83848, elevation: 0, status: 'Active / Normal' },
    { id: '150066', name: 'ARG Sukaraja', type: 'ARG', location: 'Kab. Sukabumi', lat: -6.991103, lng: 106.9811, elevation: 0, status: 'Active / Normal' },
    { id: '150067', name: 'ARG Sukanegara', type: 'ARG', location: 'Kab. Cianjur', lat: -6.104323, lng: 107.1215, elevation: 0, status: 'Active / Normal' },
    { id: '150068', name: 'ARG Cikalong Kulon', type: 'ARG', location: 'Kab. Cianjur', lat: -6.71335, lng: 107.21174, elevation: 0, status: 'Active / Normal' },
    { id: '150070', name: 'ARG Cibiuk', type: 'ARG', location: 'Kab. Garut', lat: -7.06965, lng: 107.96429, elevation: 0, status: 'Active / Normal' },
    { id: '150072', name: 'ARG Kawali', type: 'ARG', location: 'Kab. Ciamis', lat: -7.18908, lng: 108.3747, elevation: 0, status: 'Active / Normal' },
    { id: '150071', name: 'ARG Salopa', type: 'ARG', location: 'Kab. Tasikmalaya', lat: -7.43416, lng: 108.27877, elevation: 0, status: 'Active / Normal' },
    { id: 'STG1030', name: 'ARG Salawu', type: 'ARG', location: 'Kab. Tasikmalaya', lat: -7.368527, lng: 108.00318, elevation: 0, status: 'Active / Normal' },
    { id: '150300', name: 'ARG Cisompet', type: 'ARG', location: 'Kab. Garut', lat: -7.54493, lng: 107.81774, elevation: 0, status: 'Active / Normal' },
    { id: '150074', name: 'ARG Subang', type: 'ARG', location: 'Kab. Subang', lat: -6.55248, lng: 107.75367, elevation: 0, status: 'Active / Normal' },
    { id: 'STAL132', name: 'ARG Pabrik Gula Subang', type: 'ARG', location: 'Kab. Subang', lat: -6.41892, lng: 107.69408, elevation: 0, status: 'Active / Normal' },
    { id: '150297', name: 'ARG Setu Patok', type: 'ARG', location: 'Kab. Cirebon', lat: -6.786663, lng: 108.572838, elevation: 0, status: 'Active / Normal' },
    { id: 'STA0263', name: 'ARG Sidamulih', type: 'ARG', location: 'Kab. Pangandaran', lat: -7.6424, lng: 108.60611, elevation: 0, status: 'Active / Normal' },
    { id: '150295', name: 'ARG Purwakarta', type: 'ARG', location: 'Kab. Purwakarta', lat: -6.52493, lng: 107.44752, elevation: 0, status: 'Active / Normal' },
    { id: '150073', name: 'ARG Rengasdengklok', type: 'ARG', location: 'Kab. Karawang', lat: -6.14625, lng: 107.3025333, elevation: 0, status: 'Active / Normal' },
    { id: '30017', name: 'ARG PJT II Muara (PH)', type: 'ARG', location: 'Kab. Bekasi', lat: -6.12492, lng: 107.06328, elevation: 0, status: 'Active / Normal' },
    { id: 'STG1007', name: 'ARG Sumedang Selatan', type: 'ARG', location: 'Kab. Sumedang', lat: -6.928741, lng: 107.97398, elevation: 0, status: 'Active / Normal' },
    { id: 'STAL131', name: 'ARG Kebun Raya Bogor', type: 'ARG', location: 'Kota Bogor', lat: -6.60036, lng: 106.7962, elevation: 0, status: 'Active / Normal' },
    { id: '30004', name: 'ARG PH Digital Sukatani', type: 'ARG', location: 'Kab. Bekasi', lat: -6.17247, lng: 107.18012, elevation: 0, status: 'Active / Normal' },
    { id: 'STA0040', name: 'ARG Pasir Malang', type: 'ARG', location: 'Kab. Cianjur', lat: -7.222, lng: 107.54124, elevation: 0, status: 'Active / Normal' },
    { id: 'STG1029', name: 'ARG Jatibarang', type: 'ARG', location: 'Kab. Indramayu', lat: -6.4894305, lng: 108.3093485, elevation: 0, status: 'Active / Normal' },
    { id: '150075', name: 'ARG Sukahaji', type: 'ARG', location: 'Kab. Majalengka', lat: -6.82484, lng: 108.28847, elevation: 0, status: 'Active / Normal' },
    { id: '150298', name: 'ARG Ciberes', type: 'ARG', location: 'Kab. Cirebon', lat: -6.89001, lng: 108.61966, elevation: 0, status: 'Active / Normal' },
    { id: '14032801', name: 'ARG Cidaun', type: 'ARG', location: 'Kab. Cianjur', lat: -7.49112, lng: 107.36078, elevation: 0, status: 'Active / Normal' },
    { id: 'STA0254', name: 'ARG Rekayasa Sukajaya', type: 'ARG', location: 'Kab. Bogor', lat: -6.62387, lng: 106.49531, elevation: 0, status: 'Active / Normal' }
];

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
    VALUES (?, ?, ?, ?, ?, 'LSTM-v1.0')
`);

const categories = [
    { min: 0, max: 20, name: 'RINGAN' },
    { min: 20, max: 50, name: 'SEDANG' },
    { min: 50, max: 100, name: 'LEBAT' },
    { min: 100, max: 300, name: 'SANGAT LEBAT' }
];

const predTransaction = db.transaction(() => {
    for (const s of stations) {
        for (let d = 0; d < 7; d++) {
            const date = new Date(Date.now() + d * 86400000);
            const dateStr = date.toISOString().split('T')[0];
            const rainfall = Math.round((Math.random() * 120) * 10) / 10;
            const cat = categories.find(c => rainfall >= c.min && rainfall < c.max) || categories[3];
            const confidence = Math.round((70 + Math.random() * 25) * 10) / 10;
            insertPrediction.run(s.id, dateStr, rainfall, cat.name, confidence);
        }
    }
});
predTransaction();
console.log(`✓ ${stations.length * 7} predictions seeded`);

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
    INSERT INTO model_performance (rmse, mae, r_squared, accuracy, training_date, model_version, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
`);
insertPerf.run(12.4, 9.1, 0.85, 88.0, '2024-05-24', 'LSTM-v1.0', 'Model LSTM trained on 5 years historical data from 50 stations');
console.log('✓ Model performance seeded');

db.close();
console.log(`\n✅ Database seeded successfully at:`, dbPath);
console.log(`   Total: ${stations.length} stations, ${stations.length} sensor records, ${stations.length * 7} predictions, ${alertStations.length} alerts`);
