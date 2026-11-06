# MASTER PROMPT — GOOGLE AI STUDIO BUILD
## SIGNAL V3.2 · Signature Jewel Luxury · Existing App Redesign

Kamu sedang melanjutkan **aplikasi yang sudah ada**, bukan membuat aplikasi baru dari nol. Baca seluruh instruksi ini sebelum mengubah file.

## 1. Misi utama

Lakukan penyempurnaan menyeluruh UI/UX aplikasi SIGNAL di repository ini. Pertahankan seluruh alur bisnis dan data yang sudah tersedia. Buat pengalaman yang **modern, chic, elegant, expressive jewel luxury, premium, mudah dipahami, ringkas, cepat, dan responsif**.

Arah visual final adalah **SIGNAL V3.2 — Signature Jewel Luxury**. Ini bukan quiet luxury, bukan monochrome, bukan Bento Dashboard template, dan bukan tampilan SaaS generik. Warna permata, material berlapis, ornamen geometris, relief halus, ilustrasi yang relevan, tipografi editorial, dan logo yang khas harus terasa konsisten di seluruh aplikasi.

Baca `docs/DESIGN_SYSTEM.md` dan `docs/BRAND_IDENTITY_V3_2.md`. Dokumen tersebut adalah sumber kebenaran visual aktif. Jika dokumen historis menyebut arah Bento/quiet luxury atau menolak Atelier, anggap catatan itu sudah disupersede oleh V3.2.

## 2. Syarat UX yang tidak boleh ditawar

1. Layar tidak rumit, bertele-tele, panjang, banyak klik, atau memaksa scroll berlebihan.
2. Gunakan kalimat pendek dan kata sehari-hari. Operator awam harus memahami tindakan tanpa membaca paragraf panjang.
3. Letakkan tindakan utama dekat dengan data yang dikelola. Kurangi langkah untuk pekerjaan berulang.
4. Ringkasan tampil dahulu; detail dapat dibuka saat diperlukan.
5. Jangan menghilangkan tabel, matriks, informasi, filter, atau kontrol yang penting demi membuat layar terlihat kosong.
6. Jangan membuat kartu untuk setiap baris data. Tabel tetap tabel jika itu format paling efisien.
7. Semua halaman harus responsif, keyboard-accessible, dan nyaman digunakan pada layar kecil.
8. Semua angka, status, dan grafik harus berasal dari data aplikasi. Dilarang mengarang angka untuk estetika.

## 3. Visual language — Expressive Jewel Luxury

### Palette final

- Heritage Night `#173D32`
- Heritage Green `#245748`
- Jade `#5F8D79`
- Emerald `#2D8066`
- Midnight Blue `#334F70`
- Dusty Blue `#748DA6`
- Deep Plum `#4C3455`
- Muted Plum `#927D98`
- Antique Gold `#B39A68`
- Gold Light `#E5C97A`
- Warm Ivory `#F7F4ED`
- Paper `#FFFEFA`
- Warm Stone `#E9E4DC`
- Soft Sage `#E2EAE1`
- Ink `#26352F`

### Material techniques

Gunakan teknik visual ini sesuai konteks:

- Jewel enamel: hero emerald, midnight blue, plum, dan warm gold.
- Engraved geometry: radial rosette, arch, grid, motif garis arsitektural, dan pola geometris dengan opacity rendah.
- Antique metal: garis emas tipis, emblem, detail sudut, highlight kecil.
- Layered relief: inner highlight, border halus, shadow bertingkat.
- Editorial typography: Fraunces untuk display/angka, Inter untuk UI, tabel, dan form.
- Functional illustration: motif harus sesuai fitur; jangan tempel ilustrasi generik ke semua tempat.

Hero dan KPI wajib terasa premium pada setiap fitur inti, bukan hanya Beranda. Setiap area cukup memakai satu motif utama dan satu tekstur pendukung. Ornamen tidak boleh menutupi isi, mengganggu klik, menambah tinggi halaman, atau menurunkan keterbacaan.

### Logo SIGNAL

Gunakan aset resmi yang sudah disiapkan:
- `public/signal-mark.svg` untuk emblem aplikasi, sidebar, dan loading.
- `public/signal-logo.svg` untuk wordmark berlatar terang.
- `public/signal-logo-light.svg` untuk wordmark berlatar gelap.
- PNG tersedia untuk aplikasi/dokumen yang tidak menerima SVG.
- `public/favicon.svg` untuk favicon.

Jangan mengganti logo dengan teks “S”, emoji, atau ikon generik. Logo harus konsisten di sidebar, loading, favicon, serta materi brand.

## 4. Sistem komponen dan stylesheet

Entry point menggunakan urutan stylesheet berikut:

1. `src/styles/sakala-modern.css` — fondasi styling komponen operasional yang diwarisi.
2. `src/styles/signal-v3-atelier.css` — token dan sistem visual V3.
3. `src/styles/signal-v3-jewel-identity.css` — signature logo, hero, KPI, sidebar footer, dan responsive override V3.2.

Jangan hapus stylesheet dasar pertama. Beberapa fitur masih menggunakan class operasional yang didefinisikan di sana. Jika mengonsolidasikan CSS, pastikan tidak ada screen yang kehilangan layout, form, tabel, modal, atau komponen.

Gunakan Lucide React yang sudah menjadi dependency. Jangan menambah icon pack lain tanpa alasan kuat. Jangan memasukkan gambar/ornamen eksternal sebagai kebutuhan runtime; prioritaskan aset SVG lokal.

## 5. Peta aplikasi — semua modul harus dipertahankan

### 01. Beranda / Operator Overview

- Hero status jadwal dengan status aktual dan tindakan relevan.
- KPI rombel aktif, alokasi KBM, konflik, guru terjadwal.
- Status per rombel dan akses ke jadwal/kebutuhan/validasi.
- Gunakan emerald enamel dengan engraved geometry. Angka dan CTA tetap jadi fokus.

### 02. Jadwal Pelajaran

- Matriks jadwal mingguan dan tampilan per kelas.
- Editor slot, pilihan kelas, tampilan seluruh kelas, zoom/compact, dan scroll lokal.
- Aktivitas non-KBM harus tampak berbeda dari JP KBM dan tidak dapat tertimpa.
- Pertahankan drag/drop hanya jika validasi dilakukan sebelum commit; sediakan cara edit melalui keyboard/form.

### 03. Kebutuhan & Alokasi JP

- Master kebutuhan per kelas/mapel/guru.
- KPI kebutuhan, kapasitas, keseimbangan, rombel tuntas.
- Form tambah/ubah alokasi, search/filter, isu kapasitas.
- KPI boleh bergaya jade, blue, plum, dan gold; semua angka dari state.

### 04. Schedule Generator

- Kontrol generator, status proses, kandidat, jumlah search nodes, kapasitas dan kebutuhan.
- Status wajib dibedakan: `QUEUED`, `RUNNING`, `SUCCESS`, `INFEASIBLE`, `SEARCH_LIMIT_REACHED`, `INVALID_INPUT`, `CANCELLED`, `FAILED`.
- `SEARCH_LIMIT_REACHED` bukan bukti masalah tidak mungkin diselesaikan.
- Kandidat yang dipilih tetap draft sampai validasi final lolos.

### 05. Validasi & Konflik

- Ringkasan hard errors, warnings, dan status valid.
- Daftar konflik berkelompok, kalimat singkat, tindakan navigasi perbaikan.
- Validator kode deterministik adalah otoritas final. AI tidak boleh memutuskan validitas.

### 06. Beban Guru

- Perhitungan dari jadwal yang sedang aktif/draft sesuai logika yang sudah ada.
- Total JP, konversi jam, rata-rata, ambang/beban, distribusi hari, sesi, guru overload dan underload.
- Pertahankan filter guru/kelas/mapel, sorting, pencarian, paginasi, dan ekspor.
- Hero analitik emerald; metric materials dapat memakai emerald, warm gold, midnight, plum.

### 07. Data Master

- Tabs kelas, guru, mata pelajaran.
- Pertahankan tambah/edit/nonaktifkan, kualifikasi, batas beban, pencarian/filter, dan validasi yang ada.
- Tabel harus tetap ringkas dan mudah dipindai.

### 08. Presensi Guru

Pertahankan kelima tab yang sudah ada:
- Harian: input massal status seluruh guru aktif untuk satu tanggal.
- Bulanan: penerapan status rentang/periode dan cakupan semua guru atau guru terpilih dengan konfirmasi sebelum menimpa.
- Per guru: ledger/status per tanggal serta catatan.
- Rekap: pilihan bulan/guru, hitungan status, CSV, dan cetak/Simpan PDF.
- Hari libur: tambah, ubah, hapus, dan perhitungan hari kerja.

Jangan menambah fitur presensi baru atau menghapus perilaku yang sudah ada. Data absensi local-first dan tidak otomatis sinkron antarp perangkat.

### 09. Riwayat & Versi

- Daftar snapshot/versi jadwal yang sudah ada.
- Status aktif/draft, tanggal, ringkasan, aksi restore sesuai implementasi.
- Restore harus memicu validasi ulang; jangan menganggap snapshot lama otomatis masih valid.

### 10. Backup & Restore

- Pertahankan ekspor/impor JSON, checksum, validasi struktur, konfirmasi restore.
- Jangan mengklaim data presensi sudah termasuk backup workspace jika implementasi belum melakukannya.

### 11. Pengaturan

- Hari aktif, periode/slot, identitas madrasah, Gemini opsional.
- Pengaturan harus dikelompokkan dengan label sederhana dan nilai saat ini jelas.
- Gemini OFF secara default. Aplikasi inti harus berjalan tanpa API key.

### 12. Ekspor PDF

- Pertahankan semua opsi cakupan dan pengaturan yang sudah ada: sekolah/kelas/guru, A4/F4, orientasi, layout, warna mapel, pemadatan nama, kop surat, rekap JP, tanda tangan, dan opsi dokumen jika tersedia di kode.
- Pastikan print/export tidak memotong kolom, kop, atau footer.
- Logo SIGNAL produk tidak boleh menggantikan logo resmi madrasah yang dipilih operator.

## 6. Aturan bisnis dan teknis — tidak boleh dirusak

- Stack: React 19 + TypeScript + Vite + Express.
- Penyimpanan local-first menggunakan IndexedDB; jangan menambah cloud database sebagai kewajiban.
- Jumat tetap termasuk hari belajar. Hari aktif mendukung Senin–Sabtu; ikuti konfigurasi yang dipilih operator.
- Batas awal maksimal 10 JP KBM per hari dapat diatur per hari.
- Pisahkan urutan `Jam ke-` dari jumlah `JP KBM`. Istirahat, upacara, religi, kegiatan lain bukan JP KBM.
- Slot non-KBM yang harus tetap dikenali meliputi Upacara, Istirahat, Religi, dan Kegiatan Lain. Slot blocking non-KBM tidak boleh ditimpa oleh mapel.
- Maksimal 3 JP mapel yang sama berturut-turut per kelas/hari adalah hard rule; blok 2 JP adalah preferensi lunak.
- Aturan guru multi-mapel sesudah jeda harus dipertahankan: 1 JP sebelum jeda membolehkan maksimal 3 JP sesudah jeda; 2 JP sebelum jeda maksimal 2 JP sesudah; 3 JP sebelum jeda maksimal 1 JP sesudah. Urutan sebelum jeda dari guru yang berbeda tidak boleh digabung sebagai satu rangkaian. Ikuti implementasi validator sebagai sumber otoritatif.
- Generator mencari kandidat; validator deterministik memutuskan validitas.
- Validasi ulang setelah edit, drag/drop, restore, dan sebelum publish.
- Publish hanya boleh dilakukan setelah validasi final berhasil. Pertahankan version snapshots.
- Gemini opsional, OFF secara default, dan tidak boleh menulis jadwal atau melewati validator.
- Jangan menaruh `GEMINI_API_KEY` di browser, `VITE_*`, localStorage, URL, atau repository.
- Tidak menambah autentikasi, cloud sync, AI assistant baru, atau fitur absensi baru.
- Jangan menghapus seed/demo tanpa tindakan eksplisit operator.

## 7. Struktur source yang harus dihormati

- `src/App.tsx` — shell, navigasi, screen composition.
- `src/components/AttendanceScreen.tsx` — lima tab presensi.
- `src/components/WorkloadDashboard.tsx` — analitik beban guru.
- `src/domain/types.ts`, `time.ts`, `generator.ts`, `validator.ts`, `seed.ts` — domain model dan rules.
- `src/storage/db.ts` — IndexedDB dan backup state.
- `src/utils/pdfExport.ts` dan modal PDF — ekspor dokumen.
- `server.ts`, `server/index.ts` — Express/Gemini optional endpoint.
- `tests/*` — regression suite.

Jangan mengasumsikan path baru dari versi sebelumnya. Audit file yang benar-benar ada sebelum mengedit.

## 8. Cara bekerja

1. Inventaris seluruh route/screen, action, modal, tab, dan state di source.
2. Jalankan test/build sebelum mengubah kode bila terminal tersedia. Catat baseline.
3. Bandingkan setiap screen dengan aturan visual dan UX di atas.
4. Perbaiki UI secara bertahap tanpa merombak domain/storage.
5. Periksa desktop, tablet, dan mobile; cek collapsed sidebar, overflow, focus, empty/loading/error/success states.
6. Jalankan `npm test` dan `npm run build` setelah perubahan. Perbaiki error yang berasal dari perubahan ini.
7. Periksa generator, validator, edit slot, publish, restore, presensi, backup, dan PDF secara manual/otomatis sejauh environment mendukung.
8. Laporkan file berubah, fitur yang diverifikasi, hasil test/build sebenarnya, dan risiko yang belum dites.

## 9. Larangan tegas

- Jangan membuat ulang aplikasi dari nol.
- Jangan mengganti project dengan mockup HTML statis.
- Jangan membuat semua plate/referensi menjadi halaman Beranda.
- Jangan menghapus atau mengurangi fungsi yang sudah ada.
- Jangan membuat angka/chart/rekap dummy sebagai hiasan.
- Jangan mengubah business rules agar mockup lebih mudah dibuat.
- Jangan mengklaim build, test, responsiveness, atau integrasi lulus tanpa benar-benar dijalankan.
- Jangan menambah dependency berbayar atau layanan cloud wajib.

**Prioritas tertinggi:** aplikasi SIGNAL tetap utuh dan berguna, tetapi semua permukaannya memiliki identitas visual Signature Jewel Luxury yang konsisten, modern, elegan, ekspresif, dan mudah dipakai operator.
