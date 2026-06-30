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

// Check if stations table is empty (seed if necessary)
const stationCount = db.prepare('SELECT COUNT(*) as cnt FROM stations').get();
if (stationCount && stationCount.cnt === 0) {
    console.log('[DB] No stations found. Run seed.js to populate.');
}

module.exports = db;
