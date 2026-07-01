-- Stations Master Table
CREATE TABLE IF NOT EXISTS stations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('AWS', 'ARG', 'AAWS')),
    location TEXT NOT NULL,
    region TEXT NOT NULL,
    elevation REAL DEFAULT 0,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    status TEXT DEFAULT 'Active / Normal',
    model TEXT DEFAULT '',
    sn TEXT DEFAULT '',
    last_update DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Sensor Data Time-Series Table
-- Column names match the real AWS/ARG database structure:
--   AWS 7 main params: ws, wd, temp, rh, press, rr, sr
--   AWS additional:    ws_max, temp_max, temp_min, sr_max, log_temp, batt
--   ARG params:        rr, log_temp, batt
CREATE TABLE IF NOT EXISTS sensor_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    station_id TEXT NOT NULL,
    timestamp DATETIME NOT NULL,
    -- 7 Main AWS Parameters
    ws REAL DEFAULT NULL,           -- wind speed (m/s)
    wd REAL DEFAULT NULL,           -- wind direction (°)
    temp REAL DEFAULT NULL,         -- temperature (°C)
    rh REAL DEFAULT NULL,           -- relative humidity (%)
    press REAL DEFAULT NULL,        -- pressure (hPa)
    rr REAL DEFAULT NULL,           -- rainfall (mm)
    sr REAL DEFAULT NULL,           -- solar radiation (W/m²)
    -- Additional AWS Parameters
    ws_max REAL DEFAULT NULL,       -- max wind speed (m/s)
    temp_max REAL DEFAULT NULL,     -- max temperature (°C)
    temp_min REAL DEFAULT NULL,     -- min temperature (°C)
    sr_max REAL DEFAULT NULL,       -- max solar radiation (W/m²)
    -- AAWS Specific Parameters
    par REAL DEFAULT NULL,          -- Photosynthetically Active Radiation
    ws_2m REAL DEFAULT NULL,        -- Wind speed at 2m
    ws2m_max REAL DEFAULT NULL,     -- Max wind speed at 2m
    lith REAL DEFAULT NULL,         -- Leaf wetness/illumination
    -- Common Parameters (AWS + ARG)
    log_temp REAL DEFAULT NULL,     -- logger temperature (°C)
    batt REAL DEFAULT NULL,         -- battery voltage (V)
    source TEXT DEFAULT 'mqtt',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (station_id) REFERENCES stations(id)
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_sensor_data_station ON sensor_data(station_id);
CREATE INDEX IF NOT EXISTS idx_sensor_data_timestamp ON sensor_data(timestamp);
CREATE INDEX IF NOT EXISTS idx_sensor_data_station_time ON sensor_data(station_id, timestamp);

-- Rainfall Predictions Table
CREATE TABLE IF NOT EXISTS predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    station_id TEXT NOT NULL,
    prediction_date DATE NOT NULL,
    predicted_rainfall REAL DEFAULT 0,
    category TEXT DEFAULT 'TIDAK HUJAN' CHECK(category IN ('TIDAK HUJAN', 'RINGAN', 'SEDANG', 'LEBAT', 'SANGAT LEBAT')),
    confidence REAL DEFAULT 0,
    model_version TEXT DEFAULT 'v1.0',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (station_id) REFERENCES stations(id)
);

-- Alerts Table
CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    station_id TEXT,
    alert_type TEXT NOT NULL,
    severity TEXT DEFAULT 'INFO' CHECK(severity IN ('INFO', 'WASPADA', 'SIAGA', 'AWAS')),
    message TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME,
    FOREIGN KEY (station_id) REFERENCES stations(id)
);

-- Commands Table (for bi-directional communication)
CREATE TABLE IF NOT EXISTS commands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    station_id TEXT NOT NULL,
    command_type TEXT NOT NULL,
    payload TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'sent', 'acknowledged', 'failed')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    sent_at DATETIME,
    ack_at DATETIME,
    FOREIGN KEY (station_id) REFERENCES stations(id)
);

-- Model Performance Table
CREATE TABLE IF NOT EXISTS model_performance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rmse REAL DEFAULT 0,
    baseline_rmse REAL DEFAULT 0,
    mae REAL DEFAULT 0,
    r_squared REAL DEFAULT 0,
    accuracy REAL DEFAULT 0,
    pod REAL DEFAULT 0,
    far REAL DEFAULT 0,
    csi REAL DEFAULT 0,
    training_date DATE NOT NULL,
    model_version TEXT DEFAULT 'v1.0',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
