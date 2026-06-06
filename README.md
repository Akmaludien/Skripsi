# Sistem Monitoring & Prediksi Curah Hujan Jawa Barat

Sebuah platform pemantauan cuaca IoT secara *real-time* terintegrasi dengan mesin prediksi *Deep Learning* (Bi-LSTM) untuk jaringan stasiun observasi BMKG (AWS, ARG, AAWS) di wilayah Jawa Barat. Proyek ini dikembangkan khusus untuk tugas akhir / Skripsi di Sekolah Tinggi Meteorologi Klimatologi dan Geofisika (STMKG).

---

## 🌟 Fitur Utama

1. **Real-time IoT Telemetry**: Menerima dan memproses data sensor secara langsung melalui protokol MQTT v5 dari server BMKG.
2. **Time-Series Database**: Mengelola puluhan ribu baris data historis secara efisien menggunakan **InfluxDB**.
3. **Deep Learning Prediction (Bi-LSTM)**: Mesin prediksi kecerdasan buatan berbasis Python (TensorFlow/Keras) yang mampu meramalkan intensitas curah hujan hingga 7 hari ke depan dengan tingkat akurasi terukur.
4. **Interactive Dashboard**: Antarmuka responsif dengan peta interaktif (Leaflet.js) untuk melacak status operasional, tegangan baterai, suhu, arah angin, dan parameter meteorologi lainnya.
5. **Export & Reporting**: Fitur unduh laporan dalam format CSV dan cetak PDF langsung dari sistem.
6. **Docker & Coolify Ready**: Dirancang penuh menggunakan pendekatan *containerized* (Docker) sehingga sangat mudah di-*deploy* ke VPS melalui Coolify.

## 🛠️ Tech Stack

| Komponen | Teknologi |
|----------|-----------|
| **Backend** | Node.js, Express.js |
| **Database** | InfluxDB (Time-series), SQLite (Metadata Stasiun) |
| **Frontend** | Vanilla JS, HTML5, CSS3, Chart.js, Leaflet.js |
| **Machine Learning**| Python 3.12, TensorFlow, Keras, Pandas, NumPy, Scikit-learn |
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
- Menginstal **Node.js** dan dependensi paket NPM.
- Menginstal **Python 3.12** berserta *virtual environment* (venv).
- Menjalankan `pip install` untuk *library* berat seperti TensorFlow.
- Menjalankan `server.js` pada *port* 3001.

*Catatan: Proses redeploy mungkin memakan waktu 5-15 menit tergantung kecepatan VPS dalam mengekstrak TensorFlow.*

## 📂 Struktur Direktori Penting

```text
├── server.js              # Entry point Backend Node.js
├── predict.py             # Script Inference Model ML Python
├── Dockerfile             # Konfigurasi containerized apps
├── database/
│   └── seed.js            # Inisialisasi daftar 50 stasiun ke SQLite
├── models/aws/
│   └── model_aws_cibeureum_FINAL.h5 # Model AI terlatih (Bi-LSTM)
├── public/
│   ├── index.html         # Dashboard Utama
│   ├── detail.html        # Detail Spesifik Stasiun & Grafik
│   └── prediksi.html      # Peta dan Tabel Prediksi 7 Hari
└── requirements.txt       # Daftar pustaka Python
```

## 🤝 Author

**Akmaludien Ramadhan**  
Sekolah Tinggi Meteorologi Klimatologi dan Geofisika (STMKG)  
*For academic and research purposes only.*
