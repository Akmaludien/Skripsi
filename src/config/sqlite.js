const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '..', '..', 'data', 'monitoring.db');
const dataDir = path.dirname(dbPath);

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbExists = fs.existsSync(dbPath);
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

if (!dbExists) {
    const schemaPath = path.join(__dirname, '..', '..', 'database', 'schema.sql');
    if (fs.existsSync(schemaPath)) {
        const schema = fs.readFileSync(schemaPath, 'utf-8');
        db.exec(schema);
        console.log('[OK] Database schema initialized');
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

// Ensure stations metadata (elevation, coords, etc.) are always synchronized
try {
    const stationsData = require('./stationsData');
    const extractRegion = (loc) => loc.replace('Kab. ', '').replace('Kota ', '');
    const getModel = (type) => {
        switch (type) {
            case 'AWS': return 'Vaisala WXT536';
            case 'ARG': return 'OTT Pluvio2';
            case 'AAWS': return 'Davis Pro2';
            default: return '';
        }
    };

    const insertOrUpdateStation = db.prepare(`
        INSERT INTO stations (id, name, type, location, region, elevation, latitude, longitude, model, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            type = excluded.type,
            location = excluded.location,
            region = excluded.region,
            elevation = excluded.elevation,
            latitude = excluded.latitude,
            longitude = excluded.longitude,
            model = excluded.model
    `);

    const syncStations = db.transaction((list) => {
        for (const s of list) {
            insertOrUpdateStation.run(
                s.id, s.name, s.type, s.location,
                extractRegion(s.location),
                s.elevation, s.lat, s.lng,
                getModel(s.type),
                s.status || 'Active / Normal'
            );
        }
    });

    syncStations(stationsData);
    console.log(`[DB] Synchronized ${stationsData.length} stations metadata & elevations.`);
} catch (e) {
    console.error('[DB] Station sync error:', e);
}

module.exports = db;
