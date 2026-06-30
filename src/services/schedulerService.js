const db = require('../config/sqlite');
const { runPrediction } = require('./pythonRunner');

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

function runDataRetention() {
    try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
        const sensorCleaned = db.prepare("DELETE FROM sensor_data WHERE timestamp < ?").run(thirtyDaysAgo);

        const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];
        const predCleaned = db.prepare("DELETE FROM predictions WHERE prediction_date < ?").run(ninetyDaysAgo);

        const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
        const alertCleaned = db.prepare("DELETE FROM alerts WHERE created_at < ?").run(sevenDaysAgo);

        const cmdCleaned = db.prepare("DELETE FROM commands WHERE created_at < ?").run(thirtyDaysAgo);

        const total = sensorCleaned.changes + predCleaned.changes + alertCleaned.changes + cmdCleaned.changes;
        if (total > 0) {
            console.log(`[Retention] Cleaned: sensor_data=${sensorCleaned.changes}, predictions=${predCleaned.changes}, alerts=${alertCleaned.changes}, commands=${cmdCleaned.changes}`);
        }
    } catch (e) {
        console.error('[Retention] Data cleanup failed:', e.message);
    }
}

function initSchedulers() {
    // Watchdog every 5 mins
    setInterval(updateStationStatuses, 5 * 60 * 1000);
    updateStationStatuses();

    // Clean old alerts on startup (keep only last 24h)
    try {
        const oneDayAgo = new Date(Date.now() - 86400000).toISOString();
        const cleaned = db.prepare("DELETE FROM alerts WHERE created_at < ?").run(oneDayAgo);
        if (cleaned.changes > 0) console.log(`[Startup] Cleaned ${cleaned.changes} old alerts`);
    } catch(e) { console.error('[Startup] Alert cleanup failed:', e.message); }

    // Retention daily
    setInterval(runDataRetention, 24 * 60 * 60 * 1000);
    setTimeout(runDataRetention, 60000);

    // Prediction cron (6 hours)
    setInterval(runPrediction, 6 * 60 * 60 * 1000);
    setTimeout(runPrediction, 30000); // 30s delay on startup
}

module.exports = {
    initSchedulers,
    updateStationStatuses,
    runDataRetention
};
