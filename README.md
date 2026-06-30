# Sistem Monitoring & Prediksi Curah Hujan Jawa Barat

Sebuah platform pemantauan cuaca IoT secara *real-time* terintegrasi dengan mesin prediksi *Deep Learning* (Bi-LSTM) untuk jaringan stasiun observasi BMKG (AWS, ARG, AAWS) di wilayah Jawa Barat. Proyek ini dikembangkan khusus untuk tugas akhir / Skripsi di Sekolah Tinggi Meteorologi Klimatologi dan Geofisika (STMKG).

---

## 🌟 Fitur Utama

1. **Real-time IoT Telemetry**: Menerima dan memproses data sensor secara langsung melalui protokol MQTT v5 dari server BMKG.
2. **Time-Series Database**: Mengelola puluhan ribu baris data historis secara efisien menggunakan **InfluxDB**.
3. **Deep Learning Prediction (Bi-LSTM)**: Mesin prediksi kecerdasan buatan berbasis Python (TensorFlow/Keras) yang mampu meramalkan intensitas curah hujan hingga 7 hari ke depan. Dilengkapi dengan **Adaptive Seasonal Filter** untuk menekan *over-prediction* di musim kemarau.
4. **Interactive Dashboard**: Antarmuka responsif dengan peta interaktif (Leaflet.js) untuk melacak status operasional stasiun, tegangan baterai, dan parameter meteorologi.
5. **Evaluasi & Verifikasi Model**: Menampilkan performa metrik model yang aktual secara *real-time* sesuai Bab IV Skripsi (RMSE, MAE, R², POD, FAR, CSI).
6. **Export & Reporting**: Fitur unduh laporan dalam format CSV dan cetak PDF langsung dari sistem.
7. **Docker & Coolify Ready**: Dirancang penuh menggunakan pendekatan *containerized* (Docker) sehingga sangat mudah di-*deploy* ke VPS melalui Coolify.

## 🛠️ Tech Stack

| Komponen | Teknologi |
|----------|-----------|
| **Backend** | Node.js, Express.js (Modular MVC Architecture) |
| **Database** | InfluxDB (Time-series), SQLite (Metadata Stasiun & Prediksi) |
| **Frontend** | Vanilla JS, HTML5, CSS3, Chart.js, Leaflet.js |
| **Machine Learning**| Python 3.11, TensorFlow 2.20.0, Keras, Pandas, NumPy |
| **IoT / Real-time** | MQTT v5, WebSocket |
| **Deployment** | Docker, Coolify (Ubuntu VPS) |

## 🚀 Deployment (via Coolify)

Aplikasi ini didesain agar sangat mudah dijalankan di atas peladen VPS menggunakan Coolify.

### 1. Persiapan Environment Variables
Pastikan Anda mendaftarkan variabel lingkungan rahasia berikut di panel **Environment Variables** Coolify Anda (JANGAN sertakan `.env` di dalam GitHub!):

```ini
INFLUX_URL=http://<IP-INFLUXDB>:8086
INFLUX_TOKEN=token_rahasia_anda_di_sini
INFLUX_ORG=SKRIPSI
INFLUX_BUCKET=Monitoring
PORT=3001
NODE_ENV=production
```

### 2. Proses Build
Coolify akan secara otomatis membaca `Dockerfile` yang ada di *root repository* ini, yang mencakup arsitektur *multi-stage*:
- Menginstal **Node.js 22** dan dependensi paket NPM.
- Menginstal **Python 3.11**.
- Menjalankan `pip install` untuk *library* pendukung termasuk TensorFlow 2.20.0.
- Menjalankan `src/server.js` pada *port* 3001.

*Catatan: Proses redeploy mungkin memakan waktu 5-15 menit tergantung kecepatan VPS dalam mengunduh base image dan package Python.*

## 📂 Struktur Direktori Penting

```text
├── src/                   # Backend Node.js Terstruktur
│   ├── config/            # Konfigurasi Database & Environment
│   ├── controllers/       # Logika Bisnis Endpoint API
│   ├── routes/            # Definisi Endpoint API (Express Router)
│   ├── services/          # Logika Background (MQTT, WebSocket, Python Runner, Scheduler)
│   ├── utils/             # Helper fungsi dan Constants metrik model
│   └── server.js          # Entry point utama aplikasi
├── python_scripts/
│   └── predict.py         # Script ML Prediction (Bi-LSTM + Adaptive Seasonal Filter)
├── Dockerfile             # Konfigurasi containerized apps
├── database/
│   └── seed.js            # Inisialisasi metadata dan daftar stasiun ke SQLite
├── models/                # Model AI & Scaler (Terbagi dalam AWS, AAWS, ARG)
├── public/
│   ├── verifikasi.html    # Dashboard Evaluasi Model (Menampilkan RMSE, MAE, R², dsb)
│   ├── prediksi.html      # Peta dan Tabel Prediksi Curah Hujan 7 Hari
│   └── detail.html        # Detail Spesifik Stasiun & Grafik Historis
└── requirements.txt       # Daftar pustaka Python (Versi library fix)
```

## 🤝 Author

**Akmaludien Ramadhan**  
Sekolah Tinggi Meteorologi Klimatologi dan Geofisika (STMKG)  
*For academic and research purposes only.*
