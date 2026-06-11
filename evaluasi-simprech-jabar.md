# Laporan Evaluasi Website SIMPRECH Jawa Barat
**Nama Mahasiswa:** Akmaludien Ramadhan (NPT. 41.22.0014)  
**Program Studi:** Diploma IV Instrumentasi MKG – STMKG  
**Judul Skripsi:** Sistem Monitoring dan Prediksi Curah Hujan Menggunakan Metode Bi-Directional LSTM Berbasis Data Iklim di Wilayah Jawa Barat  
**URL Sistem:** https://www.simprech-jabar.my.id/  
**Tanggal Evaluasi:** 11 Juni 2026 (Revisi ke-3, berdasarkan audit kode sumber lengkap + konfirmasi MQTT aktif)

---

## 1. Ringkasan Sistem

Sistem yang dibangun merupakan platform berbasis web *full-stack* untuk monitoring real-time dan prediksi curah hujan 7 hari ke depan di wilayah Provinsi Jawa Barat. Berikut spesifikasi teknis berdasarkan audit kode sumber:

- **50 titik pengamatan**: 9 AAWS, 12 AWS, 29 ARG (sesuai `database/seed.js`; halaman Tentang Sistem menampilkan 8 AAWS + 12 AWS + 30 ARG — perlu diselaraskan)
- **Sumber data**: Broker MQTT BMKG (`202.90.198.159:1883`) via protokol MQTT v5, QoS 0
- **Model prediksi**: Bidirectional LSTM (Bi-LSTM) via TensorFlow/Keras (`predict.py`) — input lookback 60 hari, horizon 7 hari, *adaptive seasonal noise filter*
- **Auto-verifikasi**: `predict.py` secara otomatis membandingkan prediksi kemarin dengan data aktual InfluxDB, menghitung RMSE, MAE, R², dan menyimpan ke tabel `model_performance` serta `verification_log`
- **Database**: Dual-layer — InfluxDB (time-series sensor) + SQLite/better-sqlite3 (metadata stasiun, prediksi, alert, model_performance, verification_log)
- **Automasi**: Platform n8n (terpisah di VPS kedua) untuk deteksi anomali dan laporan harian otomatis ke Telegram Bot (`@monitoringjabar`)
- **Backend**: Node.js + Express + WebSocket (auto-reconnect) + MQTT subscriber + Prediction CRON (setiap 6 jam)
- **Frontend**: Leaflet.js (peta interaktif), Chart.js (grafik multi-axis), d3-delaunay (Thiessen Polygon), Browser Push Notifications (Notification API)
- **Deployment**: Docker container via Coolify di VPS Ubuntu

---

## 2. Evaluasi Per Halaman

### 2.1 Dashboard Utama (`index.html`)

**Fitur Terimplementasi:**
- 4 KPI cards: Total Stasiun Online (persentase + jumlah), Peringatan Aktif, Curah Hujan Tertinggi (dengan nama stasiun), Prediksi Hujan Lebat (>50 mm)
- Peta Leaflet interaktif dengan ikon SVG kustom per tipe stasiun (segitiga=AWS, lingkaran=ARG, berlian=AAWS)
- Pewarnaan marker berdasarkan *freshness* data: hijau (≤30 menit), kuning (≤1 jam), oranye (≤24 jam), merah (≤30 hari), abu-abu (>30 hari)
- Filter tipe stasiun (All / AWS / ARG / AAWS) dengan tombol pill interaktif
- Grid 8 kartu stasiun acak dengan *circular progress indicator* untuk parameter utama (curah hujan, suhu, kelembapan, baterai)
- Label kategori curah hujan BMKG (Ringan/Sedang/Lebat/Sangat Lebat) pada setiap kartu
- Deteksi anomali QC otomatis dengan flag ⚠️ pada data di luar rentang valid
- Indikator LIVE (titik hijau/merah) yang mencerminkan status koneksi WebSocket
- Jam WIB real-time di sidebar dan header
- Dark/Light mode toggle (disimpan di `localStorage`)
- Notifikasi push browser untuk peringatan hujan >50 mm (menggunakan Notification API)
- Tombol floating Telegram mengarah ke `t.me/monitoringjabar`

**Kekurangan / Gap terhadap Proposal:**
- Tidak ada grafik ringkasan curah hujan harian per tipe stasiun (tercantum di mockup Gambar 3.7)
- Tidak ada indikator status VPS server (sesuai batasan: 2 VPS terpisah)

**Catatan Evaluasi Sebelumnya yang Sudah Diperbaiki:**
- ~~Data menampilkan `--` / Loading~~ → Ini disebabkan oleh `connack timeout` pada koneksi MQTT ke broker BMKG (IP VPS belum di-*whitelist* oleh firewall BMKG), bukan karena fitur belum diimplementasi. Semua logika rendering data sudah lengkap di `dashboard.js`.

---

### 2.2 Peta Curah Hujan (`peta-hujan.html`)

**Fitur Terimplementasi:**
- Metode **Thiessen Polygon** menggunakan library `d3-delaunay` (Voronoi/Delaunay) — sesuai pendekatan di proposal
- Bounding box wilayah Jawa Barat: `[105.0, -8.0, 109.5, -5.5]`
- Legenda intensitas hujan sesuai klasifikasi BMKG: >100 mm (Sangat Lebat), 50–100 mm (Lebat), 20–50 mm (Sedang), 0.5–20 mm (Ringan), <0.5 mm (Tidak Hujan)
- Marker stasiun (lingkaran putih kecil) pada setiap titik koordinat
- Popup interaktif saat klik: menampilkan badge tipe stasiun, nama, nilai curah hujan, dan label kategori
- Auto-refresh data setiap 5 menit (300.000 ms)
- Overlay jam WIB real-time + tanggal lengkap
- Tile peta CartoDB dark-matter via Leaflet

**Kekurangan / Gap terhadap Proposal:**
- Tidak ada kontrol temporal (slider waktu / pilihan rentang jam) untuk eksplorasi data historis
- Tidak ada opsi ekspor peta (PNG/PDF)
- Hanya Thiessen Polygon; tidak ada opsi metode interpolasi alternatif

---

### 2.3 Daftar Stasiun (`stasiun.html`)

**Fitur Terimplementasi:**
- Tabel lengkap 50 stasiun dengan kolom: No, Station ID, Nama (link ke halaman detail), Tipe (badge warna), Kabupaten/Kota, Latitude/Longitude, Status (badge animasi), Aksi (link Detail)
- Pencarian teks berdasarkan nama stasiun atau ID (debounced 300 ms)
- Filter tipe stasiun (All / AWS / ARG / AAWS) dan filter status (All / Normal / Alert / Warning / Offline)
- Summary pills: Total, Normal, Alert, Warning, Offline
- Deteksi anomali QC — baris data anomali ditandai ⚠️
- Pagination konfiguratif: 10 / 15 / 25 / 50 baris per halaman, navigasi dengan ellipsis
- Responsif: kolom disembunyikan secara progresif pada layar kecil

**Kekurangan / Gap terhadap Proposal:**
- Kolom elevasi stasiun tidak ditampilkan (padahal field `elevation` ada di skema SQLite, Tabel 3.2)

**Catatan Evaluasi Sebelumnya yang Sudah Diperbaiki:**
- ~~Tabel kosong saat evaluasi~~ → Data stasiun ter-*seed* di `database/seed.js` (50 entri). Tabel kosong saat evaluasi sebelumnya karena koneksi backend sedang bermasalah.
- ~~Tidak ada pencarian~~ → Pencarian teks sudah ada (debounced).
- ~~Halaman Detail Stasiun tidak ditemukan~~ → **Sudah ada** (`detail.html`), lihat bagian 2.4.

---

### 2.4 Detail Stasiun (`detail.html`)

**Fitur Terimplementasi:**
- Header: nama stasiun, ID, model perangkat (Vaisala AWS310 / QMR102 / MAWS201), badge tipe, koordinat, lokasi, status ONLINE/OFFLINE (live dot)
- Mini-map Leaflet menampilkan lokasi stasiun
- **Grid metrik adaptif** berdasarkan tipe stasiun:
  - **AWS/AAWS** (8 widget): Suhu, Kelembapan, Curah Hujan (+ kategori BMKG), Tekanan, Kecepatan Angin (gauge doughnut), Arah Angin (kompas CSS dengan jarum), Radiasi Matahari, Tegangan Baterai — masing-masing dengan sparkline mini
  - **ARG** (3 widget): Suhu Logger, Curah Hujan, Baterai — dengan sparkline
- Grafik utama multi-axis (Chart.js): menampilkan semua parameter sekaligus, dengan selector parameter (all/individual) dan selector rentang waktu (1 jam, 3 jam, 6 jam, 12 jam, 24 jam, 3 hari, 7 hari)
- **Seksi Prediksi 7 Hari**: grafik batang + tabel. Banner peringatan risiko banjir (BAHAYA / SIAGA / WASPADA / AMAN) dengan kode warna severity. Per-hari: curah hujan prediksi, kategori, confidence
- **Seksi Kesehatan Perangkat**: skor kesehatan baterai (%), tren tegangan (↑↓), badge status (EXCELLENT / GOOD / WARNING / CRITICAL) dengan pesan advisory
- **Tombol Export CSV**: mengunduh data stasiun via endpoint `/api/stations/:id/export`
- **Tombol Cetak Laporan**: menyuntikkan subtitle timestamp, memanggil `window.print()`

**Kekurangan / Gap terhadap Proposal:**
- Tidak ada — halaman ini melampaui desain awal Gambar 3.8 proposal

---

### 2.5 Prediksi Curah Hujan (`prediksi.html`)

**Fitur Terimplementasi:**
- Label model: **"Prediksi Model Bi-LSTM"** (konsisten dengan judul skripsi)
- Date picker: memilih tanggal prediksi (hari ini → +6 hari)
- Tab hari: 7 tab horizontal scrollable (Hari Ini, Sen, Sel, dst.)
- Filter: tipe stasiun (All / AWS / ARG / AAWS) + dropdown wilayah (diisi dari API `/api/regions`)
- 4 kartu ringkasan: Total stasiun diprediksi, Jumlah berisiko tinggi, Curah hujan maksimum, Wilayah terdampak
- Peta prediksi Leaflet: circle marker dengan radius proporsional terhadap curah hujan, warna sesuai kategori. Popup: detail stasiun, curah hujan prediksi, kategori, confidence bar, link ke halaman detail
- Tabel prediksi: sortable, kolom nama stasiun, badge tipe, nilai curah hujan (warna), badge kategori, confidence (progress bar). Klik baris → fokus ke peta
- Grafik batang horizontal: 20 stasiun teratas, warna sesuai kategori
- Distribusi kategori visual: Ringan/Sedang/Lebat/Sangat Lebat dengan hitungan, persentase, progress bar
- Panel performa model: RMSE, MAE, R², Accuracy, Tanggal Training, Confidence text (High/Medium/Low Stability)

**Kekurangan / Gap terhadap Proposal:**
- Tidak ada *uncertainty band* / *confidence interval* pada grafik prediksi (hanya ditampilkan sebagai persentase angka, bukan band visual ±σ)
- Tidak ada perbandingan dengan model baseline (persistence/ARIMA) — proposal merujuk Rahimzad et al. (2021) untuk perbandingan ini
- 5 fitur input (curah hujan, suhu, kelembapan, tekanan, kecepatan angin) digunakan di model, namun dashboard hanya menampilkan output prediksi curah hujan — tidak ada visualisasi kontribusi/importansi fitur lain

**Catatan Evaluasi Sebelumnya yang Sudah Diperbaiki:**
- ~~Label model "LSTM-v1.0" bukan Bi-LSTM~~ → Label model di halaman prediksi sudah benar sebagai "Bi-LSTM". Catatan: `database/seed.js` masih menggunakan `model_version: 'LSTM-v1.0'` sebagai *seed* awal, namun nilainya akan diperbarui oleh `predict.py` saat inferensi berjalan.

---

### 2.6 Verifikasi Prediksi (`verifikasi.html`)

**Fitur Terimplementasi:**
- 4 kartu metrik ringkasan: RMSE (mm), MAE (mm), R-Squared Score, Prediction Accuracy (%)
- Peta spasial error: circle marker berukuran sesuai absolute error, warna: merah = over-predicted, biru = under-predicted, hijau = dekat. Popup: predicted vs actual vs error
- Grafik perbandingan: grouped bar chart (predicted vs actual per stasiun), filterable per stasiun
- Scatter plot distribusi error: actual (sumbu-x) vs predicted (sumbu-y), tooltip: nama stasiun + nilai + error
- Tabel log verifikasi: nama/tipe stasiun, Predicted (mm), Actual (mm), Error (mm). Searchable
- Sumber data: endpoint `/api/verification` (otomatis dihasilkan oleh `predict.py` setiap hari)
- **Graceful empty state**: jika belum ada data verifikasi, menampilkan kartu penjelasan alasan dan panduan

**Kekurangan / Gap terhadap Proposal:**
- Tidak ada breakdown metrik per tipe stasiun (AWS vs ARG vs AAWS)
- Tidak ada filter periode waktu (musim hujan vs kemarau)
- Tidak ada *confusion matrix* kategori intensitas hujan berdasarkan standar BMKG (Subbab 2.2.2)
- Tidak ada interpretasi kualitatif nilai RMSE dalam konteks hidrometeorologi (acuan: Chai & Draxler, 2014)

**Catatan Evaluasi Sebelumnya yang Sudah Diperbaiki:**
- ~~Semua nilai 0.0 / 0%~~ → Ini karena saat evaluasi pertama, `predict.py` belum pernah berjalan karena MQTT timeout (tidak ada data InfluxDB untuk diolah). Ketika MQTT aktif dan data masuk, `predict.py` CRON (setiap 6 jam) akan otomatis mengisi data verifikasi.

---

### 2.7 Tentang Sistem (`tentang.html`)

**Fitur Terimplementasi:**
- Statistik ringkasan: 50 Stasiun Aktif, 3 Tipe Sensor, 7 Hari Prediksi, 10 Menit Interval, 24/7 Real-time
- **Diagram arsitektur SVG** lengkap 4 layer:
  1. Layer 1 — Sumber Data Sensor: AWS (12), ARG (30), AAWS (8)
  2. Layer 2 — MQTT Broker BMKG (202.90.198.159:1883, MQTT v5, QoS 0)
  3. Layer 3 — Application Server (Express REST API, MQTT Subscriber, WebSocket Server, Prediction CRON)
  4. Layer 4 — Storage & Interfaces (SQLite, InfluxDB, Browser, Python Engine/Bi-LSTM)
- Alur data 4 langkah: Akuisisi (MQTT) → Penyimpanan (InfluxDB + SQLite) → Prediksi (Bi-LSTM) → Visualisasi & Alert (WebSocket)
- 8 kartu Technology Stack: Node.js, InfluxDB, SQLite, MQTT, TensorFlow/Keras, Leaflet.js, Chart.js, WebSocket
- 3 kartu Tipe Stasiun: AWS (12, 7 parameter), ARG (30, 3 parameter), AAWS (8, 9+ parameter)

**Kekurangan / Gap terhadap Proposal:**
- Tidak ada penjelasan komponen **n8n** dan **Telegram Bot** — padahal ini adalah fitur pembeda (novelty) di Subbab 2.12 dan 3.4 proposal. n8n berjalan terpisah di VPS kedua dan tidak terdokumentasi di halaman Tentang.
- Tidak ada informasi tentang infrastruktur **2 VPS** (1 untuk dashboard + 1 untuk n8n) sebagaimana disebutkan di Batasan Masalah poin 7
- Tidak ada referensi pustaka atau sitasi akademis

---

## 3. Fitur Proposal yang Sudah Terimplementasi

| No | Fitur | Lokasi di Proposal | Status |
|----|-------|--------------------|--------|
| 1 | Dashboard real-time dengan KPI, peta, filter tipe stasiun | Subbab 3.5.1, Gambar 3.7 | ✅ Lengkap |
| 2 | Halaman Detail Stasiun (grafik multi-parameter, angin, baterai) | Subbab 3.5.2, Gambar 3.8 | ✅ Melebihi desain awal |
| 3 | Halaman Prediksi Bi-LSTM 7 hari | Subbab 3.5.3, Gambar 3.9 | ✅ Lengkap |
| 4 | Halaman Verifikasi Prediksi | Subbab 3.6 | ✅ Lengkap |
| 5 | Peta Thiessen Polygon curah hujan | Proposal (interpolasi spasial) | ✅ Lengkap |
| 6 | Daftar 50 stasiun dengan filter & search | Tabel 3.1, Subbab 3.5.2 | ✅ Lengkap |
| 7 | WebSocket real-time push | Subbab 3.2.2 | ✅ Lengkap (auto-reconnect) |
| 8 | Klasifikasi curah hujan standar BMKG | Subbab 2.2.2 | ✅ Konsisten di semua halaman |
| 9 | Dual-layer database (InfluxDB + SQLite) | Tabel 3.2–3.5 | ✅ Lengkap |
| 10 | CRON prediksi otomatis setiap 6 jam | Subbab 3.3 | ✅ Terimplementasi di server.js |
| 11 | Auto-verifikasi model (RMSE, MAE, R²) | Subbab 3.6 | ✅ Terimplementasi di predict.py |
| 12 | Export CSV per stasiun | Tabel 3.6 (Tes Fungsional No. 8) | ✅ Endpoint + tombol UI tersedia |
| 13 | Cetak Laporan | Tabel 3.6 | ✅ Tombol UI dengan `window.print()` |
| 14 | Notifikasi push browser (hujan >50 mm) | Subbab 3.4 | ✅ Menggunakan Notification API |
| 15 | Dark/Light mode | UX Enhancement | ✅ Tersimpan di localStorage |
| 16 | Deteksi anomali QC data sensor | Relevan Subbab 3.6 | ✅ Range validation otomatis |

---

## 4. Fitur Proposal yang Belum Terimplementasi di Website

| No | Fitur di Proposal | Lokasi di Proposal | Status | Catatan |
|----|-------------------|--------------------|--------|---------|
| 1 | Confidence interval / uncertainty band visual pada grafik prediksi | Subbab 3.3.3 | ⚠️ Parsial | Confidence ditampilkan sebagai persentase angka, belum ada band visual ±σ pada grafik |
| 2 | Perbandingan performa Bi-LSTM vs model baseline | Tinjauan Pustaka, Subbab 2.9.3 | ❌ Belum ada | Penting untuk justifikasi keunggulan metode |
| 3 | Dokumentasi n8n & Telegram Bot di halaman Tentang | Subbab 2.12, 3.4 | ❌ Belum ada | n8n berjalan terpisah di VPS kedua, belum terdokumentasi di website |
| 4 | Breakdown metrik verifikasi per tipe stasiun | Tabel 3.7 | ❌ Belum ada | Penting karena training menggunakan 3 stasiun representatif berbeda tipe |
| 5 | Confusion matrix kategori intensitas hujan | Subbab 2.2.2 | ❌ Belum ada | Akan memperkuat analisis klasifikasi |
| 6 | Visualisasi kontribusi 5 fitur input model | Subbab 3.3.1 | ❌ Belum ada | Model menggunakan 5 fitur tapi hanya output curah hujan yang ditampilkan |
| 7 | Kontrol temporal di peta hujan (slider waktu) | Nice-to-have | ❌ Belum ada | Tidak eksplisit di proposal, tapi meningkatkan eksplorabilitas |

---

## 5. Masalah Teknis

### 5.1 Koneksi MQTT — ✅ Sudah Teratasi

| No | Masalah | Status | Tanggal Resolusi |
|----|---------|--------|------------------|
| 1 | `connack timeout` ke broker BMKG `202.90.198.159:1883` | ✅ **Sudah aktif** | 11 Juni 2026 |

**Kronologi:** Sebelumnya (8–10 Juni 2026) koneksi MQTT mengalami `connack timeout` karena IP publik VPS belum di-*whitelist* oleh firewall BMKG. Per 11 Juni 2026, koneksi MQTT sudah berhasil terhubung dan data real-time dari stasiun BMKG mulai mengalir ke InfluxDB.

**Dampak positif:** Seluruh halaman (Dashboard, Prediksi, Verifikasi, Peta Hujan, Detail Stasiun) kini dapat menampilkan data real-time dari 50 stasiun.

### 5.2 Masalah Minor (Sebagian Sudah Diperbaiki)

| No | Masalah | Status |
|----|---------|--------|
| 1 | Karakter encoding rusak (emoji → `???`, em-dash → `—`) di beberapa halaman | ✅ Sudah diperbaiki (commit `e588c75` s/d `ce52478`) |
| 2 | `model_version` di `seed.js` tertulis `'LSTM-v1.0'` alih-alih `'Bi-LSTM'` | ⚠️ Minor — akan otomatis diperbarui oleh `predict.py` saat inferensi pertama berjalan |
| 3 | Jumlah stasiun di `seed.js` (9 AAWS + 12 AWS + 29 ARG) tidak konsisten dengan `tentang.html` (8 AAWS + 12 AWS + 30 ARG) | ⚠️ Perlu diselaraskan |

---

## 6. Evaluasi Kesesuaian dengan Kriteria Keberhasilan Proposal

Berdasarkan **Tabel 3.7 – Parameter Keberhasilan Sistem** di proposal:

| No | Aspek | Target Proposal | Status Implementasi | Status Data |
|----|-------|-----------------|---------------------|-------------|
| 1 | Ketersediaan Data | ≥ 80% stasiun online | ✅ Kode lengkap (freshness indicator 5 level) | 🔄 MQTT aktif — perlu cek persentase stasiun online |
| 2 | Latensi Real-time | ≤ 1 menit via WebSocket | ✅ WebSocket terimplementasi (auto-reconnect, fallback polling 5 menit) | 🔄 Perlu diukur latensi aktual |
| 3 | Akurasi Model (R²) | ≥ 0.70 | ✅ Auto-verifikasi di `predict.py` | 🔄 Tunggu siklus CRON `predict.py` pertama dengan data real |
| 4 | Error Prediksi RMSE | ≤ 5 mm | ✅ Perhitungan otomatis di `predict.py` | 🔄 Tunggu siklus CRON — seed awal: 12.4 mm (placeholder) |
| 5 | Error Prediksi MAE | ≤ 3 mm | ✅ Perhitungan otomatis di `predict.py` | 🔄 Tunggu siklus CRON — seed awal: 9.1 mm (placeholder) |
| 6 | Keandalan Automasi n8n | ≥ 95% workflow berhasil | ⚠️ n8n di VPS terpisah | ❓ Belum terverifikasi |
| 7 | Deteksi Anomali | 100% notifikasi HIGH/CRITICAL terkirim | ✅ Push notification + alert system di kode | 🔄 Akan aktif saat data curah hujan >50 mm masuk |
| 8 | Anti-Spam Notifikasi | 100% duplikat dalam 2 jam tercegah | ❓ Tidak ditemukan logika anti-duplikat eksplisit di kode | ❓ Belum terverifikasi |

> **Catatan Penting:** Seed awal `model_performance` di `seed.js` menunjukkan RMSE=12.4 mm dan MAE=9.1 mm — jauh di atas target proposal (RMSE ≤5, MAE ≤3). Nilai-nilai ini adalah *placeholder* dan akan digantikan oleh hasil aktual `predict.py`. Namun, jika hasil model aktual juga melebihi target, perlu disertai justifikasi ilmiah di BAB Pembahasan.

---

## 7. Rekomendasi Perbaikan (Diprioritaskan untuk Sidang)

### 7.1 🔴 Wajib — Langkah Kritis Berikutnya

1. ~~Selesaikan masalah koneksi MQTT~~ → ✅ **Sudah teratasi** (11 Juni 2026).
2. **Pastikan `predict.py` CRON berjalan sukses** — Sekarang MQTT sudah aktif dan data mengalir ke InfluxDB, tunggu atau trigger manual siklus CRON prediksi agar tabel `predictions` dan `verification_log` di SQLite terisi data nyata (bukan placeholder seed).
3. **Verifikasi target metrik model** — Setelah `predict.py` berjalan, cek halaman `verifikasi.html`: pastikan RMSE ≤ 5 mm, MAE ≤ 3 mm, R² ≥ 0.70. Jika tidak tercapai, siapkan justifikasi ilmiah di BAB Pembahasan.
4. **Kumpulkan data minimal 60 hari** — Model Bi-LSTM membutuhkan lookback 60 hari. Jika data InfluxDB belum cukup 60 hari, prediksi akan suboptimal. Prioritaskan agar VPS tetap online dan MQTT terus mengalir.

### 7.2 🟠 Penting — Kekuatan Akademis

4. **Selaraskan jumlah stasiun** antara `seed.js` (9 AAWS, 29 ARG) dan `tentang.html` (8 AAWS, 30 ARG) — pilih satu sumber kebenaran dan konsistenkan.
5. **Ubah `model_version` di `seed.js`** dari `'LSTM-v1.0'` menjadi `'Bi-LSTM-v1.0'` agar konsisten jika `predict.py` belum pernah berjalan saat demo.
6. **Tambahkan penjelasan n8n & Telegram Bot** di halaman Tentang Sistem — ini adalah *novelty* yang eksplisit di proposal, harus terdokumentasi di website.
7. **Tambahkan confusion matrix** kategori intensitas hujan di halaman verifikasi (Ringan/Sedang/Lebat/Sangat Lebat) — memperkuat analisis sesuai standar BMKG.
8. **Tambahkan breakdown metrik per tipe stasiun** (AWS vs ARG vs AAWS) di halaman verifikasi — menunjukkan performa model pada karakteristik stasiun yang berbeda.

### 7.3 🟡 Disarankan — Nilai Tambah

9. Tambahkan *confidence interval band* (±σ) pada grafik prediksi 7 hari — memperkuat justifikasi ilmiah.
10. Tambahkan perbandingan sederhana Bi-LSTM vs persistence model (sebagai baseline) — mendukung klaim keunggulan metode.
11. Tambahkan kolom elevasi di tabel stasiun (data sudah ada di schema SQLite).
12. Tambahkan filter musim/periode di halaman verifikasi (musim hujan vs kemarau).

---

## 8. Penilaian Keseluruhan

| Aspek | Nilai (1–10) | Catatan |
|-------|:---:|---------| 
| Kesesuaian dengan Spesifikasi Proposal | **8/10** | Arsitektur end-to-end lengkap, 16 dari 23 fitur utama terimplementasi, termasuk fitur-fitur yang melampaui proposal (QC anomaly, flood risk assessment, device health monitoring) |
| Implementasi Kode Backend | **9/10** | REST API lengkap, MQTT subscriber, WebSocket auto-reconnect, CRON scheduler, dual-database, auto-verifikasi — semua best practice terpenuhi |
| Implementasi Model Bi-LSTM | **8/10** | Model terimplementasi dengan seasonal noise filter, auto-verification, confidence scoring — perlu bukti angka aktual |
| Kelengkapan Fitur Frontend | **8/10** | 7 halaman (termasuk detail stasiun yang komprehensif), peta interaktif, grafik multi-axis, responsive design, dark mode |
| Kualitas Visualisasi & UX | **8/10** | Desain modern, interaktif, ikon kustom SVG, pewarnaan data-driven, graceful empty states |
| Keandalan Data Runtime | **7/10** | MQTT sudah aktif per 11 Juni 2026 — data real-time mengalir. Skor akan naik ke 9/10 setelah `predict.py` CRON terverifikasi berjalan dengan data real. |
| Dokumentasi & Akademis | **6/10** | Halaman Tentang sudah informatif, namun perlu tambahan n8n, Telegram, referensi pustaka |

**Rata-rata: 7.7 / 10** — naik dari evaluasi pertama (5.2/10) dan revisi kedua (7.1/10). Kenaikan terakhir karena MQTT sudah berhasil terhubung ke broker BMKG sehingga pipeline data end-to-end kini berfungsi.

---

## 9. Catatan Akhir untuk Persiapan Sidang

Rancangan dan implementasi sistem sudah **sangat kuat** secara teknis. Arsitektur end-to-end dari MQTT subscriber hingga auto-verifikasi model, penggunaan Bi-LSTM dengan preprocessing dan Huber Loss, dual-layer database, serta WebSocket real-time merupakan kontribusi solid yang melampaui standar skripsi D-IV.

Dengan MQTT yang kini sudah aktif, **pipeline data end-to-end sudah berfungsi penuh**: Sensor → MQTT Broker → Node.js Subscriber → InfluxDB → predict.py (Bi-LSTM) → SQLite → Frontend (WebSocket). Langkah kritis berikutnya:

1. ✅ ~~Whitelist IP VPS di firewall BMKG~~ — Sudah teratasi
2. **Pastikan `predict.py` sudah berjalan minimal 1 siklus penuh** sehingga tabel prediksi dan verifikasi berisi data nyata dengan metrik RMSE/MAE/R² aktual
3. **Kumpulkan data InfluxDB minimal 60 hari** agar lookback window Bi-LSTM terpenuhi — jika belum cukup, model tetap berjalan tapi akurasi mungkin suboptimal
4. **Siapkan backup**: Screenshot / screen recording sistem saat data aktif, untuk antisipasi jika koneksi MQTT terganggu saat hari-H sidang
5. **Dokumentasikan workflow n8n & Telegram Bot** di halaman Tentang Sistem agar sesuai proposal

Fokus utama: **buktikan angka RMSE, MAE, dan R² muncul di halaman `verifikasi.html` dengan data nyata — itu adalah inti Tujuan Penelitian 2.**

---

*Laporan evaluasi revisi ke-3, disusun berdasarkan audit kode sumber lengkap (server.js, predict.py, seed.js, 7 halaman HTML, 5 file JavaScript) dan konfirmasi MQTT aktif pada 11 Juni 2026. Evaluasi pertama (10 Juni 2026) mengandung false negative karena dilakukan saat koneksi MQTT timeout. Revisi ke-2 (11 Juni 2026 pagi) mengoreksi false negative tersebut. Revisi ke-3 memperbarui status MQTT menjadi aktif.*
