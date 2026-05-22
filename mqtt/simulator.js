/**
 * MQTT Simulator - Simulates weather station data
 * Publishes to stmkg/station/data topic every 10 seconds
 * Usage: node mqtt/simulator.js
 */
require('dotenv').config();
const mqtt = require('mqtt');

const BROKER = process.env.MQTT_BROKER || 'mqtt://broker.hivemq.com:1883';
const TOPIC = 'stmkg/station/data';

const stations = [
    { id: 'AWS-BDG-01', name: 'AWS Bandung', elevation: 768, baseTempC: 22 },
    { id: 'ARG-BDC-01', name: 'ARG Bandung Kota', elevation: 768, baseTempC: 23 },
    { id: 'AWS-BGR-02', name: 'AWS Bogor', elevation: 266, baseTempC: 26 },
    { id: 'AAWS-SKP-03', name: 'AAWS Sukapura', elevation: 1100, baseTempC: 20 },
    { id: 'AWS-CRB-04', name: 'AWS Cirebon', elevation: 45, baseTempC: 28 },
    { id: 'ARG-TSM-05', name: 'ARG Tasikmalaya', elevation: 350, baseTempC: 25 },
];

console.log(`[Simulator] Connecting to ${BROKER}...`);

const client = mqtt.connect(BROKER, {
    clientId: `stmkg-simulator-${Date.now()}`,
    username: process.env.MQTT_USER,
    password: process.env.MQTT_PASS,
    clean: true,
});

client.on('connect', () => {
    console.log('[Simulator] Connected! Publishing data every 10 seconds...\n');
    publishData(); // First publish immediately
    setInterval(publishData, 10000);
});

client.on('error', (err) => {
    console.error('[Simulator] Error:', err.message);
});

function publishData() {
    // Pick a random station each cycle
    const station = stations[Math.floor(Math.random() * stations.length)];

    const data = {
        station_id: station.id,
        temperature: round(station.baseTempC + (Math.random() * 6 - 3), 1),
        humidity: round(60 + Math.random() * 35, 1),
        rainfall: round(Math.random() * 20, 1),
        pressure: round(1013 - (station.elevation / 10) + (Math.random() * 4 - 2), 1),
        wind_speed: round(Math.random() * 25, 1),
        wind_direction: Math.round(Math.random() * 360),
        solar_radiation: Math.round(Math.random() * 800),
        battery_voltage: round(11.5 + Math.random() * 2, 1),
        visibility: round(5 + Math.random() * 15, 1),
        dew_point: round(station.baseTempC - 5 + Math.random() * 3, 1),
        cloud_cover: Math.round(Math.random() * 100),
        timestamp: new Date().toISOString(),
    };

    client.publish(TOPIC, JSON.stringify(data), { qos: 1 }, (err) => {
        if (err) {
            console.error('[Simulator] Publish error:', err.message);
        } else {
            console.log(`[${new Date().toLocaleTimeString()}] Published: ${station.name} | Temp: ${data.temperature}°C | Rain: ${data.rainfall}mm | Humidity: ${data.humidity}%`);
        }
    });
}

function round(val, decimals) {
    return Math.round(val * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

process.on('SIGINT', () => {
    console.log('\n[Simulator] Shutting down...');
    client.end();
    process.exit(0);
});
