PANDUAN TRAINING ULANG (TARGET RMSE < 5mm)
=========================================

Folder ini disiapkan untuk proses training ulang model Bi-LSTM Anda.

Langkah-langkah:
1. Pindahkan file Excel (.xlsx) atau CSV data histori 5 tahun Anda ke dalam folder ini (training_data/).
2. Pastikan file data Anda memiliki kolom minimal: 
   'rain', 'temp', 'rh', 'press', 'ws', 'wd', 'sr' (urutan penting).
3. Untuk menjalankan training, Anda harus menggunakan Python 3.10 atau 3.11 (karena TensorFlow belum mendukung 3.14).
4. Jalankan perintah: 
   python train_final.py

Keunggulan Script train_final.py ini:
- Menggunakan Log-Transformation untuk menekan error (RMSE) pada hujan lebat.
- Menggunakan Huber Loss yang lebih stabil terhadap data pencilan (outlier).
- Arsitektur Bi-LSTM 2-layer dengan BatchNormalization untuk akurasi lebih tinggi.

Setelah training selesai, file model baru akan otomatis menggantikan model lama di folder models/aws/.
