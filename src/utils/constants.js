const MQTT_TOPICS = [
    'stmkg/station/data',                                                    
    'device/+/data/+/+/MQTT_Table/#',                                        
    'device/+/data/+/#',                                                     
    'device/jabar/arg/#',                                                    
    'device/jabar/+/+/+/MQTT_Table/#',                                       
    'device/o9w9x3kh6519nvm/data/STA9010/#',                                 
    'device/l603wa6u1tjo4d2/data/30017/#',                                   
    'device/lm6ma60bs873fd8/data/cr1000x/35717/MQTT_Table/cj/#',             
];

const MQTT_TOPIC_CMD = 'stmkg/station/command';

const REKLIM_DEFAULTS = [
    { id: 'AAWS3010', topic: 'device/50e81az718842ds', user: 'wxki2', pass: '7ep1l' },
    { id: 'STA3008',  topic: 'device/jz0o33ob874q9q4', user: 'vcjpa', pass: '65tm2' },
    { id: 'STA3005',  topic: 'device/ha0v1kd4pt92jwf', user: 'k38fg', pass: 'efxvf' },
    { id: 'STA3009',  topic: 'device/ur884m1lh6wn908', user: '11r7o', pass: '49vs4' },
    { id: 'STA3006',  topic: 'device/waayijbhjl6e7lp', user: 'ls9xi', pass: 'dzvf5' },
    { id: 'AAWS0354', topic: 'device/6d21w334lpk38cs', user: 'h0wzh', pass: 'iv0ej' },
    { id: 'STA3004',  topic: 'device/s5bq2hv47nmpi1a', user: 'qp6lc', pass: 'motoi' },
    { id: 'AAWS0348', topic: 'device/tv9s62p8iqwsf2t', user: 'azq54', pass: 'y62jy' }
];

const RAINFALL_CATEGORIES = {
    TIDAK_HUJAN: 'TIDAK HUJAN',
    RINGAN: 'RINGAN',
    SEDANG: 'SEDANG',
    LEBAT: 'LEBAT',
    SANGAT_LEBAT: 'SANGAT LEBAT'
};

const getRainfallCategory = (rainfall) => {
    if (rainfall < 0.5) return RAINFALL_CATEGORIES.TIDAK_HUJAN;
    if (rainfall <= 20) return RAINFALL_CATEGORIES.RINGAN;
    if (rainfall <= 50) return RAINFALL_CATEGORIES.SEDANG;
    if (rainfall <= 100) return RAINFALL_CATEGORIES.LEBAT;
    return RAINFALL_CATEGORIES.SANGAT_LEBAT;
};

// Model Metrics for Bab IV Requirements
const MODEL_METRICS = {
    "AWS": {
        "rmse": 21.46,
        "mae": 15.03,
        "r2": 0.039,
        "pod": 0.999,
        "far": 0.312,
        "csi": 0.687
    },
    "AAWS": {
        "rmse": 13.34,
        "mae": 6.99,
        "r2": -0.073,
        "pod": 0.886,
        "far": 0.516,
        "csi": 0.456
    },
    "ARG": {
        "rmse": 29.57,
        "mae": 18.71,
        "r2": -0.253,
        "pod": 0.599,
        "far": 0.253,
        "csi": 0.498
    }
};

module.exports = {
    MQTT_TOPICS,
    MQTT_TOPIC_CMD,
    REKLIM_DEFAULTS,
    RAINFALL_CATEGORIES,
    getRainfallCategory,
    MODEL_METRICS
};
