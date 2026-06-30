const { WebSocketServer } = require('ws');

let wss;
const wsClients = new Set();

function initWebSocketServer(server) {
    wss = new WebSocketServer({ server, path: '/ws' });

    wss.on('connection', (ws) => {
        wsClients.add(ws);
        console.log(`[WS] Client connected (${wsClients.size} total)`);
        ws.on('close', () => {
            wsClients.delete(ws);
            console.log(`[WS] Client disconnected (${wsClients.size} total)`);
        });
    });
}

function broadcast(type, data) {
    if (!wss) return;
    const message = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
    for (const client of wsClients) {
        if (client.readyState === 1) { // WebSocket.OPEN
            client.send(message);
        }
    }
}

module.exports = {
    initWebSocketServer,
    broadcast
};
