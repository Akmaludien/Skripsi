const Database = require('better-sqlite3');
const db = new Database('data/monitoring.db');

const stations = db.prepare('SELECT id FROM stations').all();

const insert = db.prepare(`
    INSERT OR REPLACE INTO predictions (station_id, prediction_date, predicted_rainfall, category, confidence, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
`);

const getCategory = (rf) => {
    if (rf < 0.5) return 'TIDAK HUJAN';
    if (rf <= 20) return 'RINGAN';
    if (rf <= 50) return 'SEDANG';
    if (rf <= 100) return 'LEBAT';
    return 'SANGAT LEBAT';
};

const today = new Date();
db.transaction(() => {
    for (const station of stations) {
        let baseRain = Math.random() * 30; // Random base rainfall
        for (let i = 0; i < 7; i++) {
            const date = new Date(today.getTime() + i * 86400000);
            const dateStr = date.toISOString().split('T')[0];
            
            // Add some decay and randomness
            let rf = baseRain * Math.pow(0.8, i) + (Math.random() * 10 - 2);
            rf = Math.max(0, Math.round(rf * 10) / 10);
            
            const cat = getCategory(rf);
            const conf = Math.max(50, Math.min(95, 85 - (i * 5) + (Math.random() * 5)));
            
            insert.run(station.id, dateStr, rf, cat, Math.round(conf * 10) / 10, new Date().toISOString());
        }
    }
})();

console.log("Dummy predictions seeded successfully for today and next 6 days!");
