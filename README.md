# 🌧️ Sistem Monitoring dan Prediksi Curah Hujan - STMKG Jawa Barat

Integrated Climatology Monitoring System untuk pemantauan real-time dan prediksi curah hujan berbasis jaringan stasiun AWS, ARG, dan AAWS di Provinsi Jawa Barat.

## 📋 Fitur Utama

- **Real-time Monitoring** — Data sensor dari 50 stasiun via MQTT (protokol IoT)
- **Prediksi 7 Hari** — Model Bi-LSTM Deep Learning untuk prediksi curah hujan
- **Dashboard Interaktif** — Peta Leaflet dengan heatmap intensitas hujan
- **Early Warning System** — Peringatan otomatis saat curah hujan melebihi ambang batas
- **Verifikasi Model** — Perbandingan prediksi vs observasi riil dengan metrik RMSE, MAE, R²
- **WebSocket Real-time** — Update data tanpa refresh halaman
- **Export Data** — Download data historis dalam format CSV

## 🏗️ Arsitektur Sistem

```
┌─────────────────────────────────────────────────────────────────┐
│                        SUMBER DATA                               │
├─────────────────────────────────────────────────────────────────┤
│  AWS (11 stasiun)  │  ARG (30 stasiun)  │  AAWS (9 stasiun)   │
│  Vaisala WXT536    │  OTT Pluvio2       │  Davis Pro2          │
└────────┬───────────┴────────┬───────────┴────────┬─────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                    MQTT Broker (BMKG)                            │
│                  202.90.198.159:1883                             │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SERVER (Node.js)                            │
├─────────────────────────────────────────────────────────────────┤
│  Express API  │  MQTT Client  │  WebSocket  │  Prediction Engine│
└───────┬───────┴───────┬───────┴──────┬──────┴────────┬──────────┘
        │               │              │               │
        ▼               ▼              ▼               ▼
┌──────────────┐ ┌────────────┐ ┌───────────┐ ┌──────────────────┐
│   SQLite     │ │  InfluxDB  │ │  Browser  │ │  Python (LSTM)   │
│  (metadata)  │ │(time-series│ │  (client) │ │  predict.py      │
└──────────────┘ └────────────┘ └───────────┘ └──────────────────┘
```

## 🛠️ Tech Stack

| Komponen | Teknologi |
|----------|-----------|
| Backend | Node.js, Express |
| Database | InfluxDB (time-series), SQLite (metadata) |
| Frontend | HTML5, CSS3, JavaScript (Vanilla) |
| Maps | Leaflet.js + OpenStreetMap |
| Charts | Chart.js |
| IoT Protocol | MQTT v5 |
| Real-time | WebSocket |
| ML Model | Python, TensorFlow/Keras (Bi-LSTM) |
| Data Science | NumPy, Pandas, Scikit-learn |

## ⚡ Quick Start

### Prerequisites

- Node.js v18+
- Python 3.11+ (untuk prediksi)
- InfluxDB v2.x
- Koneksi internet (untuk MQTT BMKG)

### Installation

```bash
# 1. Clone repository
git clone <repo-url>
cd stmkg-monitoring

# 2. Install Node.js dependencies
npm install

# 3. Install Python dependencies
pip install -r requirements.txt

# 4. Setup environment
# Edit .env dengan konfigurasi InfluxDB Anda

# 5. Seed database (pertama kali)
npm run seed

# 6. Jalankan semua service
.\start_all.bat
# Atau manual:
# Terminal 1: influxd
# Terminal 2: npm start
```

### Akses

- **Website**: http://localhost:3001
- **InfluxDB UI**: http://localhost:8086

## 📁 Struktur Project

```
├── server.js              # Main server (Express + MQTT + WebSocket)
├── predict.py             # Prediksi curah hujan (Bi-LSTM / Fallback)
├── package.json           # Node.js dependencies
├── requirements.txt       # Python dependencies
├── .env                   # Konfigurasi environment
├── start_all.bat          # Script untuk jalankan semua service
│
├── database/
│   ├── schema.sql         # Database schema
│   └── seed.js            # Seed data awal
│
├── data/
│   └── monitoring.db      # SQLite database
│
├── models/
│   └── aws/
│       ├── model_aws_cibeureum_FINAL.h5   # Trained Bi-LSTM model
│       └── scaler_aws_cibeureum.gz        # Feature scaler
│
├── mqtt/
│   └── simulator.js       # MQTT data simulator (testing)
│
├── public/                # Frontend files
│   ├── index.html         # Dashboard
│   ├── stasiun.html       # Daftar Stasiun
│   ├── detail.html        # Detail Stasiun
│   ├── prediksi.html      # Prediksi Curah Hujan
│   ├── verifikasi.html    # Verifikasi Model
│   ├── css/style.css      # Stylesheet
│   ├── js/
│   │   ├── app.js         # Shared utilities
│   │   ├── dashboard.js   # Dashboard logic
│   │   ├── detail.js      # Detail page logic
│   │   ├── prediksi.js    # Prediction page logic
│   │   ├── stasiun.js     # Station list logic
│   │   └── verifikasi.js  # Verification page logic
│   └── img/
│       └── stmkg-logo.png
│
└── training_data/
    ├── access_data_STA2064_FEB 2020.xlsx  # Data training asli
    └── train_final.py                      # Script training model
```

## 🌐 API Endpoints

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | `/api/stations` | Semua stasiun + data terkini |
| GET | `/api/stations/:id` | Detail satu stasiun |
| GET | `/api/stations/:id/history?hours=24` | Data historis |
| GET | `/api/stations/:id/export?hours=24` | Export CSV |
| GET | `/api/predictions?day=0` | Prediksi curah hujan |
| GET | `/api/dashboard/summary` | Ringkasan dashboard |
| GET | `/api/alerts` | Daftar peringatan aktif |
| GET | `/api/model-performance` | Metrik performa model |
| GET | `/api/verification` | Data verifikasi prediksi |
| WS | `/ws` | WebSocket real-time updates |

## 🧠 Model Prediksi

- **Arsitektur**: Bidirectional LSTM (Bi-LSTM)
- **Input**: 60 hari data historis (temp, rh, press, ws, wd, sr, rain)
- **Output**: Prediksi curah hujan 7 hari ke depan
- **Fallback**: Statistical Naive Method (jika TensorFlow tidak tersedia)

## 👤 Author

Akmaludien Ramadhan — Sekolah Tinggi Meteorologi Klimatologi dan Geofisika (STMKG)

## 📄 License

For academic purposes only.
#   S k r i p s i  
 