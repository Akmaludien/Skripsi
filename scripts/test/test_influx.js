require('dotenv').config();
const { InfluxDB } = require('@influxdata/influxdb-client');

const url = process.env.INFLUX_URL || 'http://localhost:8086';
const token = process.env.INFLUX_TOKEN;
const org = process.env.INFLUX_ORG || 'SKRIPSI';
const bucket = process.env.INFLUX_BUCKET || 'skripsi';

if (!token) {
    console.log('No token');
    process.exit(1);
}

const queryApi = new InfluxDB({ url, token }).getQueryApi(org);

const query = `
    from(bucket: "${bucket}")
      |> range(start: -30d)
      |> filter(fn: (r) => (r["_measurement"] == "AWS" or r["_measurement"] == "ARG" or r["_measurement"] == "AAWS") and (r["_field"] == "rain" or r["_field"] == "ws" or r["_field"] == "ws_max"))
      |> max()
      |> group(columns: ["_measurement", "station"])
`;

queryApi.collectRows(query)
    .then(data => {
        console.log(JSON.stringify(data, null, 2));
    })
    .catch(err => {
        console.error(err);
    });
