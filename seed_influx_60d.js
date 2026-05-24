/**
 * Seed 60 days of realistic weather data for 50 stations into InfluxDB.
 * Writes one station at a time to avoid timeout.
 */
require('dotenv').config();
const { InfluxDB, Point } = require('@influxdata/influxdb-client');
const Database = require('better-sqlite3');
const path = require('path');

const INFLUX_URL = process.env.INFLUX_URL || 'http://localhost:8086';
const INFLUX_TOKEN = process.env.INFLUX_TOKEN;
const INFLUX_ORG = process.env.INFLUX_ORG || 'SKRIPSI';
const INFLUX_BUCKET = process.env.INFLUX_BUCKET || 'skripsi';

if (!INFLUX_TOKEN) { console.error('ERROR: INFLUX_TOKEN not set'); process.exit(1); }

const influx = new InfluxDB({ url: INFLUX_URL, token: INFLUX_TOKEN, timeout: 60000 });
const db = new Database(path.join(__dirname, 'data', 'monitoring.db'));
const stations = db.prepare('SELECT id, name, type, elevation FROM stations').all();
db.close();

const DAYS = 60;
const INTERVAL_MIN = 30;
const POINTS_PER_DAY = (24 * 60) / INTERVAL_MIN;
const now = Date.now();
const startTime = now - (DAYS * 24 * 60 * 60 * 1000);

console.log(`Seeding ${DAYS} days x ${stations.length} stations (${POINTS_PER_DAY} pts/day each)`);
console.log(`Total: ~${(stations.length * DAYS * POINTS_PER_DAY).toLocaleString()} points\n`);

function baseTemp(elev) { return 28 - (elev / 1000) * 6.5; }
function diurnalTemp(hour, base) {
    const amp = 4 + Math.random() * 2;
    return base + amp * Math.sin(((hour - 5 + 24) % 24) / 24 * Math.PI * 2 - Math.PI / 2);
}
function rainProb(hour) {
    if (hour >= 14 && hour <= 18) return 0.25;
    if (hour >= 12 && hour <= 20) return 0.12;
    if (hour >= 2 && hour <= 5) return 0.08;
    return 0.03;
}
function rainAmt() {
    const r = Math.random();
    if (r > 0.95) return 5 + Math.random() * 15;
    if (r > 0.8) return 2 + Math.random() * 5;
    return 0.2 + Math.random() * 2;
}
function solar(hour, raining) {
    if (hour < 6 || hour > 18) return 0;
    const angle = Math.sin(((hour - 6) / 12) * Math.PI);
    return Math.max(0, 900 * angle * (raining ? 0.15 : 0.5 + Math.random() * 0.5));
}

async function seedStation(station, index) {
    const writeApi = influx.getWriteApi(INFLUX_ORG, INFLUX_BUCKET, 'ms', {
        batchSize: 2000, flushInterval: 0, maxRetries: 3,
    });

    const elev = station.elevation || Math.random() * 300;
    const bTemp = baseTemp(elev);
    const basePressure = 1013.25 * Math.pow(1 - (elev * 0.0000225577), 5.25588);
    const rainBias = 0.8 + Math.random() * 0.6;
    let accRain = 0, curDay = -1;

    for (let i = 0; i < DAYS * POINTS_PER_DAY; i++) {
        const ts = new Date(startTime + i * INTERVAL_MIN * 60000);
        const h = (ts.getUTCHours() + 7) % 24;
        const day = Math.floor(i / POINTS_PER_DAY);
        if (day !== curDay) { accRain = 0; curDay = day; }

        const raining = Math.random() < rainProb(h) * rainBias;
        if (raining) accRain += rainAmt();

        const temp = diurnalTemp(h, bTemp) + (Math.random() - 0.5) * 1.5;
        let rh = 85 - (temp - bTemp) * 3 + (Math.random() - 0.5) * 8;
        if (raining) rh += 10;
        rh = Math.max(40, Math.min(100, rh));
        const press = basePressure + Math.sin(h / 24 * Math.PI * 2) * 1.5 + (Math.random() - 0.5);
        const ws = (1 + Math.random() * 4) * (h >= 10 && h <= 16 ? 1.5 : 1);
        const wd = Math.random() * 360;
        const sr = solar(h, raining);
        const batt = 12.2 + (sr > 0 ? 0.8 : 0) + (Math.random() - 0.5) * 0.3;
        const logTemp = temp + 2 + Math.random() * 3;

        const pt = new Point(station.type)
            .tag('id', station.id).tag('site', station.name)
            .floatField('rain', Math.round(accRain * 10) / 10)
            .floatField('log_temp', Math.round(logTemp * 100) / 100)
            .floatField('battery', Math.round(batt * 100) / 100)
            .timestamp(ts);

        if (station.type !== 'ARG') {
            pt.floatField('temp', Math.round(temp * 100) / 100);
            pt.floatField('rh', Math.round(rh * 100) / 100);
            pt.floatField('press', Math.round(press * 100) / 100);
            pt.floatField('ws', Math.round(ws * 1000) / 1000);
            pt.floatField('wd', Math.round(wd * 10) / 10);
            pt.floatField('sr', Math.round(sr * 100) / 100);
        }
        writeApi.writePoint(pt);
    }

    await writeApi.close();
    console.log(`  [${index + 1}/${stations.length}] done ${station.id} (${station.name})`);
}

async function run() {
    for (let i = 0; i < stations.length; i++) {
        await seedStation(stations[i], i);
    }
    console.log(`\n✅ Done! ${(stations.length * DAYS * POINTS_PER_DAY).toLocaleString()} points seeded.`);
    process.exit(0);
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
