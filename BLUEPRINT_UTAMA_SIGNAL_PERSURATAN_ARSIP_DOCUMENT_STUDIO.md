# BLUEPRINT UTAMA SIGNAL V3.2 JEWEL LUXURY
## Integrasi Persuratan, Arsip Digital, Administrasi Penugasan Guru, dan Document Studio

**Dokumen acuan produk, UX/UI, arsitektur, data, implementasi, dan pengujian**  
**Target AI implementer:** Google AI Studio Build Mode / coding agent  
**Repository wajib:** `https://github.com/adizalmumtaz30/SIGNAL-V3-2-Jewel-Luxury`  
**Branch awal:** `main` (periksa keadaan aktual sebelum mengubah)  
**Prioritas perangkat:** desktop/laptop  
**Bahasa UI:** Bahasa Indonesia  
**Status dokumen:** spesifikasi usulan; bukan bukti fitur sudah diterapkan.

---

# 0. CARA MEMBACA DAN KEWENANGAN DOKUMEN

Dokumen ini adalah spesifikasi utama untuk memperluas SIGNAL. Gunakan bersama source code repository yang benar-benar terhubung di workspace. Source code yang ada adalah acuan kebenaran untuk keadaan implementasi; dokumen ini adalah acuan tujuan dan persyaratan fitur baru.

Urutan prioritas bila ada pertentangan:
1. Keselamatan data pengguna, integritas dokumen final, dan perlindungan data.
2. Fitur dan perilaku SIGNAL yang telah berjalan di repository.
3. Persyaratan eksplisit dalam blueprint ini.
4. Preferensi visual atau kemudahan implementasi.

Jangan membuat asumsi bahwa semua detail blueprint sudah ada dalam source. Audit kode terlebih dahulu, tandai perbedaan, lalu rencanakan perubahan sekecil mungkin.

**Istilah:**
- **Template:** pola dokumen yang dapat dipakai berulang.
- **Draft:** satu dokumen kerja yang kontennya bebas diubah.
- **Final:** versi dokumen yang telah diterbitkan/dikunci sesuai prosedur.
- **Revisi:** versi baru yang merujuk dokumen final sebelumnya; tidak menimpa versi lama.
- **Data awal/merge data:** nilai yang disalin dari Data Master, Pengaturan, jadwal, atau penugasan ke dalam draft pada saat draft dibuat.
- **Arsip:** indeks dan penyimpanan dokumen beserta metadata, lampiran, versi, serta hubungan antardokumen.
- **Local-first:** data utama disimpan pada perangkat/browser melalui penyimpanan lokal yang saat ini digunakan SIGNAL. Jangan menyebut data tersinkron ke cloud jika tidak ada sinkronisasi nyata.

# 1. RINGKASAN PRODUK DAN TUJUAN

Kembangkan SIGNAL V3.2 Jewel Luxury sebagai satu aplikasi terpadu untuk pengelolaan akademik dan administrasi madrasah. Tambahkan kemampuan Persuratan & Arsip Digital dan Administrasi Penugasan Guru tanpa membuat aplikasi baru, shell baru, dashboard paralel, sistem identitas terpisah, atau desain visual yang bertentangan dengan SIGNAL.

## 1.1 Tujuan bisnis/pengguna

Operator madrasah harus dapat:
1. Mencatat dan menelusuri surat masuk.
2. Membuat surat keluar, SK, surat tugas, undangan, surat keterangan, berita acara, notula, dan laporan.
3. Memilih template, menerima pengisian data awal dari SIGNAL, lalu mengubah seluruh isi surat secara bebas seperti menggunakan Microsoft Word.
4. Mengelola tabel, lampiran, halaman, header/footer, dan format cetak.
5. Menghasilkan preview dan PDF yang konsisten dengan tampilan editor.
6. Menyimpan draft, memfinalisasi, membuat revisi, dan mengarsipkan dokumen.
7. Mengelola penugasan guru dengan masa berlaku dan riwayat.
8. Membuat SK Pembagian Tugas berdasarkan jadwal yang telah diterbitkan, bukan dari draft atau kebutuhan perencanaan.
9. Menemukan dokumen dari pencarian dan Command Palette SIGNAL.
10. Membackup dan merestore metadata dan lampiran tanpa kehilangan integritas file.

## 1.2 Prinsip produk yang tidak boleh dilanggar

- Satu aplikasi SIGNAL; satu visual identity Jewel Luxury.
- Semua fitur akademik yang ada harus tetap berfungsi.
- Tambahkan hanya satu menu sidebar utama baru: **Persuratan & Arsip**.
- Administrasi Penugasan Guru ditempatkan kontekstual pada Data Master Guru, Jadwal, dan Beban Guru.
- Satu editor universal untuk seluruh jenis template.
- Isi surat benar-benar bebas diedit: teks, paragraf, tabel, gambar, susunan bagian, lampiran, dan format.
- Data otomatis adalah nilai awal yang disalin ke draft, bukan binding aktif yang menimpa hasil edit.
- Template induk, draft, dan dokumen final adalah entitas berbeda.
- Dokumen final bersifat immutable; koreksi melalui versi revisi/pengganti.
- Jangan menjanjikan kompatibilitas Microsoft Word 100% atau pagination sempurna sebelum diuji.
- Jangan mengarang kesesuaian hukum. Format naskah dinas harus diverifikasi terhadap regulasi dan ketentuan internal yang berlaku.

# 2. BATASAN REPOSITORY DAN AUDIT AWAL

## 2.1 Repository sasaran

`adizalmumtaz30/SIGNAL-V3-2-Jewel-Luxury`

Jangan menggunakan repository lain yang namanya mirip. Verifikasi owner, nama repository, branch aktif, dan commit HEAD sebelum memulai pekerjaan.

## 2.2 Fakta source yang telah ditinjau sebelumnya

Temuan awal berikut harus diverifikasi ulang terhadap HEAD terbaru sebelum tindakan:

- `src/App.tsx`: React app shell, `ScreenId`, navigasi sidebar, state workspace, dan interaksi utama.
- `src/domain/types.ts`: tipe `AppState`, `Teacher`, `ScheduleEntry`, `ScheduleVersion`, `AppSettings`, dan entitas akademik.
- `src/components/InspectorSlideDrawer.tsx`: drawer profil guru/kelas/mapel. Ini bukan editor dokumen.
- `src/components/WorkloadDashboard.tsx`: menghitung beban dari `state.draft ?? state.activeSchedule ?? []`.
- `src/components/SettingsScreen.tsx`: identitas madrasah dan penandatangan.
- `src/utils/pdfExport.ts`: jsPDF/AutoTable dan ekspor akademik, termasuk A4/F4 serta fungsi kop surat.
- `src/storage/db.ts`: IndexedDB, sebelumnya database `signal-academic-studio`, DB version 2, store `workspace`, `snapshots`, dan `audit_log`.
- `src/storage/snapshotEngine.ts`: snapshot/riwayat data.
- `src/components/CommandPaletteModal.tsx`: pencarian/aksi global.
- `src/main.tsx`: memuat CSS operasional, Atelier, Jewel Identity, schedule redesign, dan design tokens.
- `src/styles/signal-v3-atelier.css`: sidebar 252 px, collapsed 76 px, topbar 56 px, konten dengan padding 24 px, breakpoint 1024 px.
- `src/styles/signal-v3-jewel-identity.css` dan `src/styles/signal-v5-tokens.css`: identitas Jewel Luxury dan token warna.
- `package.json`: Vite, React 19, TypeScript, Express, IndexedDB via `idb`, jsPDF, dan jsPDF-AutoTable; periksa apakah dependency sudah berubah.

## 2.3 Temuan yang perlu diverifikasi dan ditangani

1. `Teacher.roleTitle` merupakan teks jabatan, tidak cukup untuk banyak penugasan dengan periode berbeda.
2. Beban pada dashboard dan ringkasan di drawer guru dapat memakai sumber data berbeda (`draft/activeSchedule` versus `requirements`). Pisahkan makna kebutuhan, draft, jadwal terbit, dan penugasan administratif.
3. Kemungkinan konflik shortcut `Ctrl+K` antara Command Palette global dan pencarian lokal Data Master. Audit semua listener dan tetapkan kebijakan keyboard yang tunggal.
4. IndexedDB belum memiliki store dokumen dan lampiran pada audit awal. Tambahkan migrasi versi yang tidak merusak data lama.
5. Fungsi backup menghitung checksum; jalur restore perlu memverifikasi checksum sebelum menerima payload. Periksa ulang implementasi terkini.
6. `pdfExport.ts` adalah fondasi ekspor akademik, bukan mesin layout dokumen Word. Jangan campurkan seluruh editor surat ke file ini.
7. Pengaturan berisi nilai demo/default. Jangan menganggap identitas demo sebagai identitas madrasah nyata; bedakan data demo dan data konfigurasi pengguna.

## 2.4 Larangan perubahan

Jangan:
- Mengganti seluruh `App.tsx` dengan aplikasi contoh baru.
- Menghapus/menyederhanakan fitur jadwal, generator, validator, presensi, Data Master, backup, atau settings.
- Mengubah desain sidebar dan topbar secara global tanpa alasan.
- Mengganti IndexedDB dengan backend/cloud database tanpa persetujuan dan migrasi eksplisit.
- Mengubah `AppState` lama secara breaking tanpa migration.
- Memasukkan seluruh file PDF/gambar sebagai base64 besar ke setiap snapshot workspace.
- Menaruh semua isi dokumen di `localStorage`.
- Menghasilkan PDF final dari layout yang tidak berhubungan dengan preview editor.

# 3. ARSITEKTUR INFORMASI DAN NAVIGASI

## 3.1 Sidebar

Pertahankan menu akademik yang ada. Tambahkan satu menu:

**Persuratan & Arsip**
- Surat Masuk
- Surat Keluar/Draft
- Arsip Digital
- Template (kelola sesuai hak akses)

Subbagian tersebut merupakan tab/route internal halaman Persuratan & Arsip, bukan menu sidebar terpisah.

Menu akademik lama tetap: Beranda, Jadwal Pelajaran, Data Master, Kebutuhan & Alokasi, Generator Jadwal, Validasi & Konflik, Beban Guru, Presensi Guru, Riwayat & Backup, Pengaturan. Nama sebenarnya harus disesuaikan pada source aktif; jangan menghapus item yang ada.

## 3.2 Administrasi Penugasan Guru

Tidak membuat menu sidebar baru. Integrasi dilakukan melalui:
- Data Master → detail Guru → aksi Kelola Penugasan / Dokumen Guru.
- Beban Guru → review sumber beban dan aksi Buat SK Pembagian Tugas.
- Jadwal Pelajaran → setelah jadwal dipublikasikan, aksi Buat SK dari versi jadwal terbit.

## 3.3 Peta layar

- S01: Pusat Persuratan & Arsip.
- S02: Galeri Template.
- S03: Form Data Awal/Context Form berdasarkan template.
- S04: Document Studio (editor bebas Word-like).
- S05: Preview dan Finalisasi.
- S06: Detail Dokumen/Arsip/Riwayat.
- S07: Pengelolaan Template.

## 3.4 Perpindahan konteks

Semua layar harus menjaga konteks. Ketika pengguna kembali dari S04 ke S03 atau S02, draft tidak hilang. Ketika membuka dokumen dari profil guru, tampilkan breadcrumb dan tautan kembali ke guru terkait.

# 4. SISTEM DESAIN DAN STANDAR DESKTOP-FIRST

## 4.1 Target viewport

- Utama: 1440 × 900 CSS px.
- Minimum desktop: 1280 × 720 CSS px.
- Tablet: 1024–1279 px dengan panel dapat dilipat.
- Mobile: akses lihat/pratinjau dan input ringan; bukan target utama penyuntingan dokumen panjang.

## 4.2 Shell

- S01–S03: sidebar normal 252 px; topbar 56 px; padding konten 24 px.
- S04: sidebar diciutkan ke 76 px selama editor aktif; simpan dan pulihkan preferensi sidebar sebelumnya setelah keluar.
- Jangan memaksa S04 masuk ke modal atau drawer.

## 4.3 Warna dan tipografi

Gunakan token CSS yang sudah ada (`signal-v3-atelier.css`, `signal-v3-jewel-identity.css`, `signal-v5-tokens.css`) setelah diverifikasi:
- Emerald/night untuk shell dan aksi utama.
- Heritage Gold untuk aksen dan fokus terpilih.
- Ivory/Alabaster untuk canvas aplikasi.
- White/Paper untuk lembar dokumen.
- Plus Jakarta Sans untuk UI.
- Font dokumen dikendalikan template; gunakan font umum yang kompatibel untuk hasil cetak.
- Fraunces hanya untuk elemen branding aplikasi, bukan badan surat resmi.

Jewel Luxury tidak dicetak sebagai ornamen pada badan surat. Surat harus formal, bersih, dan sesuai naskah dinas.

## 4.4 Aksesibilitas

- Kontras WCAG 2.2 AA minimal untuk teks normal 4.5:1 dan teks besar 3:1.
- Fokus keyboard terlihat.
- Target pointer minimal WCAG yang berlaku atau memenuhi pengecualian spacing.
- Warna tidak menjadi satu-satunya penanda status.
- Label form terlihat dan terhubung ke input.
- Dialog mengelola fokus dan mengembalikan fokus setelah ditutup.
- Tab, toolbar, menu, tabel, combobox, dan dialog mempunyai operasi keyboard yang benar.

# 5. SPESIFIKASI LAYAR S01–S04

## 5.1 S01 — Pusat Persuratan & Arsip

### Tujuan
Melihat status pekerjaan administrasi, membuat dokumen, mencari surat, dan mengakses arsip.

### Layout pada 1440 × 900
- Sidebar: x=0, w=252.
- Topbar: x=252, y=0, w=1188, h=56.
- Konten efektif: x=276, y=80, w=1140, h=796.
- Judul + deskripsi: y=80, h=48.
- Tombol Buat Dokumen: sisi kanan header, h=40.
- Empat statistik: y=148, h=92, gap 16; masing-masing 273 px.
- Search/filter: y=264, h=44.
- Tab kategori: y=324, h=36.
- Tabel/aktivitas: mulai y=376, mengisi sisa ruang.

### Statistik
- Surat Masuk.
- Surat Keluar.
- Draft.
- Arsip.

Jumlah harus berasal dari data aktual. Statistik dapat diklik untuk menerapkan filter.

### Filter dan pencarian
Cari nomor, judul, perihal, pihak terkait, guru, dan kata kunci lampiran yang tersedia. Filter minimal: jenis, status, tahun, tanggal, pihak terkait. Hindari menampilkan terlalu banyak filter tingkat lanjut secara default.

### Tabel desktop
Kolom: Nomor/ID, Nama Dokumen, Jenis, Tanggal, Pihak Terkait, Status, Aksi. Header sticky, sorting, pagination atau virtualized scrolling jika volume besar. Klik nama dokumen membuka S06. Aksi tambahan di menu konteks.

### Empty/loading/error states
- Empty: jelaskan belum ada dokumen dan berikan tombol Buat Dokumen.
- Loading: skeleton tabel.
- Error: pesan yang dapat ditindaklanjuti dan tombol coba lagi.
- Storage unavailable/full: peringatan; jangan berpura-pura draft tersimpan.

## 5.2 S02 — Galeri Template

### Tujuan
Menemukan template menurut tujuan pekerjaan.

### Layout 1440 px
Area konten 1140 px, tiga kolom:
- Kategori: 184 px.
- Gap: 24 px.
- Daftar template: 536 px.
- Gap: 24 px.
- Preview: 372 px.

### Fitur
- Search by name, purpose, category.
- Kategori: Penugasan, Korespondensi, Keterangan, Berita Acara, Notula/Laporan, Administrasi.
- Koleksi: Favorit, Terakhir Dipakai, Template Madrasah, Bawaan SIGNAL.
- Card menampilkan nama, deskripsi singkat, data otomatis, input yang diperlukan, kategori, dan versi.
- Preview menunjukkan halaman dokumen yang sebenarnya, bukan ilustrasi acak.
- Tombol Gunakan Template → S03.
- Dokumen Kosong → S04 dengan dokumen kosong.
- Impor DOCX → pemeriksaan file dan konversi; tampilkan batasan format sebelum lanjut.

### Perilaku
Template bawaan SIGNAL tidak diubah langsung. Pengguna membuat salinan untuk modifikasi. Favorit dan riwayat pemakaian tidak boleh menjadi duplikasi template.

## 5.3 S03 — Form Data Awal Dokumen

### Tujuan
Hanya meminta data yang belum diketahui sistem.

### Layout 1440 px
Area konten 1140 px:
- Form utama 792 px.
- Gap 24 px.
- Panel sumber data 324 px.
- Header 48 px.
- Indikator langkah 44 px.
- Action bar sticky bawah 64 px.

### Form Surat Tugas Pelatihan
1. Peserta: multi-select dari Data Master Guru/Tendik.
2. Nama kegiatan.
3. Penyelenggara.
4. Tanggal mulai dan selesai.
5. Tempat/lokasi.
6. Dasar penugasan (nomor/tanggal surat undangan; opsional atau wajib sesuai aturan template).
7. Lampiran undangan (PDF/JPG/PNG sesuai batas ukuran).
8. Pejabat/penandatangan yang berwenang.
9. Catatan khusus (opsional).

Panel kanan menampilkan sumber data: Identitas Madrasah, Data Master, Penugasan, Pengaturan. Tampilkan ringkasan peserta dan status kelengkapan.

### Validasi
- Minimal satu peserta.
- Tanggal akhir tidak sebelum tanggal mulai.
- Nama kegiatan dan penyelenggara wajib.
- Field wajib menurut template ditetapkan sebagai konfigurasi.
- Lampiran tidak wajib jika jenis dokumen tidak mensyaratkannya.
- Pesan error dekat field dan error summary di atas form.

### Perilaku Buat Draft
- Kloning template ke dokumen baru.
- Salin nilai sumber ke konten draft.
- Simpan provenance sumber dan waktu pengambilan nilai.
- Buat ID draft stabil.
- Buka S04.
- Jangan pertahankan live binding ke Data Master.

## 5.4 S04 — Document Studio

### Tujuan
Editor dokumen kaya fitur, desktop-first, dengan kebebasan penyuntingan seperti Word.

### Layout 1440 × 900
- Sidebar SIGNAL collapsed: 76 px.
- Topbar SIGNAL: y=0, h=56.
- Header dokumen: y=56, h=56.
- Ribbon: y=112, h=88 (tab 32 + toolbar 56).
- Workspace: y=200 sampai y=872.
- Outline kiri: x=76, w=184.
- Gap: 16 px.
- Kanvas: x=276, w=900.
- Gap: 16 px.
- Properti kanan: x=1192, w=248.
- Status bar: y=872, h=28.

### Header
Nama dokumen, jenis, status draft/final/revisi, status autosave yang nyata, tombol Preview, menu Lainnya, Finalisasi. Tombol utama tidak lebih dari tiga.

### Ribbon
- Beranda: font, ukuran, bold, italic, underline, warna, alignment, list, indent, style.
- Sisipkan: tabel, gambar, hyperlink, page break, nomor halaman, field/data SIGNAL.
- Tata Letak: A4/F4, orientasi, margin, header, footer, section break jika didukung.
- Tinjau: undo/redo, komentar, pemeriksaan, riwayat revisi/track changes bila tahap lanjut.

### Panel kiri
Tab Halaman (thumbnail) dan Struktur (outline heading). Klik item navigasi membawa scroll/kursor ke bagian terkait.

### Kanvas
Kertas putih di canvas abu muda. Zoom dapat diubah. A4/F4 portrait/landscape. Automatic page break, manual page break, header/footer, nomor halaman. Isi dapat diedit langsung.

Ukuran fisik target:
- A4: 210 × 297 mm.
- F4/Folio: 210 × 330 mm.

Gunakan CSS px ≈ 96 dpi untuk estimasi preview, tetapi PDF memakai ukuran fisik mm/inch yang benar. Zoom hanya mengubah tampilan, bukan ukuran cetak.

### Panel kanan
Tab Data/Sumber, Objek, Halaman. Konteks tab berubah sesuai seleksi: teks, tabel, gambar, atau halaman. Panel dapat ditutup.

### Status bar
Halaman aktif/total, jumlah kata, bahasa, status simpan, zoom, ukuran kertas. Informasi harus berdasarkan keadaan nyata.

### Fungsi editing minimum
- Rich text formatting.
- Copy/cut/paste dari Word dengan sanitasi format yang masuk akal.
- Undo/redo.
- Tabel: insert/delete row/column, merge/split, resize, border, shading, alignment horizontal/vertikal, header row.
- Gambar dan hyperlink.
- Header/footer.
- Page number.
- Page break.
- A4/F4 dan orientasi.
- Auto-save draft.
- Simpan dan buka kembali tanpa kehilangan konten/format.

### Kebebasan edit
Semua isi dokumen bisa diedit. Jangan mengunci kop, judul, konsideran, teks, tabel, lampiran, atau blok tanda tangan hanya karena dibuat dari template. Sistem boleh menampilkan warning bila modifikasi berpotensi menyalahi format; jangan menimpa teks pengguna secara diam-diam.

### Data source merge
Nilai Data Master/Settings/Jadwal disalin saat draft dibuat. Setelah masuk editor, konten menjadi milik draft. Perubahan sumber tidak mengubah draft otomatis. Tombol `Bandingkan Perubahan Data` menampilkan diff dan meminta operator memilih nilai yang ingin diperbarui. Tombol reset harus spesifik per field/selection, bukan reset seluruh dokumen tanpa konfirmasi.

### Shortcut
- Ctrl/Cmd+S: simpan draft, cegah dialog browser.
- Ctrl/Cmd+Z: undo.
- Ctrl/Cmd+Y atau Ctrl/Cmd+Shift+Z: redo, sesuai engine.
- Ctrl/Cmd+B/I/U: formatting.
- Ctrl/Cmd+K: hyperlink ketika editor fokus.
- Ctrl/Cmd+Shift+P: Command Palette SIGNAL.
- Escape: tutup popover/menu/dialog bila aman.

Shortcut editor tidak boleh menangkap ketikan pada input lain. Satukan handler global agar tidak ada konflik dengan Data Master.

## 5.5 S05 — Preview dan Finalisasi

- Mode preview read-only; ribbon editing disembunyikan.
- Kertas persis sesuai setting.
- Panel kanan berisi checklist administrasi dan cetak.
- Kesalahan memiliki link ke bagian editor terkait.
- Konfirmasi finalisasi menampilkan ringkasan nomor, tanggal, penandatangan, jumlah halaman, lampiran, dan sumber jadwal (bila relevan).
- Nomor surat dialokasikan menurut aturan penomoran dan kewenangan ketika finalisasi; tidak menghabiskan nomor pada draft batal.
- Setelah final, simpan snapshot konten final, metadata, file PDF, checksum, versi template, versi jadwal sumber jika ada, dan audit event.

## 5.6 S06 — Detail Dokumen dan Arsip

Tab: Dokumen, Metadata, Lampiran, Riwayat.
- Preview dan unduh PDF.
- Metadata nomor, tanggal, jenis, pihak terkait, klasifikasi, status, retensi.
- Lampiran dengan checksum dan ukuran.
- Riwayat perubahan, versi, pembuat, waktu, alasan revisi.
- Dokumen final tidak bisa diedit langsung; tombol Buat Revisi menghasilkan versi baru yang menunjuk dokumen induk.

## 5.7 S07 — Pengelolaan Template

- Bawaan SIGNAL: read-only; untuk modifikasi, kloning.
- Template Madrasah: dikelola pengguna yang berwenang.
- Favorit/pribadi: koleksi pengguna/perangkat bila belum ada multi-user.
- Nama, kategori, deskripsi, versi, status aktif, pembuat, tanggal diperbarui.
- Simpan hasil dokumen sebagai template baru harus membersihkan nilai personal seperti nama guru, NIP, nomor, tanggal, dan kegiatan menjadi placeholder.
- Template versi lama tidak berubah untuk dokumen yang sudah dibuat.

# 6. KATALOG TEMPLATE AWAL

Satu editor universal dengan profil/konfigurasi berbeda. Mulai dengan template prioritas berikut.

## 6.1 Penugasan dan keputusan
1. Surat Tugas Menghadiri Pelatihan/Bimtek/Workshop.
2. Surat Tugas Kegiatan Dinas/Rapat/Monitoring.
3. SK Pembagian Tugas Mengajar Guru.
4. SK Tugas Tambahan Guru (wali kelas, pembina, koordinator, dan seterusnya).
5. SK Pembentukan Panitia.
6. Surat Tugas Pengawas/Panitia Ujian.

## 6.2 Korespondensi
7. Surat Undangan Rapat.
8. Surat Dinas Keluar.
9. Surat Pemberitahuan/Pengumuman.
10. Nota Dinas/Memorandum, bila relevan dengan kewenangan dan ketentuan.

## 6.3 Keterangan dan pengantar
11. Surat Keterangan Aktif Mengajar.
12. Surat Keterangan Tugas Guru.
13. Surat Pengantar Dokumen.
14. Surat Keterangan Siswa.
15. Surat Rekomendasi, sesuai kewenangan.

## 6.4 Berita acara dan laporan
16. Berita Acara Serah Terima.
17. Berita Acara Rapat.
18. Berita Acara Ujian.
19. Notula Rapat.
20. Laporan Kegiatan.
21. Laporan Hasil Pelatihan/Perjalanan.
22. Laporan Pelaksanaan Ujian.

## 6.5 Template operasional madrasah
23. Surat Permohonan Izin Kegiatan.
24. Surat Permohonan Narasumber.
25. Surat Undangan Wali Murid.
26. Surat Panggilan Orang Tua/Wali.
27. Surat Pemberitahuan kepada Orang Tua.
28. Surat Permohonan Kerja Sama.
29. Surat Pernyataan.
30. Template Dokumen Kosong dengan kop opsional.

Daftar ini adalah katalog kebutuhan produk, bukan pernyataan semua nama tersebut merupakan nomenklatur naskah dinas resmi yang berdiri sendiri. Bentuk, struktur, penandatanganan, dan penggunaan harus diverifikasi menurut PMA 12/2026, aturan turunan, kewenangan madrasah, dan ketentuan internal.

# 7. ADMINISTRASI PENUGASAN GURU

## 7.1 Model penugasan terpisah dari Teacher

Jangan menggunakan satu `roleTitle` untuk semua riwayat.

Entitas konseptual `TeacherAssignment`:
- id
- teacherId
- assignmentType (TEACHING, HOMEROOM, ADDITIONAL_DUTY, COMMITTEE, TRAINING, OTHER)
- title/positionName
- description
- startDate
- endDate nullable
- academicYear
- semester nullable
- classId nullable
- subjectIds/teaching references bila diperlukan
- weeklyJP nullable
- status (DRAFT, ACTIVE, COMPLETED, CANCELLED)
- sourceType (PUBLISHED_SCHEDULE, MANUAL, IMPORTED)
- sourceScheduleVersionId nullable
- documentId nullable
- createdAt, updatedAt

Satu guru dapat memiliki beberapa tugas dan histori yang tumpang-tindih hanya jika aturan mengizinkan. Validasi dan peringatan harus jelas.

## 7.2 Sumber beban dan penugasan

Bedakan:
- Requirements = kebutuhan perencanaan.
- Draft schedule = rancangan belum terbit.
- Published schedule = jadwal aktif yang sudah diterbitkan.
- Teacher assignment = rekaman administrasi penugasan.

SK resmi pembagian tugas mengajar hanya boleh mengambil basis dari `ScheduleVersion` yang sudah dipublikasikan dan tervalidasi. Tampilkan nomor/ID versi, tanggal terbit, fingerprint, tahun ajaran, semester, dan jumlah entri sumber.

## 7.3 Alur SK Pembagian Tugas

1. Buka Jadwal/Beban Guru.
2. Pastikan jadwal sudah dipublikasikan.
3. Pilih Buat SK Pembagian Tugas.
4. Sistem mengambil snapshot data dari ScheduleVersion tertentu.
5. Tampilkan pemeriksaan: guru aktif, mapel, kelas, JP, distribusi, data penandatangan, dan lampiran.
6. Buat draft di S04.
7. Bebas edit naskah dan lampiran.
8. Preview/finalisasi.
9. Simpan relasi ke versi jadwal sumber.

Jika jadwal kemudian berubah, dokumen final lama tidak ikut berubah. Buat dokumen revisi/pengganti jika diperlukan.

## 7.4 Data Guru

Perluasan konteks pada Data Master:
- Profil.
- Penugasan aktif.
- Riwayat penugasan.
- Dokumen terkait.

Jangan menjejalkan semua detail ke InspectorSlideDrawer. Drawer tetap untuk edit cepat profil; kelola penugasan/dokumen membuka konteks khusus.

# 8. MODEL DATA DOKUMEN

Gunakan tipe kuat TypeScript. Nama dapat disesuaikan setelah audit kode. Ini model konseptual, bukan wajib menyalin secara membabi buta.

## 8.1 DocumentTemplate

- id, code, name, category, description
- version, status, source (SYSTEM/MADRASAH/USER)
- contentSchema/documentJSON
- initialPageSettings
- requiredFields/validationRules
- mergeFieldDefinitions
- createdAt, updatedAt

## 8.2 DocumentRecord

- id, documentNumber nullable sebelum final
- title, documentType, category
- status (DRAFT, REVIEW, FINAL, REVISED, ARCHIVED, CANCELLED)
- templateId, templateVersion
- contentJSON (format editor terstruktur)
- plainTextIndex
- pageSettings (paper, orientation, margins)
- sender, recipients, relatedTeacherIds, relatedAssignmentIds
- createdAt, updatedAt, createdBy/localActor
- finalizedAt, finalizedBy nullable
- parentDocumentId nullable
- currentVersionId
- sourceSnapshot/provenance metadata
- classificationCode nullable
- retentionCategory nullable
- accessLevel

## 8.3 DocumentVersion

- id, documentId, versionNumber
- status, contentJSON immutable setelah final
- documentNumber snapshot
- pdfAttachmentId nullable
- templateVersion
- sourceScheduleVersionId nullable
- createdAt, createdBy, revisionReason nullable
- contentChecksum, pdfChecksum

## 8.4 DocumentAttachment

- id, documentId, versionId nullable
- filenameOriginal, filenameStored
- mimeType, sizeBytes
- blob/storageKey
- checksumSHA256
- category (SOURCE, FINAL_PDF, SUPPORTING, CERTIFICATE, OTHER)
- createdAt, notes

## 8.5 TeacherAssignment

Gunakan definisi pada Bagian 7.1.

## 8.6 AuditEvent

- id, entityType, entityId
- action
- actor/localActor
- timestamp
- summary
- previousChecksum/newChecksum bila relevan

Hindari menyimpan salinan konten sensitif berulang di audit log jika tidak dibutuhkan. Terapkan retensi audit yang sesuai kebijakan.

# 9. PENYIMPANAN, FILE, BACKUP, DAN RESTORE

## 9.1 Local-first

Pertahankan pola IndexedDB SIGNAL selama belum disepakati arsitektur lain. Lakukan upgrade DB version dengan migrasi yang idempotent dan mempertahankan store lama.

Object store konseptual:
- workspace (yang sudah ada)
- snapshots (yang sudah ada)
- audit_log (yang sudah ada)
- documents
- document_versions
- document_templates
- document_attachments
- teacher_assignments

Buat index menurut documentNumber, status, type, date, updatedAt, teacherId, templateId, parentDocumentId jika bermanfaat.

## 9.2 Lampiran

- Simpan file sebagai Blob di object store khusus, bukan sebagai base64 di setiap AppState snapshot.
- Metadata dan Blob memiliki relasi yang stabil.
- Validasi ekstensi, MIME, ukuran, serta file signature bila dapat dilakukan.
- Batasi format upload yang dibutuhkan, misalnya PDF/JPG/PNG/DOCX untuk alur terkait.
- Jangan merender file yang tidak dipercaya sebagai HTML aktif.
- Gunakan nama internal acak/ID; simpan nama asli hanya sebagai metadata.
- Tampilkan ukuran dan status integritas.

## 9.3 Backup

Format backup perlu versioned:
- manifest (format, schemaVersion, appVersion, createdAt)
- workspace snapshot
- documents metadata
- document versions
- templates (sesuai opsi)
- attachment blobs atau paket berkas terpisah
- checksum SHA-256 per file dan manifest

Restore harus:
1. Membaca dan memvalidasi format/schema.
2. Memverifikasi checksum sebelum memasukkan data.
3. Menampilkan ringkasan jumlah workspace, dokumen, lampiran, dan konflik.
4. Meminta konfirmasi.
5. Memproses dalam transaksi IndexedDB bila memungkinkan.
6. Mengembalikan state lama bila transaksi gagal.
7. Melaporkan kegagalan file secara eksplisit.

Checksum bukan enkripsi, autentikasi, atau tanda tangan elektronik.

## 9.4 Local-first warning

Tampilkan jelas bahwa data disimpan pada browser/perangkat saat ini. Sediakan backup ekspor. Jika pengguna berpindah browser/perangkat, data lokal tidak otomatis tersedia.

# 10. NOMOR SURAT, FINALISASI, DAN REVISI

- Draft tidak mengunci nomor resmi.
- Aturan penomoran dapat dikonfigurasi per jenis surat/tahun/klasifikasi sesuai kebijakan lembaga.
- Nomor hanya dialokasikan pada proses finalisasi yang berhasil.
- Cegah duplikasi dalam lingkup penyimpanan yang diketahui. Pada mode multi-device tanpa server, jangan klaim keunikan global.
- Finalisasi harus atomic sejauh kemampuan penyimpanan.
- Final document content tidak boleh diubah.
- Revisi menghasilkan DocumentVersion baru dengan parent/reference ke versi sebelumnya.
- Simpan alasan revisi, tanggal, pembuat, dan hubungan ke dokumen pengganti bila ada.
- Pembatalan final harus menjadi status/event terjejak, bukan penghapusan diam-diam.

# 11. DOCUMENT RENDERING DAN PDF

## 11.1 Prinsip rendering

Editor, preview, dan PDF harus menggunakan sumber content model dan page layout yang konsisten. Hindari implementasi yang menghasilkan preview dari editor tetapi membangun ulang isi PDF dari teks/HTML berbeda sehingga tata letak melenceng.

## 11.2 Format

- A4 portrait/landscape.
- F4/Folio portrait/landscape.
- Margin per template dan dapat disesuaikan sebelum final.
- Header/footer dan nomor halaman.
- Logo/kop madrasah dari Settings sebagai nilai awal.
- Tanda tangan sebagai blok yang bisa diedit/diatur sesuai kewenangan.
- Tabel berulang header ketika lintas halaman jika didukung mesin.
- Baris tabel tidak terpotong secara buruk.
- Gambar mempertahankan rasio aspek.

## 11.3 Proof of concept editor

Sebelum memilih library atau mengunci dependency:
1. Periksa lisensi, harga, status beta/stabil, batasan pagination, DOCX, PDF, dan tabel.
2. Jangan memasang dependency berbayar/proprietary tanpa persetujuan eksplisit.
3. Jangan memilih teknologi berdasarkan tampilan toolbar saja.
4. Bangun proof of concept dan bandingkan editor, preview, PDF, serta DOCX pada skenario di Bagian 15.
5. Dokumentasikan keterbatasan yang tidak dapat dipenuhi.

## 11.4 DOCX

Impor DOCX merupakan fitur P1. Beri peringatan bahwa beberapa format/objek kompleks mungkin berubah. Sediakan hasil pemeriksaan dan biarkan pengguna meninjau sebelum disimpan sebagai template/draft. Ekspor DOCX tidak boleh diklaim tersedia sebelum diuji.

# 12. KEAMANAN, PRIVASI, DAN KEPATUHAN

- Jangan memasukkan data demo sebagai data madrasah nyata.
- Hindari menampilkan NIP/NUPTK/identitas pribadi pada daftar yang tidak memerlukannya.
- Batasi akses template, finalisasi, pembatalan, dan penghapusan sesuai peran jika sistem memiliki autentikasi/role.
- File upload divalidasi; batasi ukuran/tipe dan jangan percaya hanya pada MIME browser.
- Backup yang berisi data personal harus diperlakukan sebagai data sensitif.
- Jangan menyebut checksum sebagai enkripsi.
- Jangan mengklaim fitur tanda tangan elektronik tersertifikasi tanpa integrasi layanan/sertifikat yang sah.
- Jangan menghapus arsip berdasarkan umur file semata. Retensi mengikuti JRA/kebijakan yang berlaku.
- PMA Nomor 12 Tahun 2026 tentang Tata Naskah Dinas pada Kementerian Agama harus diperiksa dari naskah resmi dan ketentuan turunannya untuk jenis, bentuk, pembuatan, penandatanganan, pengamanan, pengendalian, dan pengelolaan naskah dinas.
- UU 43/2009 dan PerANRI 6/2021 menjadi referensi umum kearsipan dan arsip elektronik. Jangan menyimpulkan kepatuhan hukum otomatis hanya karena aplikasi memiliki menu arsip.
- Jika ada ketidakjelasan hukum, tandai sebagai perlu verifikasi pemilik/pihak berwenang; jangan mengarang nomor pasal atau format wajib.

# 13. COMMAND PALETTE DAN BERANDA

## 13.1 Command Palette

Satukan shortcut global. Tambahkan pencarian:
- Nama dokumen.
- Nomor surat.
- Perihal.
- Nama guru.
- Nama template.

Aksi cepat:
- Buat Surat Masuk.
- Buat Surat Keluar.
- Buat Surat Tugas.
- Buat SK Pembagian Tugas.
- Cari Arsip.
- Kelola Template.

Jangan duplikasi search engine yang tidak sinkron. Gunakan service pencarian bersama.

## 13.2 Beranda

Tambahkan panel kecil Tindakan Administrasi hanya jika membantu:
- Surat masuk perlu tindak lanjut.
- Draft surat keluar.
- Penugasan guru perlu diperiksa.
- Dokumen menunggu finalisasi.

Setiap angka berdasarkan data aktual dan dapat diklik menuju daftar yang difilter. Jangan membuat dashboard kedua atau memenuhi beranda dengan kartu statistik baru.

# 14. IMPLEMENTATION PLAN BERURUTAN

Pengerjaan bertahap. Jangan mengimplementasikan semua sekaligus tanpa audit, build, dan test di setiap tahap.

## Tahap 0 — Audit read-only

- Verifikasi repo/branch/commit.
- Periksa struktur direktori, App.tsx, types, database, PDF, CSS, package, tests.
- Catat fitur lama dan alurnya.
- Catat konflik state, shortcut, dan backup.
- Buat rencana file per tahap.
- Belum mengubah kode.

Output: audit report, risiko, file plan, daftar acceptance criteria.

## Tahap 1 — Model domain dan migrasi data

- Finalisasi model DocumentTemplate, DocumentRecord, DocumentVersion, DocumentAttachment, TeacherAssignment, AuditEvent.
- Tambah migrasi IndexedDB yang backward-compatible.
- Uji baca/tulis state lama dan restore backup lama.
- Belum membangun editor penuh.

## Tahap 2 — Pusat Persuratan S01

- Tambah satu ScreenId/menu.
- Tabel, statistik nyata, search/filter, empty/error/loading.
- Pastikan menu lama tidak berubah.

## Tahap 3 — Galeri Template S02

- Registri template awal.
- Kategori, search, favorite, preview, clone.
- Template bawaan read-only.

## Tahap 4 — Context Form S03

- Bangun konfigurasi form per template.
- Implementasi multi-select guru dan validasi.
- Buat draft dan snapshot nilai sumber.

## Tahap 5 — Proof of concept S04

- Evaluasi kandidat editor.
- Uji rich text, paste, table, pagination, A4/F4, header/footer, PDF/DOCX.
- Dokumentasikan lisensi dan biaya.
- Jangan mengintegrasikan kandidat yang belum lulus.

## Tahap 6 — S04 editor dasar

- Editor canvas, toolbar, outline, properties, status.
- Undo/redo, autosave, format teks.
- Buka/tutup draft.

## Tahap 7 — S04 tabel dan multi-halaman

- Tabel kompleks.
- Pagination.
- Header/footer.
- Gambar.
- Page breaks.
- Uji skenario Bagian 15.

## Tahap 8 — S05 preview, finalisasi, versi

- Preview hasil cetak.
- Checklist validasi.
- Penomoran.
- Snapshot final.
- Revision workflow.

## Tahap 9 — Penugasan Guru

- Integrasi Data Master.
- TeacherAssignment.
- Riwayat masa tugas.
- Link SK/surat tugas.
- ScheduleVersion sebagai sumber SK mengajar.

## Tahap 10 — Arsip S06, Template S07, backup

- Detail dokumen.
- Relasi dan pencarian arsip.
- Pengelolaan template.
- Attachment store.
- Backup/restore checksum.

## Tahap 11 — Polishing dan regression

- Command Palette.
- Beranda.
- Aksesibilitas.
- Responsive tablet.
- Regression semua fitur akademik.
- Build/test final.

# 15. TEST MATRIX DAN ACCEPTANCE CRITERIA

## 15.1 Uji dokumen editor

A. Surat Tugas satu halaman: kop, judul, isi, peserta, tanda tangan.

B. Surat Tugas kolektif 3–5 halaman: 25–40 peserta dan lampiran.

C. SK 100–120 baris: tabel nomor, nama, NIP, kelas, mapel, JP; header berulang pada halaman berikutnya.

D. Tabel kompleks: merge/split cells, sel tinggi, teks panjang, beberapa paragraf, lebar kolom berbeda.

E. Dokumen gambar/footer: logo, lampiran gambar, nomor halaman, blok tanda tangan.

F. Format A4 portrait, F4 portrait, A4 landscape, F4 landscape.

## 15.2 Acceptance utama

- Tidak ada teks hilang.
- Urutan konten tetap.
- Tidak ada row/column hilang.
- Header tabel diulang bila fitur didukung.
- Tidak ada pagination loop, infinite loading, atau editor freeze.
- Tidak ada teks/gambar terpotong tanpa peringatan.
- Preview dan PDF konsisten.
- Save/reopen mempertahankan konten dan format.
- Mengubah Data Master tidak mengubah draft secara diam-diam.
- Final document immutable.
- Backup dan restore mempertahankan dokumen dan lampiran.

## 15.3 Regression akademik

Uji semua fungsi SIGNAL lama:
- Beranda.
- Data Master guru/kelas/mapel.
- Kebutuhan dan alokasi.
- Generator jadwal.
- Validasi dan konflik.
- Jadwal draft/terbit.
- Beban guru.
- Presensi.
- Riwayat/snapshot.
- Backup/restore.
- Pengaturan identitas.

## 15.4 Quality gates per tahap

Setiap tahap harus:
1. Lulus TypeScript/build.
2. Lulus lint sesuai script repository.
3. Lulus unit/integration test relevan.
4. Tidak menimbulkan regression fitur lama.
5. Memeriksa tampilan pada 1440×900 dan 1280×720.
6. Melaporkan file yang diubah, hasil tes, risiko tersisa, dan keputusan yang diperlukan.

Jangan mengaku tes lulus bila belum dijalankan. Jangan mengklaim deploy/push bila belum dikonfirmasi platform.

# 16. REFERENCE LINKS

## Repository
- https://github.com/adizalmumtaz30/SIGNAL-V3-2-Jewel-Luxury
- https://github.com/adizalmumtaz30/SIGNAL-V3-2-Jewel-Luxury/blob/main/src/App.tsx
- https://github.com/adizalmumtaz30/SIGNAL-V3-2-Jewel-Luxury/blob/main/src/domain/types.ts
- https://github.com/adizalmumtaz30/SIGNAL-V3-2-Jewel-Luxury/blob/main/src/storage/db.ts
- https://github.com/adizalmumtaz30/SIGNAL-V3-2-Jewel-Luxury/blob/main/src/utils/pdfExport.ts
- https://github.com/adizalmumtaz30/SIGNAL-V3-2-Jewel-Luxury/blob/main/src/components/CommandPaletteModal.tsx

## Google AI Studio
- https://ai.google.dev/gemini-api/docs/aistudio-build-mode
- https://ai.google.dev/gemini-api/docs/aistudio-agents

## UX dan aksesibilitas
- https://www.nngroup.com/articles/ten-usability-heuristics/
- https://www.w3.org/TR/WCAG22/
- https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/
- https://www.w3.org/WAI/ARIA/apg/patterns/tabs/
- https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- https://design-system.service.gov.uk/components/error-summary/
- https://design-system.service.gov.uk/components/file-upload/

## Editor dan dokumen
- https://tiptap.dev/docs/editor/getting-started/overview
- https://tiptap.dev/docs/editor/extensions/tables
- https://tiptap.dev/docs/pages/getting-started/overview
- https://tiptap.dev/docs/pages/core-concepts/limitations
- https://tiptap.dev/docs/conversion/getting-started/overview

## Regulasi dan arsip
- https://peraturan.bpk.go.id/Details/353924/peraturan-menag-no-12-tahun-2026
- https://peraturan.bpk.go.id/Details/192784/peraturan-anri-no-6-tahun-2021
- https://peraturan.bpk.go.id/Details/38754/uu-no-43-tahun-2009

---

# 17. PERINTAH AKHIR UNTUK AI IMPLEMENTER

Sebelum melakukan coding, baca dokumen ini sampai selesai dan audit repository yang benar. Jangan membuat aplikasi baru. Jangan memulai dari S04 sebelum model data, storage migration, dan alur S01–S03 dipahami. Kerjakan secara bertahap sesuai Implementation Plan. Jika ada fitur yang tidak dapat dipenuhi oleh library atau platform, jelaskan dan sediakan alternatif yang dapat diuji. Pertahankan setiap fitur SIGNAL lama. Laporkan semua perubahan dan hasil pengujian secara jujur.
