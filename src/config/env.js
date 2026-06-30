require('dotenv').config();

const config = {
    port: process.env.PORT || 3001,
    mqttBroker: process.env.MQTT_BROKER || 'mqtt://202.90.198.159:1883',
    mqttUser: process.env.MQTT_USER || 'bmkg_aws',
    mqttPass: process.env.MQTT_PASS || 'bmkg_aws123',
    apiKey: process.env.API_KEY || '',
    
    influx: {
        url: process.env.INFLUX_URL || 'http://influxdb:8086',
        token: process.env.INFLUX_TOKEN,
        org: process.env.INFLUX_ORG || 'SKRIPSI',
        bucket: process.env.INFLUX_BUCKET || 'skripsi',
        timeout: parseInt(process.env.INFLUX_TIMEOUT) || 60000
    }
};

module.exports = config;
