const cleanEnvVar = (val) => val ? val.trim().replace(/^['"]|['"]$/g, '') : undefined;

const sanitizeStationId = (stationId) => {
    return String(stationId).replace(/[^a-zA-Z0-9_-]/g, '');
};

module.exports = {
    cleanEnvVar,
    sanitizeStationId
};
