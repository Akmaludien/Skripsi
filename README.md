# Sistem Monitoring dan Prediksi Curah Hujan Jawa Barat

Platform pemantauan cuaca IoT terintegrasi dan prediksi curah hujan berbasis *Deep Learning* (Bidirectional LSTM) untuk 50 jaringan stasiun observasi BMKG (AWS, ARG, dan AAWS) di wilayah Jawa Barat. Sistem ini dikembangkan sebagai bagian dari tugas akhir / skripsi di Sekolah Tinggi Meteorologi Klimatologi dan Geofisika (STMKG).

---

## Gambaran Sistem

Sistem ini mengintegrasikan akuisisi data cuaca *real-time* melalui protokol IoT MQTT, penyimpanan data *time-series*, pipeline pemrosesan data, serta inferensi model *machine learning* untuk menghasilkan prediksi curah hujan harian hingga 7 hari ke depan pada setiap stasiun.

### Fitur Utama

1. **Telemetri IoT Real-time**: Mengonsumsi dan memproses data sensor meteorologi secara kontinu dari stasiun observasi BMKG menggunakan protokol MQTT v5.
2. **Penyimpanan Time-Series & Relasional**:
   - **InfluxDB**: Menyimpan data parameter observasi berkecepatan tinggi (*time-series*) untuk analisis historis dan visualisasi grafik.
   - **SQLite**: Menyimpan metadata 50 stasiun (koordinat, elevasi SRTM, status), data prediksi harian, dan metrik verifikasi.
3. **Prediksi Curah Hujan Multi-Stasiun (Bi-LSTM)**:
   - Menggunakan arsitektur Bidirectional LSTM dengan penyesuaian fitur dinamis (*AWS*: 17 fitur, *AAWS*: 10 fitur, *ARG*: 1 fitur).
   - Dilengkapi *Adaptive Seasonal Filter* untuk mengoptimalkan akurasi prediksi pada pola musiman (musim hujan dan kemarau).
   - Menghasilkan proyeksi curah hujan harian (skala mm dan klasifikasi intensitas hujan) hingga 7 hari ke depan.
4. **Visualisasi Spasial & Analisis**:
   - Peta sebaran spasial interaktif menggunakan Leaflet.js dengan interpolasi Poligon Thiessen.
   - Pemantauan status operasional stasiun (*online/offline*), kesehatan logger, dan tegangan baterai/panel surya.
   - Grafik interaktif parameter cuaca (suhu, kelembapan, tekanan udara, arah/kecepatan angin, radiasi matahari).
5. **Verifikasi & Evaluasi Model**:
   - Menampilkan metrik performa model aktual (RMSE, MAE, R², POD, FAR, CSI, ACC, ETS) per stasiun maupun agregat wilayah.
6. **Ekspor Data & Laporan**:
   - Ekspor data historis observasi ke format CSV dan fitur cetak laporan operasional stasiun.

---

## Arsitektur Teknologi

| Komponen | Teknologi yang Digunakan |
|---|---|
| **Backend** | Node.js, Express.js |
| **Database** | InfluxDB (Time-series data), SQLite (Metadata & Prediksi) |
| **Frontend** | Vanilla JavaScript, HTML5, CSS3, Chart.js, Leaflet.js |
| **Machine Learning** | Python 3.11, TensorFlow / Keras, NumPy, Pandas, Scikit-learn |
| **Komunikasi Data** | MQTT v5 (Paho/MQTT.js), WebSocket |
| **Kontainerisasi & Deploy** | Docker, Coolify / Ubuntu Server |

---

## Struktur Direktori

```text
├── src/
│   ├── config/            # Konfigurasi database (InfluxDB, SQLite), metadata stasiun, dan environment
│   ├── controllers/       # Controller logika bisnis API
│   ├── routes/            # Rute Express API (stations, predictions, dashboard, verification)
│   ├── services/          # Service layer (MQTT client, InfluxDB query, Python runner, scheduler, WebSocket)
│   ├── utils/             # Helper fungsi dan konstanta verifikasi
│   └── server.js          # Entry point aplikasi backend
├── python_scripts/
│   ├── predict.py         # Skrip orkestrator inferensi prediksi curah hujan
│   └── predictors/        # Modul prediktor berbasis OOP (AWS, AAWS, ARG)
├── models/                # Model Bi-LSTM (.keras/.h5) dan berkas scaler (.pkl)
├── database/
│   ├── schema.sql         # Skema struktur tabel database SQLite
│   └── seed.js            # Skrip seeding awal metadata stasiun
├── public/                # Antarmuka web (Frontend)
│   ├── index.html         # Dashboard ringkasan pemantauan
│   ├── peta-hujan.html    # Peta sebaran spasial curah hujan real-time
│   ├── stasiun.html       # Tabel daftar dan status 50 stasiun observasi
│   ├── detail.html        # Detail parameter stasiun, analitik daya, dan grafik historis
│   ├── prediksi.html      # Hasil prediksi curah hujan 7 hari ke depan
│   ├── verifikasi.html    # Evaluasi metrik performa model
│   ├── tentang.html       # Informasi metodologi dan sistem
│   ├── css/               # Berkas stylesheet
│   └── js/                # Berkas logika frontend per halaman
├── data/                  # Direktori penyimpanan SQLite database lokal
├── Dockerfile             # Konfigurasi container Docker multi-stage (Node.js + Python)
├── package.json           # Dependensi dan skrip Node.js
└── requirements.txt       # Dependensi pustaka Python
```

---

## Panduan Deployment

Aplikasi ini dikemas dalam bentuk kontainer Docker (*multi-stage build*) yang memadukan lingkungan Node.js dan Python runtime.

### 1. Konfigurasi Environment Variables

Siapkan variabel lingkungan pada berkas `.env` atau panel environment server produksi:

```ini
PORT=3001
NODE_ENV=production

# InfluxDB Configuration
INFLUX_URL=http://<IP_INFLUXDB>:8086
INFLUX_TOKEN=<INFLUX_TOKEN>
INFLUX_ORG=SKRIPSI
INFLUX_BUCKET=Monitoring

# Optional Secret Keys
API_KEY=<SECRET_API_KEY>
```

### 2. Menjalankan secara Lokal

```bash
# Instalasi dependensi Node.js
npm install

# Inisialisasi database awal
npm run seed

# Menjalankan server aplikasi
npm run dev
```

### 3. Menjalankan via Docker

```bash
# Build image Docker
docker build -t stmkg-monitoring .

# Menjalankan kontainer
docker run -d -p 3001:3001 --env-file .env --name simprech-app stmkg-monitoring
```

---

## Lisensi dan Hak Cipta

Proyek ini dikembangkan oleh **Akmaludien Ramadhan** untuk keperluan akademik dan penelitian skripsi di **Sekolah Tinggi Meteorologi Klimatologi dan Geofisika (STMKG)**.
