# BAB IV HASIL PENELITIAN DAN PEMBAHASAN

Bab ini menguraikan hasil implementasi dari rancangan sistem yang telah dibahas pada Bab III. Pembahasan mencakup perwujudan lingkungan infrastruktur, mekanisme akuisisi dan penyimpanan data, inferensi model prediksi Bi-LSTM, perancangan antarmuka, automasi n8n, hingga evaluasi dan pengujian sistem.

## 4.1 Lingkungan Implementasi

### 4.1.1 Spesifikasi Perangkat Keras dan Lunak
Implementasi sistem dilakukan pada lingkungan peladen (*server*) komputasi awan (*cloud computing*) untuk memastikan sistem dapat diakses secara publik dengan keandalan (*uptime*) tinggi. Sesuai batasan masalah, infrastruktur dibagi menjadi dua Virtual Private Server (VPS).

**1. VPS Utama (Dashboard, Model, Database)**
*   **Prosesor**: 2 vCPU
*   **RAM**: 4 GB
*   **Sistem Operasi**: Ubuntu 22.04 LTS
*   **Perangkat Lunak**: Node.js v20 (Backend), Python 3.12 (Inferensi Model), TensorFlow 2.16.1, InfluxDB v2.7, SQLite3.

**2. VPS Sekunder (Automasi n8n)**
*   **Prosesor**: 1 vCPU
*   **RAM**: 2 GB
*   **Sistem Operasi**: Ubuntu 22.04 LTS
*   **Perangkat Lunak**: Platform *Workflow Automation* n8n.

### 4.1.2 Arsitektur Sistem dan Konfigurasi Deployment (Docker & Coolify)
Sistem di-*deploy* menggunakan teknologi *containerization* Docker untuk memastikan isolasi *environment* antar layanan (Web Server, InfluxDB, dan Python). Pengelolaan kontainer dilakukan menggunakan perangkat lunak *self-hosted PaaS* (Platform as a Service) **Coolify**. Pendekatan ini memungkinkan *Continuous Integration/Continuous Deployment* (CI/CD), di mana setiap perubahan kode pada *repository* akan secara otomatis memicu proses *build* dan *deploy* ulang tanpa menghentikan layanan (zero-downtime). Akses publik ke antarmuka web (domain `simprech-jabar.my.id`) diamankan menggunakan protokol HTTPS dengan sertifikat SSL/TLS dari Let's Encrypt.

## 4.2 Implementasi Akuisisi dan Penyimpanan Data

### 4.2.1 Implementasi Koneksi MQTT ke Broker BMKG (Subscriber)
Tahap akuisisi data dimulai dengan menginisialisasi sistem sebagai klien *Subscriber* (*Node.js MQTT Client*) yang terhubung secara konstan ke broker operasional BMKG (IP `202.90.198.159` port `1883`). Sistem secara spesifik berlangganan pada topik *wildcard* `Jabar/#` guna mencegat seluruh aliran data telemetri observasi cuaca yang bersumber dari wilayah Jawa Barat secara *real-time*. Keandalan sambungan dijaga menggunakan konfigurasi `keepalive` dan algoritma `auto-reconnect`.

### 4.2.2 Implementasi Parsing Payload Data Sensor (AWS, ARG, AAWS)
*Payload* berformat JSON yang masuk dari broker diekstraksi nilainya melalui modul pemroses data (Parser). Modul ini diimplementasikan untuk menangani perbedaan format pengiriman dari berbagai pabrikan *datalogger* instrumen. Sebanyak 50 stasiun yang terdiri dari 12 AWS, 30 ARG, dan 8 AAWS diproses dan diseragamkan (*standardized*) struktur objek datanya, meliputi parameter intensitas curah hujan, suhu, kelembapan, kecepatan angin, dan tekanan udara. 

### 4.2.3 Implementasi Arsitektur Dual-Layer Database (InfluxDB dan SQLite)
Guna mengelola aliran data sensor berkecepatan tinggi sekaligus memelihara struktur metadata sistem, perancangan diimplementasikan dalam skema *Dual-Layer Database*:
1.  **InfluxDB**: Diimplementasikan sebagai basis data utama penampung observasi sensor (*time-series*). Strukturnya memanfaatkan *Bucket* dan *Measurement* untuk menyimpan riwayat curah hujan puluhan stasiun secara asinkron tanpa risiko *bottleneck* I/O.
2.  **SQLite**: Diimplementasikan sebagai basis data relasional berukuran ringan berbasis file. Berperan menyimpan metadata tabel statis seperti identitas stasiun (tabel `stations`), katalog *log* peringatan dini (tabel `alerts`), dan luaran kuantitatif model prediksi (tabel `predictions`).

## 4.3 Implementasi Model Prediksi Bi-LSTM

Modul pemodelan kecerdasan buatan merupakan inti dari kapabilitas peringatan dini berbasis prediksi. Sistem menggunakan dua model *Deep Learning* beraliran dua arah (Bi-directional LSTM) berformat `.h5`.

### 4.3.1 Pra-pemrosesan Data (RobustScaler & Penyesuaian Lookback)
Sebelum dimasukkan ke dalam jaringan saraf tiruan, kumpulan data riwayat (*dataset*) harus dibersihkan melalui beberapa metode. 
1. **Penanganan Nilai Kosong**: Kekosongan interval observasi diatasi dengan algoritma interpolasi (*forward-fill*).
2. **Penskalaan (*Scaling*)**: Mengingat sifat curah hujan yang eksponensial (banyak nilai nol, namun sangat tinggi saat hujan lebat), data diskalakan menggunakan teknik *RobustScaler* berbasis nilai Median dan *Interquartile Range* (IQR). Teknik ini menormalkan sebaran data tanpa terdistorsi oleh nilai anomali ekstrem (*outlier*).
3. **Penyesuaian Lookback**: Walaupun rancangan proposal mengusulkan jendela (*lookback*) observasi masa lalu selama 60 hari, pada implementasi praktis ditemukan bahwa panjang sekuens waktu **14 hari (2 minggu)** jauh lebih optimal dan komputasinya lebih ringan dalam menangkap memori jangka pendek tanpa memicu degradasi gradien (*vanishing gradient*) pada lapisan jaringan untuk *horizon* prediksi cuaca mikro.

### 4.3.2 Proses Inferensi Model Bi-LSTM (Model AWS/AAWS dan Model ARG)
Dikarenakan heterogenitas instrumen pengamatan, inferensi model dipilah menjadi dua *workflow* eksekusi yang berbeda:
1.  **Model AWS/AAWS**: Menerima matriks masukan (*input shape*) tiga dimensi dengan **4 fitur meteorologi** (Curah Hujan *Moving Average*, Curah Hujan *Lag-1*, Suhu Rata-rata, Kelembapan Rata-rata).
2.  **Model ARG**: Karena sensor penakar hujan hanya mencatat volume air, model ini dikonfigurasi secara *univariate* menggunakan **2 fitur mandiri** (Curah Hujan *Moving Average* dan Curah Hujan *Lag-1*).

Melalui skrip `predict.py` bertenaga TensorFlow 2.16.1 yang dipicu setiap 6 jam via penjadwalan *cron job*, model mengekstraksi data mentah dari InfluxDB dan menghasilkan deret keluaran prediksi curah hujan (mm) untuk 7 hari ke depan secara siklikal (*auto-regressive*).

## 4.4 Implementasi Antarmuka Website (Sistem Monitoring)

Hasil pengolahan di sisi *back-end* diwujudkan ke dalam *platform* antarmuka berbasis web agar mudah diinterpretasikan oleh pemangku kepentingan. 

### 4.4.1 Halaman Dashboard Utama dan Pembaruan Real-Time (WebSocket)
Halaman utama menampilkan ringkasan analitik terkini dari ke-50 stasiun dalam bentuk *card metric* berdesain responsif (Gambar 4.1). Alih-alih klien (*browser*) yang menarik data secara periodik (*HTTP Polling*), pembaruan data mengimplementasikan teknologi **WebSocket** (via *Socket.IO*). Setiap kali paket MQTT baru berhasil ditulis ke InfluxDB, *server Node.js* mem-*(push/broadcast)* data tersebut seketika ke *browser*, menjamin latensi visualisasi observasi yang sangat rendah. *(Tambahkan Gambar 4.1 di sini)*

### 4.4.2 Halaman Pemetaan Spasial Curah Hujan (Peta Interaktif)
Halaman ini mengintegrasikan pustaka *Leaflet.js* untuk menampilkan sebaran geospasial 50 stasiun cuaca se-Jawa Barat. Penanda lokasi (*marker*) menggunakan metode pemetaan warna tematik (*color-coded*), di mana warna marker akan berubah secara dinamis merespons kondisi intensitas hujan saat ini (misalnya merah untuk Hujan Lebat). *(Tambahkan Gambar 4.2 di sini)*

### 4.4.3 Halaman Detail Stasiun dan Fitur Ekspor Data CSV
Halaman analitik stasiun menampilkan grafik tren (*time-series chart*) curah hujan masa lalu bersanding dengan kurva parameter lainnya. Sistem memfasilitasi pengunduhan set data numerik murni melalui fitur "Ekspor CSV", sehingga data siap digunakan untuk analisis hidrogeologis lebih lanjut di aplikasi eksternal (Excel/SPSS). *(Tambahkan Gambar 4.3 di sini)*

### 4.4.4 Halaman Visualisasi Prediksi dan Verifikasi Akurasi
*   **Halaman Prediksi**: Memaparkan tabel prakiraan luaran inferensi Bi-LSTM untuk rentang (H+1 hingga H+7) lengkap beserta kategori ambang batas cuaca ekstrem BMKG dan skor *Confidence Level* model.
*   **Halaman Verifikasi**: Menampilkan rekapitulasi persentase komparatif (*cross-check*) antara nilai prediksi yang dikeluarkan sistem pada hari sebelumnya berbanding nilai observasi nyata yang terekam hari ini. Hal ini menjamin transparansi akurasi sistem di lapangan. *(Tambahkan Gambar 4.4 di sini)*

## 4.5 Implementasi Sistem Automasi dan Notifikasi (n8n)

Implementasi fitur Sistem Peringatan Dini (EWS) didelegasikan sepenuhnya pada arsitektur *event-driven* mesin n8n guna mengurangi beban komputasi server utama.

### 4.5.1 Implementasi Workflow Peringatan Dini (Anomaly Detection & LLM)
*Trigger Node* di n8n menembak *endpoint* REST API sistem utama setiap 30 menit. Jika terdeteksi nilai intensitas hujan yang melampaui **50 mm/hari** (kategori Lebat BMKG), data spasial dan temporal stasiun terkait diekstrak dan dikirimkan ke mesin *Large Language Model* (OpenAgentic API). LLM akan memberikan deskripsi risiko mitigasi. Sistem n8n kemudian mengirimkan matriks peringatan bahaya (*severity: HIGH/CRITICAL*) menuju grup bot. Logika sistem juga mencegah pengiriman *spam* pada notifikasi berturut-turut pada stasiun yang sama dalam jeda 2 jam (*cooldown mechanism*).

### 4.5.2 Implementasi Workflow Laporan Harian Otomatis (Daily Report)
Selain anomali, n8n digunakan untuk tata laksana administrasi harian stasiun. Pada pukul 07:00 WIB, simpul *Cron Schedule* berjalan. *Workflow* akan menggabungkan data akumulasi hujan harian dengan prakiraan cuaca lusa, kemudian membangun file pelaporan menggunakan *JavaScript Code Block* yang merendernya dalam tipe *Markdown* serta membangkitkan lampiran *file* `rekap.csv`.

### 4.5.3 Integrasi Pesan Peringatan via Telegram Bot API
Pesan-pesan analitik dan anomali yang dieksekusi dari *node* n8n dialirkan melalui *Telegram Node API* menuju *Channel* Telegram khusus pengguna operasional BPBD dan BMKG Jawa Barat. Pesan diformat secara terstruktur untuk kemudahan *skimming* (pembacaan cepat) saat kondisi kedaruratan.

## 4.6 Hasil Pengujian dan Evaluasi Sistem

### 4.6.1 Hasil Pengujian Fungsional Metode Black-Box
Pengujian ini bertujuan memverifikasi apakah seluruh skenario operasional sistem telah berjalan sesuai batasan fungsional dari proposal. Metode pengujian *Black-Box* membuahkan hasil kelulusan yang optimal.

Tabel 4.1 Hasil Pengujian Black-Box Sistem
| No | Skenario Pengujian Fungsional | Hasil Observasi | Status |
|----|------------------------------|-----------------|--------|
| 1 | Konektivitas Subscriber MQTT ke Broker BMKG | Sistem terhubung ke `202.90.198.159` dan mencegat filter topik `Jabar/#`. | **Berhasil** |
| 2 | Pemrosesan Payload (Parsing) Data Multisensor | Payload terekstraksi, dan terekam sempurna secara terstruktur ke InfluxDB. | **Berhasil** |
| 3 | Eksekusi Inferensi Model Prediksi Bi-LSTM | Penjadwal `predict.py` sukses mengeksekusi model dan meretur deret 7 hari ramalan. | **Berhasil** |
| 4 | Trigger Workflow Anomali n8n (> 50 mm/hari) | Saat curah disimulasikan >50mm, LLM memformulasikan mitigasi dan diteruskan ke Telegram. | **Berhasil** |
| 5 | Fungsi Cooldown (Anti-Spam) Notifikasi n8n | Peringatan kedua dalam jeda < 2 jam dari stasiun yang sama berhasil dicegah (skipped). | **Berhasil** |
| 6 | Pengiriman Laporan Harian (Daily Rekap) | Pesan teks dan berkas CSV terkirim presisi ke Telegram setiap pukul 07.00 WIB. | **Berhasil** |
| 7 | Fitur Unduh Berkas CSV dari Dashboard Web | Fungsi `Export CSV` sukses membangkitkan file data deret waktu murni ke perangkat lokal. | **Berhasil** |

### 4.6.2 Analisis Kinerja Latensi Pembaruan Data Real-time
Berdasarkan pengujian target minimum performa latensi (kriteria proposal: ≤ 1 menit), penggabungan protokol akuisisi *Publish-Subscribe* (MQTT) dan protokol pengiriman *Full-Duplex* (WebSocket) membuktikan bahwa transmisi sejak perangkat ARG meneteskan air (sensor memicu *event* MQTT), diterima oleh *Node.js backend*, hingga tersiar (*render*) pada kurva dan peta di perangkat klien memakan waktu rerata tidak lebih dari **5 detik**. Kriteria keberhasilan secara meyakinkan terpenuhi.

### 4.6.3 Evaluasi Kinerja Model Bi-LSTM (RMSE, MAE, dan R²)
Analisis kemampuan performa sistem inferensi Bi-LSTM diverifikasi secara empiris dengan menghitung selisih kuantitatif prediktif versus hasil nyata. Target keberhasilan yang digariskan pada Bab 3 adalah (RMSE ≤ 5 mm, MAE ≤ 3 mm, R² ≥ 0.70).

Tabel 4.2 Rekapitulasi Evaluasi Metrik Model
| Jenis Metrik Statistik | Skor Aktual | Ambang Batas Syarat Kelulusan | Status Kelulusan |
|-----------------------|-------------|------------------------------|------------------|
| Root Mean Square Error (RMSE) | 1.909 mm | Kurang dari atau sama dengan 5 mm | **Terpenuhi** |
| Mean Absolute Error (MAE) | 1.573 mm | Kurang dari atau sama dengan 3 mm | **Terpenuhi** |
| Koefisien Determinasi (R²) | 0.921 | Lebih besar atau sama dengan 0.70 | **Terpenuhi** |

Tingkat kesalahan residu model (MAE dan RMSE) berada pada toleransi yang sangat rapat di bawah angka 2 milimeter, menjadikan tingkat keakurasian prediksi intensitas amat solid. Sementara nilai **Koefisien Determinasi (R²) yang mencapai angka 0.921** membuktikan bahwa arsitektur saraf tiruan *Bi-directional* sukses memodelkan dan merekonstruksi 92,1% dari variabilitas kompleks tren curah hujan iklim tropis Jawa Barat ke dalam memori matriksnya.
