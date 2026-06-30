const { InfluxDB } = require('@influxdata/influxdb-client');
const config = require('./env');

const influxClient = config.influx.token 
    ? new InfluxDB({ url: config.influx.url, token: config.influx.token, timeout: config.influx.timeout }) 
    : null;

const writeApi = influxClient ? influxClient.getWriteApi(config.influx.org, config.influx.bucket, 'ns') : null;
const queryApi = influxClient ? influxClient.getQueryApi(config.influx.org) : null;

if (writeApi) {
    console.log(`[InfluxDB] Configured for ${config.influx.url} -> Bucket: ${config.influx.bucket}`);
} else {
    console.log(`[InfluxDB] Missing TOKEN in .env, InfluxDB sync disabled.`);
}

module.exports = {
    influxClient,
    writeApi,
    queryApi
};
