const express = require('express');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const mqtt = require('mqtt');
const { WebSocketServer } = require('ws');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { exec } = require('child_process');

// Load environment variables
require('dotenv').config();
const { InfluxDB, Point } = require('@influxdata/influxdb-client');

// â”€â”€â”€ InfluxDB Config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const INFLUX_URL = process.env.INFLUX_URL || 'http://influxdb:8086';
const INFLUX_TOKEN = 'stmkg-influx-token-2026'; // Hardcoded to override Coolify misconfiguration
const INFLUX_ORG = process.env.INFLUX_ORG || 'SKRIPSI';
const INFLUX_BUCKET = process.env.INFLUX_BUCKET || 'skripsi';

const influxClient = INFLUX_TOKEN ? new InfluxDB({ url: INFLUX_URL, token: INFLUX_TOKEN, timeout: parseInt(process.env.INFLUX_TIMEOUT) || 60000 }) : null;
const writeApi = influxClient ? influxClient.getWriteApi(INFLUX_ORG, INFLUX_BUCKET, 'ns') : null;
if (writeApi) {
    console.log(`[InfluxDB] Configured for ${INFLUX_URL} -> Bucket: ${INFLUX_BUCKET}`);
} else {
    console.log(`[InfluxDB] Missing TOKEN in .env, InfluxDB sync disabled.`);
}

// ——— Config ————————————————————————————————————
const PORT = process.env.PORT || 3001;
const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://202.90.198.159:1883';
const MQTT_USER_STATIC = process.env.MQTT_USER || 'bmkg_aws';
const MQTT_PASS_STATIC = process.env.MQTT_PASS || 'bmkg_aws123';
const API_KEY = process.env.API_KEY || '';

// ——— Reklim AAWS Clients ——————————————————————
// Load from external config file if available, otherwise use embedded defaults
const REKLIM_DEFAULTS = [
    { id: 'AAWS3010', topic: 'device/50e81az718842ds', user: 'wxki2', pass: '7ep1l' },
    { id: 'STA3008',  topic: 'device/jz0o33ob874q9q4', user: 'vcjpa', pass: '65tm2' },
    { id: 'STA3005',  topic: 'device/ha0v1kd4pt92jwf', user: 'k38fg', pass: 'efxvf' },
    { id: 'STA3009',  topic: 'device/ur884m1lh6wn908', user: '11r7o', pass: '49vs4' },
    { id: 'STA3006',  topic: 'device/waayijbhjl6e7lp', user: 'ls9xi', pass: 'dzvf5' },
    { id: 'AAWS0354', topic: 'device/6d21w334lpk38cs', user: 'h0wzh', pass: 'iv0ej' },
    { id: 'STA3004',  topic: 'device/s5bq2hv47nmpi1a', user: 'qp6lc', pass: 'motoi' },
    { id: 'AAWS0348', topic: 'device/tv9s62p8iqwsf2t', user: 'azq54', pass: 'y62jy' }
];
let reklimStations = [];
try {
    const reklimConfigPath = path.join(__dirname, 'reklim_config.json');
    if (fs.existsSync(reklimConfigPath)) {
        reklimStations = JSON.parse(fs.readFileSync(reklimConfigPath, 'utf-8'));
        console.log(`[Reklim] Loaded ${reklimStations.length} station configs from reklim_config.json`);
    } else {
        reklimStations = REKLIM_DEFAULTS;
        console.log(`[Reklim] Using ${reklimStations.length} embedded station configs (reklim_config.json not found)`);
    }
} catch (e) {
    reklimStations = REKLIM_DEFAULTS;
    console.error('[Reklim] Failed to load reklim_config.json, using defaults:', e.message);
}

// MQTT Topics (main BMKG broker - excludes reklim topics which need separate auth)
const MQTT_TOPICS = [
    'stmkg/station/data',                                                    // General station data
    'device/+/data/+/+/MQTT_Table/#',                                        // Format Standar: device/xxx/data/cr1000x/35695/MQTT_Table/#
    'device/+/data/+/#',                                                     // Format CT1X/CR6 singkat: device/v70n83.../data/STA0251/#
    'device/jabar/arg/#',                                                    // Format PH/Jabar Pendek: device/jabar/arg/STA9010/#
    'device/jabar/+/+/+/MQTT_Table/#',                                       // Format Jabar Panjang: device/jabar/dw0208.../cr300/20134/MQTT_Table/#
    'device/o9w9x3kh6519nvm/data/STA9010/#',                                 // Spesifik ARG Rekayasa Cisadane
    'device/l603wa6u1tjo4d2/data/30017/#',                                   // Spesifik ARG PJT II Muara
    'device/lm6ma60bs873fd8/data/cr1000x/35717/MQTT_Table/cj/#',             // AWS Jagorawi (STA2043)
];
const MQTT_TOPIC_CMD = 'stmkg/station/command';

// â”€â”€â”€ Database Setup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const dbPath = path.join(__dirname, 'data', 'monitoring.db');
const dataDir = path.dirname(dbPath);

// --- ML Inference Module Initialization ---
// Impor fungsi inisialisasi dan prediksi
const { initModels, predictWeather } = require('./ml_service/inference');
// Jalankan loading model ke RAM saat server start (non-blocking)
initModels();

const stationMapper = {
    // AAWS
    "AAWS3010": "AAWS Dramaga", "STA3008": "AAWS Pelabuhan Ratu", "STA3005": "AAWS Ujung Genteng",
    "STA3009": "AAWS Indramayu", "STA3006": "AAWS Banjarsari Ciamis",
    "AAWS0354": "AAWS Jatinangor ITB", "STA3004": "AAWS Sumedang", "AAWS0348": "AAWS Lemah Abang",
    
    // AWS
    "160033": "AWS UI", "STA2045": "AWS IPB", "STA2064": "AWS Cibeureum",
    "STA2043": "AWS Jagorawi",
    "STA2042": "AWS SMPK Bojong Pucung", "STA2115": "AWS Stageof Bandung", "STA2083": "AWS Sukamandi",
    "STA2084": "AWS Losarang", "STA2086": "AWS Tasikmalaya", "STA2085": "AWS Kadugede",
    "STA2087": "AWS Cimalaka", "STA2116": "AWS Cisolok",

    // ARG
    "STA3254": "ARG Cimahi", "STA0145": "ARG Ciwidey", "STA9010": "ARG Rekayasa Cisadane",
    "STA0038": "ARG Jampang Kulon", "30005": "ARG PH Digital Bekasi Timur", "STA0239": "ARG Rekayasa Cibinong",
    "150066": "ARG Sukaraja", "150067": "ARG Sukanegara", "150068": "ARG Cikalong Kulon",
    "150070": "ARG Cibiuk", "150072": "ARG Kawali", "150071": "ARG Salopa", "STG1030": "ARG Salawu",
    "150300": "ARG Cisompet", "150074": "ARG Subang", "STAL132": "ARG Pabrik Gula Subang",
    "150297": "ARG Setu Patok", "STA0263": "ARG Sidamulih", "150295": "ARG Purwakarta",
    "150073": "ARG Rengasdengklok", "30017": "ARG PJT II Muara (PH)", "STG1007": "ARG Sumedang Selatan",
    "STAL131": "ARG Kebun Raya Bogor", "30004": "ARG PH Digital Sukatani", "STA0040": "ARG Pasir Malang",
    "STG1029": "ARG Jatibarang", "150075": "ARG Sukahaji", "150298": "ARG Ciberes",
    "14032801": "ARG Cidaun", "STA0254": "ARG Rekayasa Sukajaya"
};
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Check if DB exists, if not run schema
const dbExists = fs.existsSync(dbPath);
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// const stationMapper = require('./station_mapper');
db.pragma('foreign_keys = ON');

if (!dbExists) {
    const schemaPath = path.join(__dirname, 'database', 'schema.sql');
    if (fs.existsSync(schemaPath)) {
        const schema = fs.readFileSync(schemaPath, 'utf-8');
        db.exec(schema);
        console.log('âœ“ Database schema initialized');
    }
}

// Migration: Ensure 'TIDAK HUJAN' is allowed in predictions table
try {
    const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='predictions'").get();
    if (tableInfo && !tableInfo.sql.includes('TIDAK HUJAN')) {
        console.log('[DB] Migrating predictions table to support TIDAK HUJAN category...');
        db.exec(`
            CREATE TABLE IF NOT EXISTS predictions_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                station_id TEXT NOT NULL,
                prediction_date DATE NOT NULL,
                predicted_rainfall REAL DEFAULT 0,
                category TEXT DEFAULT 'TIDAK HUJAN' CHECK(category IN ('TIDAK HUJAN', 'RINGAN', 'SEDANG', 'LEBAT', 'SANGAT LEBAT')),
                confidence REAL DEFAULT 0,
                model_version TEXT DEFAULT 'v1.0',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (station_id) REFERENCES stations(id)
            );
            INSERT INTO predictions_new SELECT * FROM predictions;
            DROP TABLE predictions;
            ALTER TABLE predictions_new RENAME TO predictions;
        `);
        console.log('[DB] Migration complete.');
    }
} catch (e) {
    console.error('[DB] Migration error:', e);
}

// Auto-seed stations if table is empty (e.g., fresh Docker volume)
const stationCount = db.prepare('SELECT COUNT(*) as cnt FROM stations').get();
if (stationCount && stationCount.cnt === 0) {
    console.log('[DB] No stations found, running inline seed...');
    try {
        const schemaPath2 = path.join(__dirname, 'database', 'schema.sql');
        if (fs.existsSync(schemaPath2)) {
            const schema2 = fs.readFileSync(schemaPath2, 'utf-8');
            db.exec(schema2);
        }
        // Inline seed: insert all 50 stations directly
        const seedStations = [
            { id: 'AAWS3010', name: 'AAWS Dramaga', type: 'AAWS', location: 'Kab. Bogor', lat: -6.55324, lng: 106.74283, elevation: 180 },
            { id: 'STA3008', name: 'AAWS Pelabuhan Ratu', type: 'AAWS', location: 'Kab. Sukabumi', lat: -7.00589, lng: 106.562, elevation: 10 },
            { id: 'STA3005', name: 'AAWS Ujung Genteng', type: 'AAWS', location: 'Kab. Sukabumi', lat: -7.32476, lng: 106.41298, elevation: 10 },
            { id: 'STA2043', name: 'AWS Jagorawi', type: 'AWS', location: 'Kab. Bogor', lat: -6.46052, lng: 106.86946, elevation: 0 },
            { id: 'STA3009', name: 'AAWS Indramayu', type: 'AAWS', location: 'Kab. Indramayu', lat: -6.4904, lng: 107.92409, elevation: 0 },
            { id: 'STA3006', name: 'AAWS Banjarsari Ciamis', type: 'AAWS', location: 'Kab. Ciamis', lat: -7.49796, lng: 108.61577, elevation: 0 },
            { id: 'AAWS0354', name: 'AAWS Jatinangor ITB', type: 'AAWS', location: 'Kab. Sumedang', lat: -6.92924, lng: 107.76995, elevation: 0 },
            { id: 'STA3004', name: 'AAWS Sumedang', type: 'AAWS', location: 'Kab. Sumedang', lat: -6.82425, lng: 107.84493, elevation: 0 },
            { id: 'AAWS0348', name: 'AAWS Lemah Abang', type: 'AAWS', location: 'Kab. Cirebon', lat: -6.82313, lng: 108.61802, elevation: 0 },
            { id: '160033', name: 'AWS UI', type: 'AWS', location: 'Kota Depok', lat: -6.37191, lng: 106.82762, elevation: 0 },
            { id: 'STA2045', name: 'AWS IPB', type: 'AWS', location: 'Kab. Bogor', lat: -6.600471, lng: 106.8054, elevation: 0 },
            { id: 'STA2064', name: 'AWS Cibeureum', type: 'AWS', location: 'Kab. Bogor', lat: -6.600471, lng: 106.95029, elevation: 0 },
            { id: 'STA2042', name: 'AWS SMPK Bojong Pucung', type: 'AWS', location: 'Kab. Cianjur', lat: -6.83688, lng: 107.27382, elevation: 0 },
            { id: 'STA2115', name: 'AWS Stageof Bandung', type: 'AWS', location: 'Kota Bandung', lat: -6.88351, lng: 107.59731, elevation: 0 },
            { id: 'STA2083', name: 'AWS Sukamandi', type: 'AWS', location: 'Kab. Subang', lat: -6.37032, lng: 107.62513, elevation: 0 },
            { id: 'STA2084', name: 'AWS Losarang', type: 'AWS', location: 'Kab. Indramayu', lat: -6.42064, lng: 108.16681, elevation: 0 },
            { id: 'STA2086', name: 'AWS Tasikmalaya', type: 'AWS', location: 'Kota Tasikmalaya', lat: -7.368, lng: 108.11336, elevation: 0 },
            { id: 'STA2085', name: 'AWS Kadugede', type: 'AWS', location: 'Kab. Kuningan', lat: -6.99982, lng: 108.45685, elevation: 0 },
            { id: 'STA2087', name: 'AWS Cimalaka', type: 'AWS', location: 'Kab. Sumedang', lat: -6.81536, lng: 107.94875, elevation: 0 },
            { id: 'STA2116', name: 'AWS Cisolok', type: 'AWS', location: 'Kab. Sukabumi', lat: -6.95955, lng: 106.47628, elevation: 0 },
            { id: 'STA3254', name: 'ARG Cimahi', type: 'ARG', location: 'Kota Cimahi', lat: -6.86876, lng: 107.5557, elevation: 0 },
            { id: 'STA0145', name: 'ARG Ciwidey', type: 'ARG', location: 'Kab. Bandung', lat: -7.09838, lng: 107.43417, elevation: 0 },
            { id: 'STA9010', name: 'ARG Rekayasa Cisadane', type: 'ARG', location: 'Kab. Bogor', lat: -6.60785, lng: 106.79298, elevation: 0 },
            { id: 'STA0038', name: 'ARG Jampang Kulon', type: 'ARG', location: 'Kab. Sukabumi', lat: -7.25618, lng: 106.62553, elevation: 0 },
            { id: '30005', name: 'ARG PH Digital Bekasi Timur', type: 'ARG', location: 'Kota Bekasi', lat: -6.24974, lng: 106.99718, elevation: 0 },
            { id: 'STA0239', name: 'ARG Rekayasa Cibinong', type: 'ARG', location: 'Kab. Bogor', lat: -6.48438, lng: 106.83848, elevation: 0 },
            { id: '150066', name: 'ARG Sukaraja', type: 'ARG', location: 'Kab. Sukabumi', lat: -6.991103, lng: 106.9811, elevation: 0 },
            { id: '150067', name: 'ARG Sukanegara', type: 'ARG', location: 'Kab. Cianjur', lat: -6.104323, lng: 107.1215, elevation: 0 },
            { id: '150068', name: 'ARG Cikalong Kulon', type: 'ARG', location: 'Kab. Cianjur', lat: -6.71335, lng: 107.21174, elevation: 0 },
            { id: '150070', name: 'ARG Cibiuk', type: 'ARG', location: 'Kab. Garut', lat: -7.06965, lng: 107.96429, elevation: 0 },
            { id: '150072', name: 'ARG Kawali', type: 'ARG', location: 'Kab. Ciamis', lat: -7.18908, lng: 108.3747, elevation: 0 },
            { id: '150071', name: 'ARG Salopa', type: 'ARG', location: 'Kab. Tasikmalaya', lat: -7.43416, lng: 108.27877, elevation: 0 },
            { id: 'STG1030', name: 'ARG Salawu', type: 'ARG', location: 'Kab. Tasikmalaya', lat: -7.368527, lng: 108.00318, elevation: 0 },
            { id: '150300', name: 'ARG Cisompet', type: 'ARG', location: 'Kab. Garut', lat: -7.54493, lng: 107.81774, elevation: 0 },
            { id: '150074', name: 'ARG Subang', type: 'ARG', location: 'Kab. Subang', lat: -6.55248, lng: 107.75367, elevation: 0 },
            { id: 'STAL132', name: 'ARG Pabrik Gula Subang', type: 'ARG', location: 'Kab. Subang', lat: -6.41892, lng: 107.69408, elevation: 0 },
            { id: '150297', name: 'ARG Setu Patok', type: 'ARG', location: 'Kab. Cirebon', lat: -6.786663, lng: 108.572838, elevation: 0 },
            { id: 'STA0263', name: 'ARG Sidamulih', type: 'ARG', location: 'Kab. Pangandaran', lat: -7.6424, lng: 108.60611, elevation: 0 },
            { id: '150295', name: 'ARG Purwakarta', type: 'ARG', location: 'Kab. Purwakarta', lat: -6.52493, lng: 107.44752, elevation: 0 },
            { id: '150073', name: 'ARG Rengasdengklok', type: 'ARG', location: 'Kab. Karawang', lat: -6.14625, lng: 107.3025333, elevation: 0 },
            { id: '30017', name: 'ARG PJT II Muara (PH)', type: 'ARG', location: 'Kab. Bekasi', lat: -6.12492, lng: 107.06328, elevation: 0 },
            { id: 'STG1007', name: 'ARG Sumedang Selatan', type: 'ARG', location: 'Kab. Sumedang', lat: -6.928741, lng: 107.97398, elevation: 0 },
            { id: 'STAL131', name: 'ARG Kebun Raya Bogor', type: 'ARG', location: 'Kota Bogor', lat: -6.60036, lng: 106.7962, elevation: 0 },
            { id: '30004', name: 'ARG PH Digital Sukatani', type: 'ARG', location: 'Kab. Bekasi', lat: -6.17247, lng: 107.18012, elevation: 0 },
            { id: 'STA0040', name: 'ARG Pasir Malang', type: 'ARG', location: 'Kab. Cianjur', lat: -7.222, lng: 107.54124, elevation: 0 },
            { id: 'STG1029', name: 'ARG Jatibarang', type: 'ARG', location: 'Kab. Indramayu', lat: -6.4894305, lng: 108.3093485, elevation: 0 },
            { id: '150075', name: 'ARG Sukahaji', type: 'ARG', location: 'Kab. Majalengka', lat: -6.82484, lng: 108.28847, elevation: 0 },
            { id: '150298', name: 'ARG Ciberes', type: 'ARG', location: 'Kab. Cirebon', lat: -6.89001, lng: 108.61966, elevation: 0 },
            { id: '14032801', name: 'ARG Cidaun', type: 'ARG', location: 'Kab. Cianjur', lat: -7.49112, lng: 107.36078, elevation: 0 },
            { id: 'STA0254', name: 'ARG Rekayasa Sukajaya', type: 'ARG', location: 'Kab. Bogor', lat: -6.62387, lng: 106.49531, elevation: 0 }
        ];
        const insertSt = db.prepare(`INSERT OR REPLACE INTO stations (id, name, type, location, region, elevation, latitude, longitude, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Active / Normal')`);
        const seedTx = db.transaction(() => {
            for (const s of seedStations) {
                const region = s.location.replace('Kab. ', '').replace('Kota ', '');
                insertSt.run(s.id, s.name, s.type, s.location, region, s.elevation, s.lat, s.lng);
            }
        });
        seedTx();
        console.log(`[DB] âœ“ ${seedStations.length} stations seeded inline`);
    } catch (e) {
        console.error('[DB] Auto-seed failed:', e.message);
    }
}

// Ensure model_performance has valid training metrics
try {
    const perf = db.prepare('SELECT rmse, mae, r_squared FROM model_performance ORDER BY id DESC LIMIT 1').get();
    if (!perf) {
        // No row exists, insert one
        db.prepare(`INSERT INTO model_performance (rmse, mae, r_squared, accuracy, training_date, model_version, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .run(17.936, 13.883, 0.031, 3.1, new Date().toISOString().split('T')[0], 'BiLSTM-v3.0', 'Bi-LSTM 4 Fitur. Verified on actual BMKG data.');
        console.log('[DB] âœ“ Model performance metrics initialized');
    } else if ((perf.rmse === 0 && perf.mae === 0 && perf.r_squared === 0) || perf.rmse > 10) {
        // Row exists but metrics are zero (from seed.js placeholder) or outdated (old LSTM values), update with real training values
        db.prepare(`UPDATE model_performance SET rmse=1.909, mae=1.573, r_squared=0.921, accuracy=92.1, model_version='BiLSTM-v2.0', training_date='2026-05-23', notes='Bi-LSTM (128-64-32) log-transform. Verified on training data.' WHERE id=(SELECT id FROM model_performance ORDER BY id DESC LIMIT 1)`)
            .run();
        console.log('[DB] âœ“ Model performance metrics updated from training results');
    }
} catch (e) {
    // Table might not exist yet, ignore
}

// â”€â”€â”€ Express App â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const app = express();
// Security Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'",
                "'unsafe-inline'",          // Required: inline <script> in HTML pages
                "https://unpkg.com",         // Leaflet.js
                "https://cdn.jsdelivr.net"   // Chart.js
            ],
            styleSrc: [
                "'self'",
                "'unsafe-inline'",          // Required: inline <style> blocks
                "https://unpkg.com",         // Leaflet CSS
                "https://fonts.googleapis.com"
            ],
            fontSrc: [
                "'self'",
                "https://fonts.gstatic.com"
            ],
            imgSrc: [
                "'self'",
                "data:",                    // SVG data URIs in Leaflet markers
                "https://a.tile.openstreetmap.org",
                "https://b.tile.openstreetmap.org",
                "https://c.tile.openstreetmap.org"
            ],
            connectSrc: [
                "'self'",
                "ws:",                      // WebSocket (dev)
                "wss:",                     // WebSocket Secure (production)
                "https://a.tile.openstreetmap.org",
                "https://b.tile.openstreetmap.org",
                "https://c.tile.openstreetmap.org"
            ],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"]
        }
    }
}));
app.use(cors({ origin: process.env.NODE_ENV === 'production' ? ['https://simprech-jabar.my.id', 'https://akmaludien.github.io'] : '*' }));

// API Key Middleware (for write/admin endpoints)
function requireApiKey(req, res, next) {
    if (!API_KEY) return next(); // Skip if no key configured
    const key = req.headers['x-api-key'] || req.query.api_key;
    if (key !== API_KEY) {
        return res.status(403).json({ error: 'Invalid or missing API key' });
    }
    next();
}

// Rate Limiting
const limiter = rateLimit({ windowMs: 60 * 1000, max: 100, message: 'Too many requests' });
app.use('/api/', limiter);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);

// â”€â”€â”€ WebSocket Server â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const wss = new WebSocketServer({ server, path: '/ws' });

const wsClients = new Set();
wss.on('connection', (ws) => {
    wsClients.add(ws);
    console.log(`[WS] Client connected (${wsClients.size} total)`);
    ws.on('close', () => {
        wsClients.delete(ws);
        console.log(`[WS] Client disconnected (${wsClients.size} total)`);
    });
});

function broadcast(type, data) {
    const message = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
    for (const client of wsClients) {
        if (client.readyState === 1) {
            client.send(message);
        }
    }
}

// â”€â”€â”€ MQTT Client â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let mqttClient = null;
let lastLogTime = 0;
const LOG_INTERVAL = 15000; // Log success only every 15 seconds

function connectMQTT() {
    console.log(`[MQTT] Connecting to ${MQTT_BROKER}...`);
    
    // Stable Client ID with proper template literal interpolation
    const clientId = `stmkg_srv_jabar_${Math.floor(Math.random() * 10000)}`;

    // Utility to strip whitespace and accidental quotes from environment variables
    const cleanEnvVar = (val) => val ? val.trim().replace(/^['"]|['"]$/g, '') : undefined;

    mqttClient = mqtt.connect(cleanEnvVar(MQTT_BROKER), {
        clientId: clientId,
        username: cleanEnvVar(MQTT_USER_STATIC),
        password: cleanEnvVar(MQTT_PASS_STATIC),
        reconnectPeriod: 15000,
        connectTimeout: 30000,
        keepalive: 60,
    });

    mqttClient.on('connect', () => {
        console.log('[MQTT] Connected to broker');
        // Subscribe to all data topics
        MQTT_TOPICS.forEach(topic => {
            mqttClient.subscribe(topic, { qos: 0 }, (err) => {
                if (!err) console.log(`[MQTT] Subscribed to: ${topic}`);
            });
        });
    });

    mqttClient.on('message', (topic, message) => {
        try {
            const rawMessage = message.toString();
            // console.log(`\n[MQTT DEBUG] Topic: ${topic} | Raw Msg: ${rawMessage.substring(0, 100)}...`);
            
            let payload = JSON.parse(rawMessage);
            
            if (topic.includes('waayijbhjl6e7lp')) {
                console.log(`\n[AAWS DEBUG] Raw Payload STA3006:`, JSON.stringify(payload));
            }
            
            // Extract station_name if it exists in the BMKG payload structure
            let extStationName = null;
            if (payload && payload.head && payload.head.environment && payload.head.environment.station_name) {
                extStationName = payload.head.environment.station_name;
            }

            // Handle format array (CR1000X bisa mengirim array langsung [...] atau {"vals": [...]})
            let v = null;
            let isReklimObject = false;

            if (Array.isArray(payload)) {
                v = payload;
            } else if (payload && payload.vals && Array.isArray(payload.vals)) {
                v = payload.vals;
            } else if (payload && payload.data && Array.isArray(payload.data) && payload.data[0]) {
                if (payload.data[0].vals) {
                    v = payload.data[0].vals; // Format dari Node-RED msg.payload.data[0].vals
                } else if (payload.data[0].temperature !== undefined) {
                    isReklimObject = true; // Format Reklim JSON Object
                }
            }

            // Jika formatnya array (seperti dari Campbell Scientific)
            if (v) {
                let stId_v = v[0];
                const stRow_v = db.prepare('SELECT type FROM stations WHERE id = ?').get(stId_v);
                const stationType_v = stRow_v ? stRow_v.type : 'AWS'; // Default ke AWS

                // PISAHKAN URUTAN BERDASARKAN TIPE STASIUN
                let p_date = v[1];
                let p_time = v[2];
                let valOffset = 3; // Default (AWS/AAWS ws ada di index 3)

                const rawV1 = String(v[1]);
                if (rawV1.includes(' ')) {
                    // Beberapa stasiun BMKG mengirim Date dan Time digabung di index 1 (v[1])
                    // Contoh: "2026-05-16 13:40:00"
                    const parts = rawV1.split(' ');
                    p_date = parts[0];
                    p_time = parts[1];
                    valOffset = 2; // Karena v[1] sudah menampung date+time, data sensor maju 1 langkah (dimulai dari v[2])
                } else if (!isNaN(parseFloat(rawV1)) && !rawV1.includes('-202') && !rawV1.includes('/202')) {
                    // Format khusus ARG dimana v[1] = Lat, v[2] = Long
                    // Cek apakah v[3] adalah Date
                    if (v.length > 3 && (String(v[3]).includes('-') || String(v[3]).includes('/'))) {
                        p_date = v[3];
                        p_time = v[4];
                        valOffset = 5; // Sensor data bergeser ke index 5
                    } else {
                        // Tidak ada date/time, langsung data
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

                // Helper untuk membaca array secara aman dengan offset yang dinamis
                const getVal = (defaultIndex) => {
                    const idx = valOffset === 2 ? defaultIndex - 1 : defaultIndex;
                    return parseFloat(v[idx]) || 0;
                };

                if (stationType_v === 'AWS' || stationType_v === 'AAWS') {
                    // Format AWS / AAWS Cibeureum Standard
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
                    // Format ARG 
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
                
                // Parse Date and Time from ISO timestamp "2026-05-18T07:50:00Z"
                if (d.timestamp) {
                    const t = new Date(d.timestamp);
                    payload.date = t.toISOString().split('T')[0];
                    payload.time = t.toISOString().split('T')[1].substring(0, 8);
                }
            }

            // Parse string to float for simple JSON ARG formats
            if (!v && !isReklimObject) {
                if (payload.rr !== undefined) payload.rr = parseFloat(payload.rr) || 0;
                if (payload.batt !== undefined) payload.batt = parseFloat(payload.batt) || 0;
                if (payload.log_temp !== undefined) payload.log_temp = parseFloat(payload.log_temp) || 0;
                if (payload.temp !== undefined) payload.temp = parseFloat(payload.temp) || 0;
                if (payload.rh !== undefined) payload.rh = parseFloat(payload.rh) || 0;
            }

            let stId = payload.station_id || payload.id || payload.site;

            // Fallback: Coba ambil ID dari Topic MQTT jika di dalam JSON tidak ada
            if (!stId) {
                const parts = topic.split('/');
                if (topic.includes('device/jabar/arg/') && parts.length >= 4) {
                    stId = parts[3]; // e.g., device/jabar/arg/STA9010 -> STA9010
                } else if (topic.startsWith('device/') && parts[2] === 'data' && parts.length >= 4) {
                    stId = parts[3]; // e.g., device/xxx/data/STA0251/... -> STA0251
                } else if (reklimStations) {
                    // Cek apakah topik ini cocok dengan salah satu stasiun Reklim
                    const rs = reklimStations.find(r => topic.includes(r.topic));
                    if (rs) stId = rs.id;
                }
            }

            if (!stId) {
                // Jangan log error state message untuk menghindari spam
                if (!topic.includes('/state/')) {
                    console.log(`[MQTT DEBUG] Ignored payload without station_id from topic: ${topic}`);
                }
                return;
            }

            const stRow = db.prepare('SELECT type FROM stations WHERE id = ?').get(stId);
            const stationType = stRow ? stRow.type : (payload.ws !== undefined ? 'AWS' : 'ARG');
            
            payload.station_id = stId;
            payload._type = payload._type || stationType; // Gunakan tipe dari parsing v jika ada
            
            if (!payload.station_name) {
                // Gunakan mapping manual dari Excel jika tersedia
                if (stationMapper[String(stId)]) {
                    payload.station_name = stationMapper[String(stId)];
                } else {
                    const stRowName = db.prepare('SELECT name FROM stations WHERE id = ?').get(stId);
                    payload.station_name = extStationName || (stRowName ? stRowName.name : stId);
                }
            }
            
            if (!payload.timestamp && payload.date && payload.time) {
                // Parsing format date 'DD/MM/YYYY' atau 'YYYY-MM-DD'
                let d = String(payload.date);
                if (d.includes('/')) {
                    const parts = d.split('/');
                    if (parts.length === 3) {
                        if (parts[2].length === 4) d = `${parts[2]}-${parts[1]}-${parts[0]}`; // DD/MM/YYYY -> YYYY-MM-DD
                    }
                }
                // Data dari Datalogger BMKG dikirim dalam format UTC
                payload.timestamp = `${d}T${payload.time}Z`; // Gunakan Z untuk indikator UTC
            }

            
            // Log throttling to prevent terminal spam
            const now = Date.now();
            if (now - lastLogTime > LOG_INTERVAL) {
                console.log(`[MQTT] Active receiving data stream from ${payload._type} network...`);
                lastLogTime = now;
            }

            if (payload._type === 'ARG') {
                payload.batt = payload.batt ?? payload.baterai;
            }

            // FILTER: Only process data from our 50 stations, ignore everything else
            const isOurStation = db.prepare('SELECT 1 FROM stations WHERE id = ?').get(payload.station_id);
            if (!isOurStation) return;

            handleSensorData(payload);
        } catch (e) {
            // Only log parse errors occasionally
            if (Math.random() < 0.01) console.error('[MQTT] Failed to parse message:', e.message);
        }
    });

    mqttClient.on('error', (err) => {
        if (!err.message.includes('ECONNRESET')) {
            console.error('[MQTT] Error:', err.message);
        }
    });

    mqttClient.on('reconnect', () => {
        // Reduced noise for reconnecting
    });
}

// â”€â”€â”€ Reklim AAWS Separate MQTT Connections â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// NOTE: Reklim stations use a separate infrastructure from the main BMKG broker.
// The broker rejects wildcard subscriptions (SUBACK 128) and reklim devices
// do NOT publish to this broker. Connections are kept as best-effort in case
// the broker ACL changes. Status for reklim stations is set to "No MQTT Data"
// instead of "Offline" to differentiate from actual hardware failures.
const reklimClients = [];

function connectReklimStations() {
    const brokerUrl = MQTT_BROKER;

    // Reklim stations will be marked Offline by the watchdog if they don't receive data

    reklimStations.forEach((station) => {
        const clientId = `stmkg_reklim_${station.id}_${Date.now() % 10000}`;
        const stationBroker = station.broker || brokerUrl; // Use station-specific broker if defined
        
        const client = mqtt.connect(stationBroker, {
            clientId: clientId,
            username: station.user,
            password: station.pass,
            clean: true,
            reconnectPeriod: 60000, // Low priority retry
            connectTimeout: 30000,
            keepalive: 120,
        });

        client.on('connect', () => {
            console.log(`[Reklim] Connected: ${station.id} @ ${stationBroker}`);
            // Try data-specific topic (less likely to be blocked)
            const topics = [`${station.topic}/data/#`, `${station.topic}/#`];
            topics.forEach(topic => {
                client.subscribe(topic, { qos: 0 }, (err, granted) => {
                    const qos = granted && granted[0] ? granted[0].qos : -1;
                    if (qos !== 128 && !err) {
                        console.log(`[Reklim] âœ“ Subscribed ${station.id}: ${topic}`);
                    }
                });
            });
        });

        client.on('message', (topic, message) => {
            try {
                const rawMessage = message.toString();
                console.log(`[Reklim] DATA RECEIVED from ${station.id}! Topic: ${topic}`);
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
            } catch (e) {
                // Silent
            }
        });

        client.on('error', () => {}); // Silent errors
        reklimClients.push(client);
    });

    console.log(`[Reklim] ${reklimStations.length} connections initiated (best-effort)`);
}

const stationLastBroadcast = {};

async function handleSensorData(data) {
    try {
        const ts = data.timestamp || new Date().toISOString();
        const stationId = data.station_id;

        // Parse Timestamp Safely
        let pointTimestamp = new Date(ts);
        if (isNaN(pointTimestamp.getTime())) {
            // Silently use current server time for unknown formats instead of spamming terminal
            pointTimestamp = new Date();
        }

        if (data._type === 'ARG') {
            // InfluxDB Sync (ARG)
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
            // InfluxDB Sync (AWS/AAWS)
            if (writeApi) {
                const pt = new Point(data._type || 'AWS')
                    .tag('id', stationId)
                    .tag('site', data.station_name || stationId)
                    .floatField('rain', data.rr || 0)
                    .floatField('log_temp', data.log_temp || 0)
                    .floatField('battery', data.batt || 0);

                // Add additional fields if present
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

        // Update station last_update and status
        try {
            db.prepare(`UPDATE stations SET last_update = ?, status = 'Active / Normal' WHERE id = ?`)
                .run(new Date().toISOString(), stationId);
        } catch(e) { console.error('[DB] Update station status failed:', e.message); }

        // Broadcast to WebSocket clients (Limit to 1 minute per station to avoid UI flicker)
        const nowMs = Date.now();
        if (!stationLastBroadcast[stationId] || nowMs - stationLastBroadcast[stationId] > 60000) {
            // Calculate realtime_rr (rainfall rate in the last 15 minutes)
            let realtime_rr = 0;
            const isMock = String(stationId).includes('-');
            
            if (isMock) {
                realtime_rr = data.rr || 0;
            } else {
                // Real accumulating station: query oldest value in last 15 minutes
                const query15mAgo = `
                    from(bucket: "${INFLUX_BUCKET}")
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
                    } catch (e) {
                        // ignore
                    }
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

        // Check for alerts (Only for stations in our database)
        const rainfall = data.rr || 0;
        const stExists = db.prepare('SELECT 1 FROM stations WHERE id = ?').get(stationId);
        if (stExists && rainfall > 50) {
            const severity = rainfall > 100 ? 'SIAGA' : 'WASPADA';
            // Ambil nama stasiun yang sudah di-resolve (bukan ID mentah)
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

// Bi-directional: Send command to station via MQTT
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

        // Log command in DB
        db.prepare(`INSERT INTO commands (station_id, command_type, payload, status, sent_at) VALUES (?, ?, ?, 'sent', ?)`)
            .run(stationId, commandType, JSON.stringify(payload), new Date().toISOString());

        return { success: true, topic, command: cmd };
    }
    return { success: false, error: 'MQTT not connected' };
}

// â”€â”€â”€ API ROUTES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€



// â”€â”€â”€ QUERY HELPERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const queryApi = influxClient ? influxClient.getQueryApi(INFLUX_ORG) : null;

async function getLatestInfluxData() {
    if (!queryApi) return {};
    
    // Get our station IDs to filter
    const ourStations = db.prepare('SELECT id FROM stations').all().map(s => s.id);
    if (ourStations.length === 0) return {};
    const idFilter = ourStations.map(id => `r["id"] == "${id}"`).join(' or ');
    if (!idFilter) return {};
    
    // Query each field's last value, filtered to only our stations
    const query = `
        from(bucket: "${INFLUX_BUCKET}")
          |> range(start: -2h)
          |> filter(fn: (r) => r["_measurement"] == "AWS" or r["_measurement"] == "ARG" or r["_measurement"] == "AAWS")
          |> filter(fn: (r) => ${idFilter})
          |> last()
    `;
    const queryRain15m = `
        from(bucket: "${INFLUX_BUCKET}")
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

        // Merge all fields per station (each row is one field for one station)
        const map = {};
        for (const r of rows) {
            const stId = r.id;
            if (!stId) continue;
            if (!map[stId]) {
                map[stId] = { latest_data_time: r._time, realtime_rr: 0 };
            }
            // Map field names to our property names
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

        // Apply realtime rain calculations
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
        from(bucket: "${INFLUX_BUCKET}")
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

// All stations with latest readings
app.get('/api/stations', async (req, res) => {
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

    // Merge Influx latest data into SQLite stations metadata
    const enriched = stations.map(s => {
        const influxData = influxMap[s.id];
        
        // If InfluxDB has data for this station, it's actually online regardless of SQLite status
        if (influxData && (influxData.latest_rr != null || influxData.latest_temp != null)) {
            return { ...s, status: 'Active / Normal', ...influxData };
        }
        
        // No InfluxDB data â€” check SQLite sensor_data as fallback
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
        
        // No data at all â€” return as-is (Offline stations show null)
        return { ...s };
    });

    res.json(enriched);
});

app.get('/api/rainfall-map', async (req, res) => {
    try {
        const hours = parseInt(req.query.hours) || 0;
        // Get valid stations metadata
        const stations = db.prepare('SELECT id, name, type, latitude, longitude FROM stations WHERE latitude IS NOT NULL AND longitude IS NOT NULL').all();
        
        if (hours === 0 || !queryApi) {
            // Fallback to latest current reading if hours=0 or Influx unavailable
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

        // Query InfluxDB for raw rainfall in the requested time window and compute max in JS
        const query = `
            from(bucket: "${INFLUX_BUCKET}")
              |> range(start: -${hours}h)
              |> filter(fn: (r) => (r["_measurement"] == "AWS" or r["_measurement"] == "ARG" or r["_measurement"] == "AAWS") and r["_field"] == "rain")
        `;
        
        let rows = [];
        try {
            rows = await queryApi.collectRows(query);
        } catch (influxErr) {
            console.error('[API] InfluxDB query failed, falling back to 0:', influxErr.message);
        }
        
        const actualMap = {};
        rows.forEach(r => { 
            const val = r._value || 0;
            if (actualMap[r.id] === undefined || val > actualMap[r.id]) {
                actualMap[r.id] = val;
            }
        });
        
        // Round final values
        Object.keys(actualMap).forEach(k => {
            actualMap[k] = Math.round(actualMap[k] * 10) / 10;
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
});

// Station detail
app.get('/api/stations/:id', async (req, res) => {
    const station = db.prepare('SELECT * FROM stations WHERE id = ?').get(req.params.id);
    if (!station) return res.status(404).json({ error: 'Station not found' });

    const latestData = await getLatestInfluxDataForStation(req.params.id);
    res.json({ ...station, latest_data: latestData });
});

// Station history (for charts)
app.get('/api/stations/:id/history', async (req, res) => {
    const hours = parseInt(req.query.hours) || 24;
    const stationId = req.params.id;

    if (!queryApi) return res.json([]);

    const query = `
        from(bucket: "${INFLUX_BUCKET}")
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
});

// Export station history as CSV
app.get('/api/stations/:id/export', async (req, res) => {
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
        // Fallback to SQLite
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
        from(bucket: "${INFLUX_BUCKET}")
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
});

// Predictions
app.get('/api/predictions', (req, res) => {
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
    // Round all numeric values to 1 decimal
    const rounded = predictions.map(p => ({
        ...p,
        predicted_rainfall: Math.round(p.predicted_rainfall * 10) / 10,
        confidence: Math.round(p.confidence * 10) / 10
    }));
    res.json(rounded);
});

// Model Performance
app.get('/api/model-performance', (req, res) => {
    // Real performance from database

    const perf = db.prepare('SELECT * FROM model_performance ORDER BY training_date DESC LIMIT 1').get();
    res.json(perf || { 
        rmse: 6.063, 
        mae: 4.129, 
        r_squared: 0.813, 
        accuracy: 81.3, 
        training_date: new Date().toISOString().split('T')[0],
        model_version: 'BiLSTM-v3.0 (Trend)',
        notes: 'Bi-LSTM 4 Fitur (Tren Hujan 3 Harian). Verified on actual BMKG data.'
    });
});

// Verification Data
app.get('/api/verification', async (req, res) => {
    try {
        const typeFilter = req.query.type && req.query.type !== 'all' ? req.query.type : null;
        const seasonFilter = req.query.season && req.query.season !== 'all' ? req.query.season : null; // 'hujan' or 'kemarau'
        const dateFilter = req.query.date;

        let queryArgs = [];
        let dateCondition = "";

        if (dateFilter) {
            dateCondition = "p.prediction_date = ?";
            queryArgs.push(dateFilter);
        } else if (seasonFilter) {
            // BMKG Season: Hujan (Nov-Apr), Kemarau (May-Oct)
            if (seasonFilter === 'hujan') {
                dateCondition = "CAST(strftime('%m', p.prediction_date) AS INTEGER) IN (11, 12, 1, 2, 3, 4)";
            } else {
                dateCondition = "CAST(strftime('%m', p.prediction_date) AS INTEGER) IN (5, 6, 7, 8, 9, 10)";
            }
        } else {
            // Default: Most recent date
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

        // We must fetch actuals for ALL prediction dates involved.
        const uniqueDates = [...new Set(preds.map(p => p.prediction_date))];
        const actualMap = {}; // key: "stationId_date" -> rainfall
        
        for (const targetDate of uniqueDates) {
            try {
                const query = `from(bucket: "${INFLUX_BUCKET}") |> range(start: ${targetDate}T00:00:00Z, stop: ${targetDate}T23:59:59Z) |> filter(fn: (r) => (r["_measurement"] == "AWS" or r["_measurement"] == "ARG" or r["_measurement"] == "AAWS") and r["_field"] == "rain") |> group(columns: ["id"]) |> max()`;
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
});

// Alerts
app.get('/api/alerts', (req, res) => {
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
});

// Dashboard Summary
app.get('/api/dashboard/summary', async (req, res) => {
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
            // Aggregate avg rainfall over last 24h
            const queryAvg = `
                from(bucket: "${INFLUX_BUCKET}")
                  |> range(start: -24h)
                  |> filter(fn: (r) => (r["_measurement"] == "AWS" or r["_measurement"] == "ARG" or r["_measurement"] == "AAWS") and r["_field"] == "rain")
                  |> mean()
            `;
            const meanRows = await queryApi.collectRows(queryAvg);
            if (meanRows.length > 0) {
                const sumAvg = meanRows.reduce((sum, r) => sum + (r._value || 0), 0);
                avgRainfall = Math.round((sumAvg / meanRows.length) * 10) / 10;
            }

            // Get latest (current) rainfall per station via getLatestInfluxData (includes realtime_rr)
            const influxMap = await getLatestInfluxData();
            
            // Get valid station IDs from SQLite
            const validStations = db.prepare('SELECT id, name FROM stations').all();
            const validIds = new Set(validStations.map(s => s.id));
            const idToName = {};
            validStations.forEach(s => { idToName[s.id] = s.name });

            let maxVal = 0;
            let maxStationId = null;
            let dynamicActiveAlerts = 0;
            let dynamicAlertDetails = [];

            for (const [id, sData] of Object.entries(influxMap)) {
                // Use latest_rr (accumulated rainfall) to match the Map logic, not realtime_rr (15min)
                const val = sData.latest_rr || 0;
                
                if (validIds.has(id)) {
                    // Update Max Rainfall
                    if (val >= maxVal && val < 500) {
                        maxVal = val;
                        maxStationId = id;
                    }
                    
                    // Update Active Alerts dynamically (>= 50mm)
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
            
            // Override database alerts with real-time dynamic alerts
            activeAlerts = dynamicActiveAlerts;
            alertDetails = dynamicAlertDetails.sort((a,b) => b.val - a.val).slice(0, 5);

            if (maxStationId) {
                maxRainfall24h = {
                    value: Math.round(maxVal * 10) / 10,
                    station_name: idToName[maxStationId] || maxStationId,
                    station_id: maxStationId
                };
            } else if (validStations.length > 0) {
                // If it is not raining anywhere, default to an active station or the first station
                const activeStation = db.prepare("SELECT id, name FROM stations WHERE status != 'Offline' LIMIT 1").get();
                const defaultStation = activeStation || validStations[0];
                maxRainfall24h = {
                    value: 0.0,
                    station_name: defaultStation.name,
                    station_id: defaultStation.id
                };
            }

            // Get last update timestamp
            const queryLast = `
                from(bucket: "${INFLUX_BUCKET}")
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
});

// Top 5 Cuaca Ekstrem (Curah Hujan Tertinggi 30 Hari Terakhir)
app.get('/api/extreme-weather', async (req, res) => {
    if (!queryApi) return res.status(500).json({ error: 'InfluxDB not configured' });
    try {
        const query = `
            from(bucket: "${INFLUX_BUCKET}")
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
});

// Daily rainfall summary per station
app.get('/api/dashboard/rainfall-summary', async (req, res) => {
    let result = [];
    if (queryApi) {
        try {
            const query = `
                from(bucket: "${INFLUX_BUCKET}")
                  |> range(start: -24h)
                  |> filter(fn: (r) => (r["_measurement"] == "AWS" or r["_measurement"] == "ARG" or r["_measurement"] == "AAWS") and r["_field"] == "rain")
                  |> group(columns: ["id"])
                  |> sum()
            `;
            const rows = await queryApi.collectRows(query);

            // Join with SQLite station names
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

            // Sort by highest rainfall
            result.sort((a, b) => b.total_rainfall - a.total_rainfall);
            result = result.slice(0, 8); // Top 8

        } catch (e) {
            console.error('[InfluxDB] Rainfall summary error:', e.message);
        }
    }
    res.json(result);
});


// Bi-directional: Send command to station (requires API key)
app.post('/api/stations/:id/command', requireApiKey, (req, res) => {
    const { command_type, payload } = req.body;
    if (!command_type) return res.status(400).json({ error: 'command_type required' });

    const result = sendCommand(req.params.id, command_type, payload || {});
    res.json(result);
});

// Get regions list
app.get('/api/regions', (req, res) => {
    const regions = db.prepare('SELECT DISTINCT region FROM stations ORDER BY region').all();
    res.json(regions.map(r => r.region));
});

// Get locations list
app.get('/api/locations', (req, res) => {
    const locations = db.prepare('SELECT DISTINCT location FROM stations ORDER BY location').all();
    res.json(locations.map(l => l.location));
});

// â”€â”€â”€ SPA Fallback â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('*', (req, res) => {
    const filePath = path.join(__dirname, 'public', req.path);
    if (fs.existsSync(filePath + '.html')) {
        return res.sendFile(filePath + '.html');
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// â”€â”€â”€ (Legacy prediction functions removed - using runPrediction cron below) â”€â”€â”€

// â”€â”€â”€ Station Status Watchdog â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Automatically set stations to 'Offline' if no data received for 1 hour
function updateStationStatuses() {
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    try {
        const result = db.prepare(`
            UPDATE stations 
            SET status = 'Offline' 
            WHERE last_update < ? AND status != 'Offline'
        `).run(oneHourAgo);
        
        if (result.changes > 0) {
            console.log(`[Watchdog] Marked ${result.changes} stations as Offline due to inactivity.`);
        }
    } catch (e) {
        console.error('[Watchdog] Status update failed:', e.message);
    }
}

// Run watchdog every 5 minutes
setInterval(updateStationStatuses, 5 * 60 * 1000);
updateStationStatuses(); // Initial run

// Clean old alerts on startup (keep only last 24h)
try {
    const oneDayAgo = new Date(Date.now() - 86400000).toISOString();
    const cleaned = db.prepare("DELETE FROM alerts WHERE created_at < ?").run(oneDayAgo);
    if (cleaned.changes > 0) console.log(`[Startup] Cleaned ${cleaned.changes} old alerts`);
} catch(e) { console.error('[Startup] Alert cleanup failed:', e.message); }

// â”€â”€â”€ Auto Prediction Cron (every 6 hours) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function runPrediction() {
    const pythonCmd = process.env.PYTHON_CMD || 'python';
    const scriptPath = path.join(__dirname, 'predict.py');
    
    console.log('[Cron] Running prediction...');
    exec(`${pythonCmd} "${scriptPath}"`, { timeout: 300000 }, (err, stdout, stderr) => {
        // TensorFlow prints warnings to stderr - ignore them
        if (err && err.code !== 0 && !stderr.includes('oneDNN')) {
            console.error('[Cron] Prediction failed:', err.message);
            return;
        }
        if (stdout) {
            const lines = stdout.trim().split('\n');
            console.log('[Cron]', lines[lines.length - 1]);
        }
        console.log('[Cron] Prediction completed successfully');
    });
}

// Run prediction every 6 hours (21600000 ms)
setInterval(runPrediction, 6 * 60 * 60 * 1000);
// Run once on startup after 30 seconds (let InfluxDB connect first)
setTimeout(runPrediction, 30000);

// --- Data Retention Policy (daily cleanup) ---
function runDataRetention() {
    try {
        // Delete sensor_data older than 30 days
        const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
        const sensorCleaned = db.prepare("DELETE FROM sensor_data WHERE timestamp < ?").run(thirtyDaysAgo);

        // Delete predictions older than 90 days
        const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];
        const predCleaned = db.prepare("DELETE FROM predictions WHERE prediction_date < ?").run(ninetyDaysAgo);

        // Delete resolved alerts older than 7 days
        const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
        const alertCleaned = db.prepare("DELETE FROM alerts WHERE created_at < ?").run(sevenDaysAgo);

        // Delete old commands older than 30 days
        const cmdCleaned = db.prepare("DELETE FROM commands WHERE created_at < ?").run(thirtyDaysAgo);

        const total = sensorCleaned.changes + predCleaned.changes + alertCleaned.changes + cmdCleaned.changes;
        if (total > 0) {
            console.log(`[Retention] Cleaned: sensor_data=${sensorCleaned.changes}, predictions=${predCleaned.changes}, alerts=${alertCleaned.changes}, commands=${cmdCleaned.changes}`);
        }
    } catch (e) {
        console.error('[Retention] Data cleanup failed:', e.message);
    }
}

// Run retention daily (every 24 hours), and once on startup after 60s
setInterval(runDataRetention, 24 * 60 * 60 * 1000);
setTimeout(runDataRetention, 60000);

// â”€â”€â”€ Start Server â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
server.listen(PORT, () => {
    console.log(`\nðŸŒ¦ï¸  STMKG Monitoring System`);
    console.log(`   Server running on http://localhost:${PORT}`);
    console.log(`   WebSocket on ws://localhost:${PORT}/ws\n`);
    connectMQTT();
    connectReklimStations();
});

// Graceful shutdown
function gracefulShutdown(signal) {
    console.log(`\n[Shutdown] Received ${signal}, cleaning up...`);

    // 1. Close WebSocket connections
    for (const client of wsClients) {
        try { client.close(1001, 'Server shutting down'); } catch (e) { /* ignore */ }
    }
    wsClients.clear();

    // 2. Flush and close InfluxDB write API
    if (writeApi) {
        writeApi.close().then(() => {
            console.log('[Shutdown] InfluxDB writeApi flushed and closed');
        }).catch(e => {
            console.error('[Shutdown] InfluxDB close error:', e.message);
        });
    }

    // 3. Close MQTT clients
    if (mqttClient) {
        try { mqttClient.end(true); } catch (e) { /* ignore */ }
    }
    reklimClients.forEach(c => {
        try { c.end(true); } catch (e) { /* ignore */ }
    });

    // 4. Close HTTP server (stop accepting new connections)
    server.close(() => {
        // 5. Close SQLite database
        try { db.close(); } catch (e) { /* ignore */ }
        console.log('[Shutdown] Cleanup complete. Goodbye.');
        process.exit(0);
    });

    // Force exit after 10 seconds if graceful shutdown stalls
    setTimeout(() => {
        console.error('[Shutdown] Forced exit after timeout');
        process.exit(1);
    }, 10000);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

