const http = require('http');
const app = require('./app');
const config = require('./config/env');
const db = require('./config/sqlite');
const { writeApi } = require('./config/influx');
const { connectMQTT, connectReklimStations } = require('./services/mqttService');
const { initWebSocketServer } = require('./services/websocketService');
const { initSchedulers } = require('./services/schedulerService');

const server = http.createServer(app);

// Initialize WebSocket
initWebSocketServer(server);

server.listen(config.port, () => {
    console.log(`\n☁️  STMKG Monitoring System`);
    console.log(`   Server running on http://localhost:${config.port}`);
    console.log(`   WebSocket on ws://localhost:${config.port}/ws\n`);
    
    connectMQTT();
    connectReklimStations();
    initSchedulers();
});

// Graceful shutdown
function gracefulShutdown(signal) {
    console.log(`\n[Shutdown] Received ${signal}, cleaning up...`);

    if (writeApi) {
        writeApi.close().then(() => {
            console.log('[Shutdown] InfluxDB writeApi flushed and closed');
        }).catch(e => {
            console.error('[Shutdown] InfluxDB close error:', e.message);
        });
    }

    server.close(() => {
        try { db.close(); } catch (e) { /* ignore */ }
        console.log('[Shutdown] Cleanup complete. Goodbye.');
        process.exit(0);
    });

    setTimeout(() => {
        console.error('[Shutdown] Forced exit after timeout');
        process.exit(1);
    }, 10000);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
