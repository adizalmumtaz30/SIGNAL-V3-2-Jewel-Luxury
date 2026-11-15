# HASIL AUDIT PERSURATAN & ARSIP DIGITAL — SIGNAL V3.2 JEWEL LUXURY

> Dokumen audit teknis. File ini diperbarui setiap kali audit dijalankan. Entri audit terbaru berada paling atas.

## Ringkasan Terakhir
- **Status terbaru:** **PHASE-2 Selesai** (Pusat Persuratan & Arsip S01 + 1 Menu Sidebar `Persuratan & Arsip` + Fondasi Metadata `AppState.documents`)
- **Tanggal dan jam selesai:** Minggu, 15 November 2026, pukul 22:56:27 WIB (`2026-11-15T22:56:27+07:00`)
- **Perubahan temuan terkait (`PERS-*` / `BP-*`):** `BP-005` & `BP-007` **SESUAI BLUEPRINT** (menu tunggal & layar S01 selesai); `BP-015` **SEBAGIAN** (tab Surat Masuk aktif); `BP-018` & `PERS-001` **SEBAGIAN** (`DocumentRecord` S01 & shell S01 selesai; S02–S07 dijadwalkan pada Tahap 3–10).
- **Hasil verifikasi akhir:** `npm run lint` (`tsc -b`) Exit `0` · `npm test` **11/11 file, 66/66 tests lulus** (37 lama + 19 Tahap 1 + 10 Tahap 2) · `npm run build` Exit `0` (`1863` modul, `7.05s`)
- **Status verifikasi repository:** Tidak dapat diverifikasi dari `.git` lokal (direktori `.git` tidak tersedia di container `/app/applet`; verifikasi identitas dari file workspace)
- **Status sinkronisasi GitHub:** Perubahan hanya tersimpan di workspace AI Studio (`/app/applet`); **belum di-commit atau di-push** ke repository GitHub `adizalmumtaz30/SIGNAL-V3-2-Jewel-Luxury`

## Daftar Riwayat Audit

| ID Audit | Mulai (WIB) | Selesai (WIB) | Status | Temuan Kritis | Tinggi | Sedang | Rendah | Info | Commit/Revision |
|---|---|---|---|---:|---:|---:|---:|---:|---|
| PHASE-2 | 2026-11-15 22:47:29 WIB | 2026-11-15 22:56:27 WIB | Selesai (Tahap 2) | 0 baru (`PERS-001` Tahap 2 S01 selesai) | `BP-005`, `BP-007` selesai | `BP-015`, `BP-018` sebagian | — | — | Tidak tersedia (tanpa `.git`) |
| PHASE-1 | 2026-11-15 22:11:18 WIB | 2026-11-15 22:17:50 WIB | Selesai (Tahap 1) | 0 baru (`PERS-003` selesai) | `PERS-006` fondasi selesai | — | — | — | Tidak tersedia (tanpa `.git`) |
| AUDIT #01 | 2026-11-15 21:51:28 WIB | 2026-11-15 21:52:56 WIB | Selesai | 2 | 5 | 3 | 1 | 1 | Tidak tersedia (tanpa `.git`) |

---

## IMPLEMENTASI TAHAP 2 — PUSAT PERSURATAN & ARSIP (S01)

- **ID Entri:** `PHASE-2`
- **Status Pelaksanaan:** **SELESAI** (Menu tunggal `Persuratan & Arsip`, layar S01 Pusat Persuratan & Arsip, dan fondasi metadata minimum `AppState.documents` terimplementasi dan teruji; S02–S07 sengaja ditunda ke Tahap 3–10)
- **Waktu mulai:** Minggu, 15 November 2026, pukul 22:47:29 WIB (`2026-11-15T22:47:29+07:00`)
- **Waktu selesai:** Minggu, 15 November 2026, pukul 22:56:27 WIB (`2026-11-15T22:56:27+07:00`)
- **Zona waktu:** Asia/Jakarta (WIB, UTC+07:00)
- **Status verifikasi repository:** Tidak dapat diverifikasi dari `.git` lokal (direktori `.git` tidak ditemukan di `/app/applet`; identifikasi proyek berdasarkan `package.json`, `metadata.json`, dan `BLUEPRINT_UTAMA_SIGNAL_PERSURATAN_ARSIP_DOCUMENT_STUDIO.md`).

### 2.1 Ringkasan Perubahan Teknis

#### A. Model Metadata Minimum & Penyimpanan Terpusat (`src/domain/persuratan/`, `src/domain/types.ts`, `src/domain/seed.ts`, `src/storage/db.ts`)
1. **Model & Selektor Persuratan (`src/domain/persuratan/types.ts` & `selectors.ts`)**:
   - Mendefinisikan `DocumentDirection`, `DocumentStatus`, `DocumentKind`, `DocumentRecord`, `CorrespondenceTab`, `CorrespondenceSortKey`, `SortDirection`, `CorrespondenceFilterState`, dan `CorrespondenceStats`.
   - Menyediakan fungsi deterministik murni: `computeCorrespondenceStats()` (dengan deduplikasi ID di dalam tiap kartu), `collectAvailableYears()`, `getRelatedTeacherNames()` (hanya nama pendidik tanpa mengekspos NIP/NPK), `filterCorrespondenceDocuments()`, `sortCorrespondenceDocuments()`, `paginateCorrespondenceDocuments()`, serta `formatIndonesianDate()`.
2. **Integrasi Skema `AppState.documents` Tanpa Data Palsu**:
   - Menambahkan `documents?: DocumentRecord[]` pada `AppState` (`src/domain/types.ts`) dan menginisialisasi `documents: []` di `createDemoState()` maupun `createEmptyState()` (`src/domain/seed.ts`) tanpa menyisipkan satu pun dokumen contoh palsu.
   - Karena `documents` tersimpan di `AppState` sebagai sumber kebenaran tunggal pada Tahap 2, metadata dokumen otomatis terlindungi oleh backup SHA-256 JSON (`SIGNAL-LOCAL-BACKUP`), `.signal` (`SIGNAL-V5-SEAL`), Time Machine snapshot, dan `restoreWorkspaceSafely()`.
   - Memperbarui `validateAppStateStructure()` dan `migrateAppStateSchema()` (`src/storage/db.ts`) secara non-destruktif & idempoten (`documents` lama yang belum ada dinormalisasi menjadi `[]` sesudah verifikasi SHA-256 selesai, sehingga backup format Tahap 1 tetap terverifikasi SHA-256 100%).

#### B. Layar S01 & Integrasi Shell SIGNAL (`src/components/persuratan/CorrespondenceCenter.tsx`, `CorrespondenceCenter.css`, `src/App.tsx`)
1. **Menu Tunggal di Sidebar (`src/App.tsx`)**:
   - Menambahkan tepat **1 item menu** `'persuratan'` berlabel **Persuratan & Arsip** pada `OPERASIONAL UTAMA` menggunakan shell `SIGNAL` yang ada, tanpa memodifikasi atau memindah menu akademik eksisting.
   - Melacak kegagalan `saveAppState()` secara eksplisit via state `storageError` + aksi `retrySaveWorkspace` yang diteruskan ke S01 agar banner peringatan & tombol `"Coba Simpan Ulang"` bekerja nyata tanpa klaim tersimpan palsu.
2. **Komponen S01 (`CorrespondenceCenter.tsx` & `CorrespondenceCenter.css`)**:
   - **Header & CTA Jujur**: Judul *Pusat Persuratan & Arsip* dengan tombol `"Buat Dokumen"` yang membuka modal informasi aksesibel bahwa Galeri Template (S02), Form Data Awal (S03), dan Document Studio (S04) diaktifkan pada Tahap 3–6 (tanpa membuat draft palsu).
   - **4 Kartu Statistik Nyata yang Dapat Diklik**: *Surat Masuk*, *Surat Keluar*, *Draft*, dan *Arsip* dengan angka tabular (`.s5-tnum`) serta penanda aktif teks + border (tidak bergantung pada warna saja).
   - **4 Tab Kategori Internal & Bilah Pencarian/Filter**: Tab *Semua*, *Surat Masuk*, *Surat Keluar*, dan *Arsip* (`role="tablist"`/`role="tab"`), input pencarian nomor/ID/judul/perihal/pihak terkait/nama guru/tag (**tanpa NIP**), filter arah/status/tahun, panel *Filter Lanjutan* lipat (rentang tanggal & instansi), serta *Reset Filter*.
   - **Tabel Sticky-Header & Pagination**: 7 kolom (*Nomor / ID*, *Nama Dokumen*, *Jenis*, *Tanggal*, *Pihak Terkait*, *Status*, *Aksi*) dengan sorting klik pada header, status berikon + teks, ringkasan metadata baca-saja via modal ringan (bukan S06 penuh), serta pagination `10 / 20 / 50` baris.
   - **Empty / Loading / Error States**: Skeleton loading terstruktur, empty state jujur saat kosong, empty state filter, serta banner storage error & load error dengan tombol coba ulang.

### 2.2 Pembaruan Status Temuan (`PERS-*`) dan Butir Blueprint (`BP-*`)

| ID | Status Sebelum | Status Setelah Tahap 2 | Keterangan Aktual |
|---|---|---|---|
| `BP-005` | Belum Diimplementasikan | **SESUAI BLUEPRINT** | Tepat 1 menu sidebar baru `Persuratan & Arsip` ditambahkan ke `src/App.tsx` bersama 4 tab internal S01. |
| `BP-007` | Belum Diimplementasikan | **SESUAI BLUEPRINT** | Layar S01 selesai: 4 kartu statistik nyata, 4 tab kategori, pencarian/filter/sort, tabel sticky 7 kolom, pagination 10/20/50, dan state empty/loading/error jujur. |
| `BP-015` | Belum Diimplementasikan | **SEBAGIAN** | Tab & filter *Surat Masuk* di S01 aktif membaca `DocumentRecord`; form pencatatan & alur disposisi masuk dijadwalkan pada tahap lanjutan. |
| `BP-018` | Sebagian (Tahap 1) | **SEBAGIAN (Tahap 2 Ditambah)** | Menambahkan metadata `DocumentRecord` S01 dan `AppState.documents`; `DocumentTemplate`, `DocumentVersion`, dan `DocumentAttachment` menyusul pada Tahap 3–10. |
| `PERS-001` | Kritis (Belum Ada) | **SEBAGIAN (Tahap 2 Selesai)** | Pintu masuk & daftar S01 aktif terhubung ke shell SIGNAL; S02–S07 dijadwalkan pada Tahap 3–10. |

### 2.3 Daftar File yang Diubah / Ditambahkan pada Tahap 2

| File | Jenis Perubahan | Ringkasan Peran |
|---|---|---|
| `src/domain/persuratan/types.ts` | Baru | Tipe metadata `DocumentRecord`, `DocumentDirection`, `DocumentStatus`, `DocumentKind`, filter & statistik S01 |
| `src/domain/persuratan/selectors.ts` | Baru | Kalkulasi 4 kartu statistik, filter tab/pencarian (tanpa NIP), sorting, pagination, & format tanggal |
| `src/domain/types.ts` | Diubah | Tambah field opsional `documents?: DocumentRecord[]` pada `AppState` |
| `src/domain/seed.ts` | Diubah | Inisialisasi `documents: []` pada `createDemoState()` dan `createEmptyState()` tanpa data contoh palsu |
| `src/storage/db.ts` | Diubah | Validasi opsional struktur `documents` & normalisasi idempoten `documents: []` pada `migrateAppStateSchema` |
| `src/components/persuratan/CorrespondenceCenter.tsx` | Baru | Layar S01 lengkap (KPI cards, tab, search/filter, tabel sticky, pagination, modal Buat Dokumen & ringkasan baca-saja) |
| `src/components/persuratan/CorrespondenceCenter.css` | Baru | Styling Jewel Luxury ter-scope `.s01-*` responsif untuk 1440×900 & 1280×720 |
| `src/App.tsx` | Diubah | Tambah tepat 1 menu `Persuratan & Arsip`, render S01, dan state `storageError` + `retrySaveWorkspace` |
| `tsconfig.node.json` | Diubah | Aktifkan `"jsx": "react-jsx"` agar test komponen di `tests/` lolos `tsc -b` |
| `tests/phase1_integrity_and_assignments.test.ts` | Diubah (1 baris) | Sertakan properti `documents` pada salinan terbalik manual `reordered.payload` |
| `tests/phase2_correspondence_center.test.ts` | Baru | 10 skenario uji S01 (migrasi, statistik, tab, search bebas NIP, filter/sort/pagination, state kosong/error/loading, round-trip backup SHA-256) |
| `/HASIL_AUDIT_PERSURATAN.md` | Diubah (Prepend) | Penambahan laporan `PHASE-2` ini di atas `PHASE-1` |

*Catatan Integritas Aset & Dependency:* Seluruh **14 berkas PDF** contoh di root (`SIGNAL_*.pdf`) diverifikasi memiliki checksum **SHA-256 100% identik** sebelum dan sesudah Tahap 2, serta tidak ada penambahan dependency baru di `package.json`.

### 2.4 Hasil Verifikasi Tahap 2 & Batasan Pengujian

| Pemeriksaan | Hasil | Detail |
|---|---|---|
| `npm run lint` (`tsc -b`) | **Exit `0`** | Lulus tanpa error TypeScript pada `tsconfig.app.json` & `tsconfig.node.json` |
| `npm test` (`vitest run`) | **Exit `0`** | **11/11 file test lulus, 66/66 tests lulus** (37 eksisting + 19 Tahap 1 + 10 Tahap 2) |
| `npm run build` (`tsc -b && vite build`) | **Exit `0`** | **1863 modul**, selesai dalam `7.05s`, menghasilkan `dist/` |

**Batasan Pengujian & Koreksi Sinkronisasi Repository:**
1. **Lingkungan Pengujian Node:** Pengujian `vitest` berjalan di `environment: 'node'` menggunakan verifikasi logika domain + SSR `react-dom/server` (`renderToStaticMarkup`); interaksi DOM/klik langsung serta rendering CSS di live headless browser (`1440×900` / `1280×720`) belum dijalankan via browser automation di container ini.
2. **Catatan Koreksi Sinkronisasi (15 November 2026 pukul 22:56:27 WIB):** Pada laporan `PHASE-1`, tertulis catatan bahwa perubahan tersimpan di `/app/applet` tanpa `.git`. Karena direktori `.git` tidak tersedia di runtime `/app/applet`, status sinkronisasi antara runtime workspace saat ini dengan commit eksternal (termasuk referensi commit Tahap 1 `ebc4f97ff864ddba2aafd692378c7d3ccf18990b` di GitHub `adizalmumtaz30/SIGNAL-V3-2-Jewel-Luxury`) **tidak dapat diverifikasi dari container** dan memerlukan pemeriksaan/push Git dari host atau UI integrasi GitHub pengguna.

---

## IMPLEMENTASI TAHAP 1 — INTEGRITAS DATA & TEACHER ASSIGNMENT

- **ID Entri:** `PHASE-1`
- **Status Pelaksanaan:** **SELESAI** (Seluruh ruang lingkup Tahap 1A, 1B, dan 1C terimplementasi dan teruji; fitur UI Persuratan S01–S07 sengaja belum dibangun sesuai batas tahap)
- **Waktu mulai:** Minggu, 15 November 2026, pukul 22:11:18 WIB (`2026-11-15T22:11:18+07:00`)
- **Waktu selesai:** Minggu, 15 November 2026, pukul 22:17:50 WIB (`2026-11-15T22:17:50+07:00`)
- **Zona waktu:** Asia/Jakarta (WIB, UTC+07:00)
- **Status verifikasi repository:** Tidak dapat diverifikasi dari workspace (`.git` tidak tersedia pada container `/app/applet`; `branch` dan `commit HEAD` tidak dapat dipastikan dari workspace).

### 1.1 Ringkasan Perubahan Teknis

#### A. Penguatan Integritas Backup / Restore & Time Machine
1. **Utilitas Checksum Kanonik Bersama (`src/storage/checksum.ts`)**:
   - Menyediakan `canonicalStringify()` yang mengurutkan kunci objek secara deterministik di setiap kedalaman sambil mempertahankan urutan elemen array, sehingga perbedaan urutan key properti JSON tidak memengaruhi hash SHA-256.
   - Menggunakan Web Crypto `crypto.subtle.digest('SHA-256', ...)` melalui `computeCanonicalSha256()` dan validator hex 64-karakter `isSha256Hex()`.
   - Menambahkan dokumentasi jujur bahwa SHA-256 memverifikasi **keutuhan/deteksi perubahan file** — bukan enkripsi dan bukan tanda tangan elektronik.
2. **Hardening `SIGNAL-LOCAL-BACKUP` (`src/storage/db.ts`)**:
   - `buildBackupEnvelope()` dan `exportAppState()` menghasilkan format `formatVersion: 2`, `schemaVersion: 2`, `checksumAlgorithm: 'SHA-256'`, serta checksum kanonik SHA-256.
   - `parseBackupContent()` dan `parseBackupFileDetailed()` mendukung `schemaVersion` `1` dan `2`, menolak versi lain (`0`, `3`, `99`, tipe invalid), menolak JSON rusak dan struktur array/objek tidak lengkap, serta **mewajibkan checksum SHA-256 valid** pada format v2 dan pada setiap berkas v1 yang menyertakan properti `checksum`.
   - Format legacy v1 yang benar-benar tidak memiliki properti `checksum` tidak diloloskan diam-diam: ditandai eksplisit sebagai `verification: 'legacy_unverified'` beserta pesan peringatan ke operator sebelum restore dijalankan.
   - Pemulihan ke IndexedDB dikerjakan lewat `restoreWorkspaceSafely()` dalam satu transaksi `readwrite` (`workspace` + `teacher_assignments`) setelah validasi struktur lolos, sehingga kegagalan baca/validasi tidak menyentuh state aktif dan kegagalan transaksi dibatalkan atomik oleh IndexedDB.
3. **Hardening `.signal` & Time Machine Snapshot (`src/storage/snapshotEngine.ts`)**:
   - Menghapus bypass di `parseSignalFile()` / `parseSignalContent()`: menolak objek mentah tanpa amplop resmi, mendelegasikan `SIGNAL-LOCAL-BACKUP` langsung ke `parseBackupContent()`, serta mewajibkan checksum SHA-256 pada kontainer `SIGNAL-V5-SEAL` v2 (`legacy_unverified` + peringatan wajib hanya untuk format v1 lama tanpa key `checksum`).
   - `createSnapshot()` menghitung checksum kanonik (`checksumVersion: 2`), sedangkan `restoreSnapshot()` **memverifikasi SHA-256 snapshot target terlebih dahulu** sebelum membuat snapshot `pre_rollback` atau mengembalikan state hasil pemulihan.
   - Memperbaiki teks UI/tooltip di `TimeMachineDrawer.tsx:291` dan komentar di `snapshotEngine.ts` dari *"Terenkripsi"* menjadi *"Terverifikasi SHA-256"* serta menambahkan modal konfirmasi eksplisit di `TimeMachineDrawer.tsx` & `App.tsx` (menggantikan `window.confirm`).

#### B. Migrasi IndexedDB v2 → v3 Non-Destruktif & Idempotent
1. **Upgrade Skema `signal-academic-studio` (`DB_VERSION = 2 → 3`) (`src/storage/db.ts`)**:
   - `applySignalDatabaseUpgrade()` dijalankan di dalam `upgrade()` `idb` secara murni sinkron (tanpa panggilan jaringan/async eksternal yang berisiko `TransactionInactiveError`), **tidak memanggil `deleteDatabase()`** dan **tidak menghapus store lama** (`workspace`, `snapshots`, `audit_log`).
   - Menambahkan object store baru `teacher_assignments` (`keyPath: 'id'`) beserta index `teacherId`, `status`, dan `sourceType`.
2. **Migrasi State & Data Idempotent (`migrateAppStateSchema` & `migrateWorkspaceRecordInDatabase`)**:
   - Meningkatkan `schemaVersion` dari `1 → 2` dan memigrasikan `Teacher.roleTitle` eksplisit non-generik secara non-destruktif tanpa mengubah jadwal aktif (`activeSchedule`), `draft`, `history`, `requirements`, `attendance`, `holidays`, maupun identitas `settings`.
   - Memperbaiki `loadAppState()` agar tidak lagi menimpa field `settings` yang sengaja dikosongkan pada `dataMode === 'custom'` dan tidak meregenerasi jadwal pada workspace custom saat reload.

#### C. Model Domain `TeacherAssignment` (`src/domain/types.ts` & `src/domain/teacherAssignments.ts`)
1. Menambahkan tipe `TeacherAssignmentType`, `TeacherAssignmentStatus`, `TeacherAssignmentSource`, `TeacherAssignment`, `AuditEvent`, serta `AppState.teacherAssignments?: TeacherAssignment[]` sambil **mempertahankan penuh `Teacher.roleTitle`** untuk tabel Master, presensi, dan PDF ekspor eksisting.
2. Menyediakan helper domain murni: `isValidIsoDate()` (pengecekan tanggal kalender nyata, mis. menolak `2026-02-30`), `isGenericRoleTitle()`, `inferAssignmentTypeFromTitle()`, `validateTeacherAssignment()` (mendukung banyak/riwayat tugas paralel per guru, menolak `teacherId` hilang atau `endDate < startDate`, memberi peringatan non-fatal bila guru nonaktif masih punya tugas `ACTIVE`), `normalizeTeacherAssignment()`, dan `migrateLegacyRoleTitlesToAssignments()` (idempoten, `startDate: null`, `endDate: null`, `isDateUnknown: true`, `sourceType: 'LEGACY_MIGRATION'`, tidak mempromosikan peran generik `'Guru Mapel'`).

### 1.2 Pembaruan Status Temuan (`PERS-*`) dan Butir Blueprint (`BP-*`)

| ID | Status Sebelum (Audit #01) | Status Setelah Tahap 1 | Keterangan Aktual |
|---|---|---|---|
| `PERS-003` | Kritis/Tinggi (Terbuka) | **SELESAI** | Verifikasi SHA-256 wajib & bypass impor `.signal`/`.json` telah ditutup beserta konfirmasi `legacy_unverified`. |
| `PERS-006` | Tinggi (Terbuka) | **SEBAGIAN (Fondasi Selesai)** | Model `TeacherAssignment`, store IDB `teacher_assignments`, dan migrasi non-destruktif selesai; UI manajemen penugasan menunggu Tahap 9. |
| `PERS-007` | Tinggi (Terbuka) | **SEBAGIAN (Ditingkatkan)** | `loadAppState()` kini tidak menimpa `settings` pada `dataMode === 'custom'`; modal cek identitas sebelum finalisasi SK menyusul di tahap persuratan. |
| `BP-016` | Tidak Sesuai/Berkonflik | **SESUAI SEBAGIAN** | Entitas & migrasi `TeacherAssignment` aktif; manajemen UI di Data Master & link SK dijadwalkan di Tahap 9. |
| `BP-018` | Belum Diimplementasikan | **SEBAGIAN (Tahap 1 Selesai)** | `TeacherAssignment` & `AuditEvent` ditambahkan ke `types.ts`; model dokumen (`DocumentRecord`, `DocumentTemplate`, `DocumentVersion`, `DocumentAttachment`) disiapkan saat masuk modul Persuratan. |
| `BP-019` | Belum Diimplementasikan | **SESUAI SEBAGIAN** | IDB upgrade v2 → v3 idempotent + `teacher_assignments` store selesai; 4 store dokumen & Blob menyusul sebelum S01–S06/lampiran. |
| `BP-021` | Tidak Sesuai/Berkonflik | **SESUAI SEBAGIAN** | Verifikasi SHA-256, schema versioned v1/v2, peringatan `legacy_unverified`, dan restore transaksional selesai; dukungan paket lampiran Blob menyusul pada Tahap 10. |

### 1.3 Daftar File yang Diubah / Ditambahkan pada Tahap 1

| File | Jenis Perubahan | Ringkasan Peran |
|---|---|---|
| `src/storage/checksum.ts` | Baru | Serializer JSON kanonik + helper SHA-256 Web Crypto bersama |
| `src/domain/teacherAssignments.ts` | Baru | Validator tanggal/relasi, normalizer, & migrator `roleTitle` idempoten |
| `src/domain/types.ts` | Diubah | Tambah `TeacherAssignment`, `AuditEvent`, `AppState.teacherAssignments` (`roleTitle` tetap utuh) |
| `src/domain/seed.ts` | Diubah | Update `schemaVersion: 2` & inisialisasi `teacherAssignments` awal |
| `src/storage/db.ts` | Diubah | IDB v2 → v3 (`teacher_assignments`), transaksi restore aman, & validasi ketat `SIGNAL-LOCAL-BACKUP` |
| `src/storage/snapshotEngine.ts` | Diubah | Verifikasi SHA-256 pada snapshot & `.signal`, hapus bypass parsing, & perbaiki istilah non-enkripsi |
| `src/components/TimeMachineDrawer.tsx` | Diubah | Modal konfirmasi status verifikasi / `legacy_unverified` & perbaikan tooltip tombol `.signal` |
| `src/App.tsx` | Diubah | Konfirmasi modal restore backup terverifikasi/`legacy_unverified` & transaksi `restoreWorkspaceSafely` |
| `tests/phase1_integrity_and_assignments.test.ts` | Baru | 19 kasus uji otomatis integritas backup, `.signal`, snapshot, IDB v2→v3, & `TeacherAssignment` |
| `/HASIL_AUDIT_PERSURATAN.md` | Diubah (Append) | Penambahan laporan `PHASE-1` ini tanpa mengubah isi `AUDIT #01` |

### 1.4 Perbandingan Baseline vs Hasil Verifikasi Akhir

| Pemeriksaan | Baseline (Audit #01 / Sebelum Edit) | Akhir Tahap 1 (Setelah Semua Edit Kode) | Exit Code |
|---|---|---|---|
| `npm run lint` (`tsc -b`) | Lulus (0 error) | **Lulus (0 error TypeScript)** | `0` |
| `npm test` (`vitest run`) | 9 file, 37/37 tests lulus | **10 file, 56/56 tests lulus** (37 eksisting + 19 baru) | `0` |
| `npm run build` (`tsc -b && vite build`) | Lulus (`dist/` terbangun) | **Lulus** (1860 modul, 10.84s, `dist/` terbangun) | `0` |

**Batasan Pengujian yang Perlu Dicatat secara Jujur:**
- `vitest` pada proyek ini berjalan di `environment: 'node'` (`vite.config.ts:13`). Oleh karena itu, pengujian migrasi IndexedDB v2 → v3 dan rollback transaksi pada `tests/phase1_integrity_and_assignments.test.ts` menggunakan adapter/simulator IndexedDB in-memory deterministik yang menjalankan fungsi produksi aktual (`applySignalDatabaseUpgrade`, `migrateWorkspaceRecordInDatabase`, `restoreWorkspaceSafelyWithDb`, `restoreSnapshot`), sementara fungsi browser live `openDB('signal-academic-studio', 3)` dan eksekusi UI klik-melalui headless browser tidak dijalankan di lingkungan Node CLI ini.

### 1.5 Risiko Migrasi & Panduan Operator

1. **Cadangkan Data Sebelum Membuka Versi Baru:** Operator disarankan mengekspor backup `.json` atau `.signal` sebelum memperbarui aplikasi di browser yang sudah memiliki data lama.
2. **Arti Verifikasi SHA-256:** Checksum SHA-256 menjamin berkas tidak rusak saat unduh/salin atau diubah sembarang byte; checksum **bukan** enkripsi isi file dan **bukan** tanda tangan elektronik tersertifikasi.
3. **File Backup Lama (`v1`) Tanpa Checksum:** Aplikasi tetap mengizinkan pemulihan berkas backup lama v1 yang memang dibuat sebelum ada field `checksum`, tetapi **selalu memunculkan peringatan `legacy_unverified`** dan menuntut konfirmasi eksplisit operator. Berkas yang checksum-nya rusak/dihapus pada format v2 ditolak otomatis.

### 1.6 Status Sub-Tugas Tahap 1 & Sinkronisasi

| Sub-Tugas | Status | Catatan |
|---|---|---|
| A. Integritas Backup / Restore & Snapshot | **SELESAI** | Backup `.json`, `.signal`, & snapshot Time Machine terverifikasi SHA-256 |
| B. Migrasi IndexedDB v2 → v3 Non-Destruktif | **SELESAI** | Store `teacher_assignments` + migrasi state v1→v2 idempoten tanpa sentuh jadwal |
| C. Model Domain `TeacherAssignment` | **SELESAI** | Tipe, validasi, & migrasi `roleTitle` non-destruktif; `Teacher.roleTitle` utuh |
| UI Persuratan & Document Studio (S01–S07) | **TERTUNDA (Sesuai Rencana Tahap 2–11)** | Sengaja tidak disentuh agar Tahap 1 fokus stabil & bebas regresi |

- **Status sinkronisasi GitHub:** Tersimpan di workspace AI Studio (`/app/applet`); **belum** di-commit maupun di-push ke `https://github.com/adizalmumtaz30/SIGNAL-V3-2-Jewel-Luxury` (tidak ada `.git` lokal pada environment).

---

## AUDIT #01 — Selesai

- **Waktu mulai:** Minggu, 15 November 2026, pukul 21:51:28 WIB
- **Waktu selesai:** Minggu, 15 November 2026, pukul 21:52:56 WIB
- **Laporan diperbarui:** Minggu, 15 November 2026, pukul 21:52:56 WIB
- **Timestamp mulai (ISO 8601):** `2026-11-15T21:51:28+07:00`
- **Timestamp selesai (ISO 8601):** `2026-11-15T21:52:56+07:00`
- **Zona waktu:** Asia/Jakarta (WIB, UTC+07:00)
- **Repository:** `adizalmumtaz30/SIGNAL-V3-2-Jewel-Luxury` *(tidak dapat diverifikasi via `.git` lokal; terkonfirmasi sebagai SIGNAL V3.2 Jewel Luxury dari file workspace)*
- **Branch:** Tidak tersedia (direktori `.git` tidak ditemukan di `/app/applet`)
- **Commit/Revision:** Tidak tersedia
- **Cakupan audit:** Audit penuh *read-only* terhadap struktur proyek, `package.json`, `server.ts`, `src/App.tsx`, `src/domain/`, `src/storage/`, `src/components/`, `src/utils/`, `src/styles/`, hasil eksekusi `npm run lint`, `npm test`, `npm run build`, serta audit kepatuhan terhadap seluruh isi `BLUEPRINT_UTAMA_SIGNAL_PERSURATAN_ARSIP_DOCUMENT_STUDIO.md`.
- **Status verifikasi repo:** Tidak dapat diverifikasi (tanpa `.git`)

---

### 1. Metadata Audit dan Timestamp Lengkap

Audit #01 dilaksanakan dalam mode **read-only ketat** menggunakan runtime `/app/applet` di Google AI Studio Build Mode. Pengukuran waktu sistem menggunakan perintah `TZ=Asia/Jakarta date` sebelum pembacaan/inspeksi mendalam dimulai (`2026-11-15T21:51:28+07:00`) dan sebelum penulisan laporan ini diselesaikan (`2026-11-15T21:52:56+07:00`). Tidak ada satu pun berkas kode aplikasi, konfigurasi, skema basis data, dependency, maupun berkas blueprint yang diubah atau ditambahkan selain berkas laporan ini (`/HASIL_AUDIT_PERSURATAN.md`).

---

### 2. Ringkasan Eksekutif

Aplikasi **SIGNAL** (`signal-mts-scheduler` v1.2.1) yang terbuka di workspace saat ini merupakan aplikasi React 19 + TypeScript + Vite dengan desain **SIGNAL V3.2 Jewel Luxury / V5 Sovereign Atelier**, penyimpanan *local-first* berbasis IndexedDB (`signal-academic-studio`, `DB_VERSION = 2`), serta backend Express ringan (`server.ts`) untuk melayani frontend dan proxy opsional Gemini (`/api/ai/explain`). Fitur akademik inti—penjadwalan KBM, generator deterministik, validator, beban mengajar, presensi harian/multi-bulan, riwayat versi jadwal, Time Machine vault, backup/restore, dan ekspor PDF resmi jadwal/presensi—berfungsi baik dan seluruh pemeriksaan build, typecheck (`tsc -b`), serta 37 unit/integrasi tes (`vitest`) lulus tanpa error.

Namun, **fitur Persuratan & Arsip Digital, Document Studio (S01–S07), dan Administrasi Penugasan Guru terstruktur (`TeacherAssignment`) belum ada sama sekali di source code** (`0` implementasi). Selain itu, audit menemukan sejumlah kesenjangan teknis dan konflik terhadap `BLUEPRINT_UTAMA_SIGNAL_PERSURATAN_ARSIP_DOCUMENT_STUDIO.md` yang **wajib diselesaikan terlebih dahulu** sebelum atau selama implementasi awal agar tidak merusak fitur akademik maupun integritas data:
1. **Konflik Integritas Backup/Restore (`PERS-003`, `BP-021`)**: `parseSignalFile()` (`src/storage/snapshotEngine.ts:219-239`) tidak memverifikasi checksum SHA-256 sama sekali, sementara `parseBackupFile()` (`src/storage/db.ts:166,173`) mengunci `schemaVersion !== 1` secara kaku dan melewati verifikasi bila field `checksum` dihapus.
2. **Konflik Shortcut `Ctrl+K` / `Cmd+K` (`PERS-004`, `BP-024`)**: Terdapat dua listener keyboard terpisah di `src/App.tsx:244-252` (Command Palette global) dan `src/App.tsx:3977-3999` (fokus pencarian lokal `MasterScreen`), yang berkonflik antar-layar maupun terhadap pintasan tautan Editor Dokumen S04.
3. **Sumber Data Beban Guru Tidak Seragam (`PERS-005`, `BP-017`)**: `WorkloadDashboard.tsx:47` membaca `state.draft ?? state.activeSchedule ?? []`, sedangkan `InspectorSlideDrawer.tsx:127-128` membaca `state.requirements`. Belum ada pemisahan tegas ke `ScheduleVersion` terpublikasi sebagai dasar resmi SK Pembagian Tugas.
4. **Keterbatasan Model Guru & Identitas Demo (`PERS-006`, `PERS-007`)**: `Teacher.roleTitle` hanya string opsional tunggal (`src/domain/types.ts:20`), dan `loadAppState()` (`src/storage/db.ts:45-60`) mengisi identitas demo (`MTs Cendekia Nusantara`) secara diam-diam saat field kosong.
5. **Ketiadaan Library Document Studio & Risiko React 19 (`PERS-002`, `BP-011`)**: Belum ada library editor dokumen kaya (`Tiptap`/`Lexical`/`Slate`) terpasang; `pdfExport.ts` berbasis `jsPDF`+`autoTable` dengan koordinat statis tidak dapat dipakai langsung untuk dokumen bebas-sunting multi-halaman ala pengolah kata.

---

### 3. Verifikasi Repository dan Lingkungan

| Parameter | Nilai / Hasil Verifikasi | Sumber Bukti |
|---|---|---|
| Direktori workspace | `/app/applet` | Environment shell & `vitest run` |
| Status `.git` lokal | **Tidak ditemukan** (`fatal: not a git repository`) | `git status -sb`, `ls -la .git` |
| Branch & Commit `HEAD` | **Tidak tersedia** | Tidak ada direktori `.git` |
| Package Name & Version | `signal-mts-scheduler` (`1.2.1`, `"private": true`, `"type": "module"`) | `package.json:1-5` |
| Deskripsi & Metadata | `SIGNAL — Smart Islamic School Scheduler` (`MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API`) | `metadata.json:1-8`, `index.html:8-11` |
| Node Engine & Runtime | `node >=20.0.0`, Vite `^6.0.7`, React `^19.0.0`, TypeScript `~5.7.2`, Express `^5.1.0` | `package.json:16-40` |
| Package Manager Lock | `bun.lock` ada di root; skrip dijalankan lewat `npm` | Root directory listing |
| Skrip Kualitas | `lint`: `tsc -b`; `build`: `tsc -b && vite build`; `test`: `vitest run`; `dev`: `tsx server.ts` | `package.json:7-15` |

**Catatan Penting Verifikasi Repo:** Karena container sandbox AI Studio tidak menyertakan folder `.git`, audit ini **tidak dapat memastikan** secara kriptografis dari riwayat commit apakah workspace ini tepat berada pada ujung branch `main` di `https://github.com/adizalmumtaz30/SIGNAL-V3-2-Jewel-Luxury`. Kesesuaian identitas proyek diverifikasi berdasarkan isi kode `SIGNAL V3.2 Jewel Luxury` dan keberadaan dokumen blueprint di root.

---

### 4. Peta Struktur Aplikasi dan Arsitektur Aktual

```text
/
├── BLUEPRINT_UTAMA_SIGNAL_PERSURATAN_ARSIP_DOCUMENT_STUDIO.md   (910 baris, spesifikasi target)
├── HASIL_AUDIT_PERSURATAN.md                                    (Laporan audit ini)
├── index.html                                                   (Google Fonts: Fraunces, Plus Jakarta Sans, JetBrains Mono)
├── package.json                                                 (React 19, Vite 6, TypeScript 5.7, idb 8, jsPDF 4, AutoTable 5)
├── server.ts                                                    (Express 5 port 3000 + Vite middleware + POST /api/ai/explain)
├── vite.config.ts                                               (hmr: false, vitest environment: node)
├── src/
│   ├── main.tsx                                                 (Urutan 5 CSS layer)
│   ├── App.tsx                                                  (6.261 baris: App Shell, 11 ScreenId, state workspace, CRUD Master/Jadwal)
│   ├── domain/
│   │   ├── types.ts                                             (SchoolClass, Teacher, Subject, Requirement, ScheduleVersion, AppSettings, AppState)
│   │   ├── seed.ts                                              (createDemoState — data demo MTs Cendekia Nusantara)
│   │   ├── time.ts                                              (Slot waktu KBM & Non-KBM, konversi JP astronomis)
│   │   ├── validator.ts                                         (Validator deterministik + fingerprint jadwal)
│   │   ├── generator.ts                                         (Solver jadwal berbasis seed)
│   │   ├── indonesianHolidays.ts                                (Kalender hari libur Indonesia)
│   │   └── attendanceRecap.ts                                   (Kalkulasi rekap presensi bulanan & rentang multi-bulan)
│   ├── storage/
│   │   ├── db.ts                                                (IndexedDB `signal-academic-studio` v2, export/parse backup v1)
│   │   └── snapshotEngine.ts                                    (Time Machine snapshots, `.signal` export/import, SHA-256)
│   ├── components/
│   │   ├── WorkloadDashboard.tsx                                (Statistik beban mengajar JP & cetak jadwal guru)
│   │   ├── AttendanceScreen.tsx                                 (Presensi harian/bulanan/rekap/hari libur)
│   │   ├── AttendancePdfExportModal.tsx                         (Ekspor PDF rekap presensi bulanan & multi-bulan)
│   │   ├── SchedulePdfExportModal.tsx                           (Ekspor PDF jadwal A4/F4 dengan override Kop & TTD)
│   │   ├── SettingsScreen.tsx                                   (2.497 baris: Jam KBM/Non-KBM, Identitas/Kop Surat, Pejabat, AI/Reset)
│   │   ├── CommandPaletteModal.tsx                              (Pencarian cepat Ctrl+K & aksi)
│   │   ├── TimeMachineDrawer.tsx                                (Drawer riwayat snapshot & impor/ekspor `.signal`)
│   │   ├── InspectorSlideDrawer.tsx                             (Drawer edit cepat guru/kelas/mapel)
│   │   ├── EntityEditModal.tsx                                  (Modal tambah/ubah kelas, guru, mapel, alokasi)
│   │   ├── QuickValidationModal.tsx, AiConflictHelper.tsx, InfoNotice.tsx, MadrasahTeacherAvatar.tsx
│   ├── utils/
│   │   ├── pdfExport.ts                                         (2.470 baris: `jsPDF` + `autoTable`, Kop Surat, A4/F4, tanda tangan)
│   │   ├── madrasahLogo.ts                                      (Emblem default canvas & resize logo upload 260px)
│   │   └── matrixGrouping.ts                                    (Pengelompokan kelas untuk PDF 1 halaman)
│   └── styles/
│       ├── sakala-modern.css
│       ├── signal-v3-atelier.css                                (Layout shell: sidebar 252px/76px, topbar 56px, padding 24px, breakpoint 1024px)
│       ├── signal-v3-jewel-identity.css                         (Jewel palette, brandmark, side-foot)
│       ├── schedule-redesign.css
│       └── signal-v5-tokens.css                                 (4.931 baris: Token V5, komponen modal/drawer/settings/attendance)
└── tests/ (9 file test Vitest, total 37 kasus uji)
```

---

### 5. Inventaris Fitur SIGNAL yang Terkait

1. **Navigasi & Shell (`src/App.tsx:97-138`, `1040-1182`)**:
   - `ScreenId` terdiri atas 11 layar: `overview`, `schedule`, `workload`, `attendance`, `generator`, `master`, `requirements`, `validation`, `history`, `backup`, `settings`.
   - Sidebar (`navGroups`) memiliki 2 grup: `OPERASIONAL UTAMA` (8 item) dan `SISTEM & CADANGAN` (2 item: `Riwayat & Backup`, `Pengaturan`). Layar `backup` diakses melalui tautan internal, bukan tombol sidebar langsung.
2. **Alur Jadwal & Publikasi (`src/App.tsx:613-649`)**:
   - Penyuntingan manual dan generator tersimpan pada `workspace.draft` (terpisah dari `workspace.activeSchedule`).
   - `publishDraft()` menjalankan `validateSchedule()` deterministik, memblokir bila `hardErrorCount > 0`, lalu mencetak `ScheduleVersion` baru di `workspace.history` lengkap dengan `version`, `createdAt`, `label`, `entries`, `fingerprint`, dan `validatorVersion`.
3. **Data Master & Profil Pendidik (`src/App.tsx:3904-4900`, `EntityEditModal.tsx`, `InspectorSlideDrawer.tsx`)**:
   - Mengelola Kelas (`SchoolClass`), Guru (`Teacher`), dan Mapel (`Subject`) dengan pencarian, filter preset, bulk actions (hapus/aktifkan/ekspor CSV), edit via modal, dan edit cepat via `InspectorSlideDrawer`.
4. **Identitas Madrasah, Kop Surat, dan Pejabat Pengesah (`SettingsScreen.tsx:210-248`, `1825-2291`, `pdfExport.ts:207-305`)**:
   - Sudah menyimpan nama kementerian, kanwil/kankemenag, nama madrasah, NSM, NPSN, tahun ajaran, semester, alamat lengkap, kota, kode pos, telepon, email, website, `logoUrl`, serta dua pejabat pengesah (`headmasterName/Nip/Title` dan `curriculumLeaderName/Nip/Title`).
   - `SettingsScreen` memiliki `unsaved changes guard` (`pendingNavScreen`, `src/App.tsx:314-320`, `1633-1681`) dan pratinjau Kop Surat + blok tanda tangan langsung.
5. **Riwayat, Time Machine, dan Backup (`db.ts`, `snapshotEngine.ts`, `HistoryScreen`, `BackupScreen`, `TimeMachineDrawer.tsx`)**:
   - Mendukung ekspor backup JSON (`SIGNAL-LOCAL-BACKUP`), berkas `.signal` (`SIGNAL-V5-SEAL`), CSV jadwal, JSON jadwal, serta snapshot IndexedDB otomatis & manual berbintang (*starred*).

---

### 6. Hasil Audit Source Code per Area (A–L)

#### Area A — Verifikasi Repository dan Kondisi Project
- Aplikasi dikonfirmasi dibangun dengan **React 19 (`^19.0.0`)**, **TypeScript `~5.7.2`**, **Vite `^6.0.7`**, **Express `^5.1.0`**, **IndexedDB via `idb ^8.0.3`**, dan **jsPDF `^4.2.1`**.
- Skrip `npm run lint`, `npm test`, dan `npm run build` berjalan normal (detail pada Bagian 20).
- Ketiadaan `.git` menghalangi verifikasi branch `main` dan commit `HEAD` dari container.

#### Area B — Arsitektur dan Integrasi dengan SIGNAL
- **Titik Integrasi Sidebar**: Menambahkan tepat satu `ScreenId` baru (mis. `'persuratan'`) ke tipe `ScreenId` (`src/App.tsx:97-108`) dan satu entri pada `navGroups[0].items` (`src/App.tsx:120-129`) dengan label **Persuratan & Arsip** akan menyatu langsung ke `.sakala-nav` tanpa mengubah lebar sidebar `252px` (`signal-v3-atelier.css:127`) atau membuat shell baru.
- **Dukungan Collapse Sidebar untuk S04**: `.sidebar.sidebar-collapsed` (`76px`) dan `.main-shell.main-shell-expanded` (`margin-left: 76px`) sudah tersedia dan dikontrol state `sidebarCollapsed` (`src/App.tsx:204`, `1043`, `1113`). Perlu penyimpanan preferensi collapse sebelumnya saat masuk ke S04 dan pemulihannya saat keluar.
- **Lapisan CSS & Risiko Konflik Gaya**: `src/main.tsx:7-11` memuat 5 stylesheet global tanpa CSS Modules/Tailwind scope. `signal-v5-tokens.css` memiliki ratusan kelas berawalan `.s5-*` serta beberapa aturan global. Modul Document Studio S04 harus mengisolasi CSS kanvas kertas dan konten editor di dalam scope tersendiri agar aturan `.data-table`, `.page-frame`, atau reset global `margin: 0; padding: 0` di `signal-v3-atelier.css:77-81` tidak merusak tata letak isi surat kaya.

#### Area C — Data Master dan Sumber Data Surat
- **Ketersediaan Data Sumber**:
  - Identitas madrasah & Kop Surat + 2 Penandatangan: tersedia di `AppSettings` (`src/domain/types.ts:123-154`).
  - Guru/pegawai (`id`, `code`, `name`, `subjectIds`, `maxWeeklyJP`, `isActive`, `roleTitle`, `nip`, `gender`, `availableDays`): tersedia di `AppState.teachers` (`types.ts:13-24`). **Catatan**: Tidak ada field khusus `nuptk`, `pangkat/golongan`, atau `unitKerja` terpisah selain `nip` dan `roleTitle`.
  - Kelas, Mapel, Alokasi JP, Jadwal Draft, Jadwal Aktif, dan Versi Terbit (`history`): tersedia di `AppState` (`types.ts:174-190`).
  - Data pengguna, peran, dan hak akses: **belum ada**; tombol profil di topbar hanyalah tombol `OP` yang langsung mengarah ke `settings` (`src/App.tsx:1171-1179`).
- **Kesiapan Snapshot Tanpa Live-Overwrite**: Saat ini tidak ada mekanisme snapshot data awal ke draft dokumen. Harus dipastikan proses pengisian dari Master/Settings/ScheduleVersion melakukan *deep copy* ke dalam dokumen draft + menyimpan metadata *provenance*, tanpa live-binding yang menimpa suntingan pengguna.

#### Area D — Kebutuhan Domain Persuratan dan Arsip
- Pemeriksaan menyeluruh di `src/` menunjukkan **belum ada satu pun modul, tipe, UI, maupun store** untuk:
  - Surat Masuk (pencatatan, pengirim, tanggal terima, nomor asal, disposisi, tindak lanjut).
  - Surat Keluar / Draft / SK / Undangan / Edaran / Keterangan / Berita Acara / Notula / Laporan.
  - Arsip Digital (klasifikasi kode surat, pencarian lintas tahun, retensi, relasi dokumen/revisi).
  - Manajemen Template & Versi Template.
  - Mesin Penomoran Surat (pola format, counter per jenis/unit/tahun, pencegahan duplikasi, reset aturan).
  - Status siklus hidup (`TEMPLATE | DRAFT | REVIEW | FINAL | REVISED | ARCHIVED | CANCELLED`) dan `DocumentVersion` immutable.

#### Area E — Document Studio / Editor Dokumen
- **Library Terpasang (`package.json:16-38`)**: Tidak ada satu pun library rich-text editor (`tiptap`, `prosemirror`, `lexical`, `slate`, `plate`, `quill`, `ckeditor`), pengolah DOCX (`mammoth`, `docx`), maupun sanitasi HTML DOM (`dompurify` — *catatan: `purify.es` muncul di chunk Vite build sebagai dependency internal `jspdf`, bukan sebagai sanitizer yang diimpor aplikasi*).
- **Kesenjangan Kemampuan**: Seluruh kemampuan Word-like (paragraf kaya, heading, font, tabel kompleks dengan merge/split/header berulang, gambar resizable, header/footer dinamis, nomor halaman, page break manual/otomatis, A4/F4, orientasi, margin, autosave, undo/redo) belum tersedia dan memerlukan evaluasi Proof of Concept (POC) pada Tahap 5 sebelum dikunci ke aplikasi utama.
- **Kandidat Library Open-Source (Ringkasan Teknis & Lisensi)**:
  1. **Tiptap Core + ProseMirror (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-table*`) — Lisensi MIT (Gratis)**. Keunggulan: arsitektur `prosemirror-tables` paling matang untuk colspan/rowspan/resize/paste tabel Word, undo/redo history bawaan, skema node kustom kuat (untuk Kop Surat, Blok TTD, Page Break). *Keterbatasan kritis*: ekstensi resmi halaman & konversi Tiptap (`@tiptap-pro/extension-pages`, `@tiptap-pro/extension-export`) bersifat **berbayar/proprietary** dan dilarang dipasang tanpa izin. Selain itu, kompatibilitas peer dependency terhadap **React 19 (`^19.0.0`)** harus diuji langsung saat Tahap 5 POC.
  2. **Lexical (`lexical`, `@lexical/react`, `@lexical/table`) — Lisensi MIT (Gratis, Meta)**. Keunggulan: ringan, dukungan React 19 baik, cocok untuk performa pengetikan panjang. *Keterbatasan*: penanganan tabel merge/split kompleks, paste Word berstruktur tinggi, dan pagination membutuhkan lebih banyak kode kustom dibanding ProseMirror.
  3. **Slate / Plate — Lisensi MIT (Gratis)**. *Keterbatasan*: lebih sering menghadapi isu IME/selection dan kompatibilitas plugin pada React 19 serta stabilitas tabel multi-halaman dibanding ProseMirror.
  4. **Impor/Ekspor DOCX & Sanitasi**: `mammoth` (**BSD-2-Clause**, gratis) untuk impor `.docx` → HTML terstruktur; `docx` (**MIT**, gratis) untuk ekspor AST ke `.docx`; `dompurify` (**Apache-2.0 / MPL-2.0**, gratis) untuk sanitasi HTML saat paste dari Word/impor DOCX. **Catatan jujur**: konversi DOCX bukan kompatibilitas Microsoft Word 100% (elemen seperti floating text-box, SmartArt, atau makro tidak terkonversi penuh dan harus diberi peringatan eksplisit).

#### Area F — Penugasan Guru dan SK
- `Teacher` (`src/domain/types.ts:13-24`) hanya menyimpan satu string bebas `roleTitle?: string` (contoh di `seed.ts:66`: `'Waka Kurikulum / Guru Mapel'`).
- Tidak ada entitas `TeacherAssignment` untuk menyimpan banyak tugas paralel (mengajar, wali kelas, waka, pembina, panitia), `startDate`/`endDate`, `academicYear`, `semester`, `status`, maupun tautan ke `sourceScheduleVersionId` dan `documentId`.
- `WorkloadDashboard.tsx:47` membaca `state.draft ?? state.activeSchedule ?? []`, sedangkan `InspectorSlideDrawer.tsx:127-128` membaca `state.requirements`. Belum ada perbedaan jelas antara rencana JP, rancangan draft yang belum terbit, dan `ScheduleVersion` resmi di `state.history` (`src/App.tsx:622-638`).

#### Area G — Penyimpanan, Backup, Pemulihan, dan File Lampiran
- **IndexedDB (`src/storage/db.ts:7-35`)**: `DB_NAME = 'signal-academic-studio'`, `DB_VERSION = 2`. Object store yang ada: `workspace` (keyPath `'id'`), `snapshots` (index `timestamp`, `isStarred`), `audit_log` (index `timestamp`).
- **Belum ada Store Persuratan & Blob**: Belum terdapat object store untuk `documents`, `document_versions`, `document_templates`, `document_attachments`, dan `teacher_assignments`. Jika lampiran biner disimpan sebagai base64 di `AppState`, `cloneState()` pada `createSnapshot()` (`snapshotEngine.ts:37-38`) akan menduplikasi seluruh payload besar di setiap snapshot hingga kuota IndexedDB cepat habis.
- **Kelemahan Verifikasi Checksum & Versi Backup**:
  - `exportAppState()` (`db.ts:138-148`) dan `exportSignalFile()` (`snapshotEngine.ts:181-200`) menghitung **checksum SHA-256** (untuk deteksi kerusakan integritas — **bukan** enkripsi dan **bukan** tanda tangan elektronik; namun komentar di `snapshotEngine.ts:179` dan `TimeMachineDrawer.tsx:297` secara keliru menulis kata *"encrypted"* / *"Terenkripsi"*).
  - `parseSignalFile()` (`snapshotEngine.ts:219-239`) langsung mengembalikan `parsed.data.state` / `parsed.payload` **tanpa menghitung atau memeriksa `parsed.checksum` sama sekali**.
  - `parseBackupFile()` (`db.ts:166,173`) menolak semua versi selain `schemaVersion === 1` dan hanya memverifikasi checksum `if (parsed.checksum && ...)` — file yang dihapus field `checksum`-nya tetap diterima sebagai sah!
- **Status Penyimpanan**: 100% lokal di browser (`local-first`). Tidak ada sinkronisasi cloud/multi-device.

#### Area H — Keamanan, Privasi, dan Keandalan
- **Autentikasi & Otorisasi**: Belum ada login, session, atau RBAC nyata. `server.ts` tidak memiliki middleware autentikasi. Tombol `OP` di topbar (`App.tsx:1171-1179`) hanya pintasan kosmetik ke Settings.
- **Sanitasi & Upload File**:
  - `processLogoUpload()` (`src/utils/madrasahLogo.ts:170-219`) mengecek `file.type.startsWith('image/')` lalu me-render ulang via `<canvas>` (yang membantu menyingkirkan payload berbahaya pada raster image), namun tidak mengecek batas ukuran maksimal file (mis. risiko unggah gambar 50 MB) atau menolak SVG dengan skrip tersembunyi sebelum masuk `Image`/reader secara eksplisit.
  - Tidak ada DOM sanitizer (`dompurify`) di `package.json` karena belum ada fitur render HTML bebas atau rich-text editor.
- **Privasi & AI Proxy (`server.ts:55-82`, `AiConflictHelper.tsx:42-63`)**: Endpoint `/api/ai/explain` hanya dipakai untuk konflik jadwal, rate-limited (8 req / 15 menit per IP), payload dibatasi 16 KB, API key di sisi server (`process.env.GEMINI_API_KEY`). Jika kelak dipakai pada persuratan, wajib ada masker PII (NIP, nama, isi surat sensitif).
- **Konkurensi Multi-Tab**: `openSignalDB()` tidak mendengarkan event `versionchange` IndexedDB atau menggunakan `BroadcastChannel` / `Web Locks API` untuk sinkronisasi antar-tab saat penomoran surat atau penulisan dokumen.

#### Area I — PDF, Cetak, dan Kualitas Dokumen
- `src/utils/pdfExport.ts` (~2.470 baris) menggunakan `jsPDF` dan `jspdf-autotable` untuk layout presisi jadwal & presensi.
- **Dimensi Kertas**: Sudah memiliki `getPaperDimensions('a4' | 'f4', orientation)` (`pdfExport.ts:70-78`) yang mendefinisikan A4 (`210 × 297 mm`) dan F4 (`210 × 330 mm`) serta fungsi `renderOfficialKopSurat()` (`pdfExport.ts:207-305`).
- **Kesenjangan Konsistensi Preview vs PDF**: Preview jadwal/presensi di layar (`SchedulePdfExportModal`, `AttendancePdfExportModal`, `SettingsScreen`) saat ini menggunakan HTML/React mockup terpisah dari instruksi koordinat `jsPDF`. Untuk Document Studio (S04/S05), pendekatan menggambar ulang secara manual di `jsPDF` akan melanggar Blueprint Bagian 11.1 karena pemotongan baris, tinggi paragraf kaya, lebar kolom variabel, gambar, dan header tabel berulang lintas halaman berisiko melenceng jauh antara editor dan PDF.

#### Area J — Kepatuhan Tata Naskah dan Kearsipan
- Aplikasi **belum** memiliki struktur kode klasifikasi arsip, konfigurasi format naskah dinas per kategori, aturan Jadwal Retensi Arsip (JRA), maupun tingkat akses arsip.
- `BLUEPRINT_UTAMA_SIGNAL_PERSURATAN_ARSIP_DOCUMENT_STUDIO.md` merujuk **PMA Nomor 12 Tahun 2026**, **UU 43/2009**, dan **Peraturan ANRI 6/2021** (baris 683–685, 900–903).
- **Verifikasi Regulasi (`BELUM DIVERIFIKASI`)**: Lingkungan audit AI Studio ini tidak mengambil atau memverifikasi naskah resmi peraturan perundang-undangan eksternal tersebut. Oleh karena itu, status kesesuaian detail tata naskah (margin wajib, nomenklatur dinas, retensi JRA) ditandai sebagai **BELUM DIVERIFIKASI** hingga pemilik/operator madrasah memverifikasi naskah resmi instansi Kemenag/ANRI terkait.

#### Area K — Aksesibilitas dan UX
- **Label, Focus & Dialog**: Mayoritas kontrol baru di `SettingsScreen.tsx` sudah memakai `htmlFor`, `aria-label`, `role="dialog"`, `aria-modal="true"`; namun `InspectorSlideDrawer` dan `TimeMachineDrawer` memakai `<div onClick>` tanpa `role="dialog"`, tanpa focus trap, dan tanpa pemulihan fokus ke tombol pemicu saat ditutup.
- **Konflik Keyboard**: `MasterScreen` (`src/App.tsx:3981-3984`) membajak `Ctrl/Cmd+K` untuk memfokuskan kotak pencarian lokalnya sekaligus listener global (`src/App.tsx:245-248`) membuka `CommandPaletteModal`! Selain itu, menekan huruf `n` di `MasterScreen` saat fokus berada di node `contentEditable` belum dikecualikan di baris `3979` (`tagName === 'INPUT' | 'TEXTAREA' | 'SELECT'` tidak mengecek `isContentEditable`).
- **Identifikasi Data Demo**: Banner demo hanya tampil di top area (`src/App.tsx:1185-1195`) dan dapat ditutup dengan menekan `X` (`setWorkspace dataMode: 'custom'`), padahal data di `settings` dan `teachers` masih tetap berisi teks contoh (`MTs Cendekia Nusantara`). Belum ada pengaman di alur persuratan agar identitas demo tidak tercetak seolah-olah surat resmi.

#### Area L — Build, Test, dan Regresi
Eksekusi pemeriksaan *read-only* langsung pada `/app/applet` menghasilkan:
- `npm run lint` (`tsc -b`): **LULUS** (exit code 0, 0 error TypeScript).
- `npm test` (`vitest run`): **LULUS** (9 test files passed, 37/37 tests passed dalam 3.95s).
- `npm run build` (`tsc -b && vite build`): **LULUS** (exit code 0, built dalam 6.61s; menghasilkan bundel `dist/`, dengan catatan chunk utama `index-*.js` 1,80 MB karena menyertakan `jsPDF` & UI).
- **Catatan Cakupan Tes Saat Ini**: Seluruh 9 file test hanya mencakup domain penjadwalan, kalender libur, pengelompokan matriks, rekap presensi, dan ekspor PDF jadwal/presensi; belum ada unit test untuk validasi integritas checksum `.signal`/backup maupun persuratan.

---

### 7. Audit Kesesuaian terhadap BLUEPRINT UTAMA

- **Sumber / Lokasi Blueprint yang Digunakan**: File lokal workspace `/BLUEPRINT_UTAMA_SIGNAL_PERSURATAN_ARSIP_DOCUMENT_STUDIO.md` (total **910 baris**, **38.005 byte**).
- **Status Pembacaan**: **DIBACA SELURUHNYA (100%)** dari baris 1 hingga baris 910.
- **Ringkasan Bab yang Diperiksa**:
  - **Bab 0–2**: Kewenangan dokumen, prioritas konflik, tujuan bisnis, prinsip mutlak produk, batas repo, dan temuan awal source code (`PERS` eksisting).
  - **Bab 3–4**: Arsitektur informasi, satu menu sidebar *Persuratan & Arsip*, integrasi kontekstual Penugasan Guru, peta layar S01–S07, desktop-first 1440×900 & 1280×720, aturan collapse sidebar 76px di S04, Jewel Luxury tokens, dan aksesibilitas WCAG 2.2 AA.
  - **Bab 5–6**: Spesifikasi detail layar S01–S07 dan 30 katalog template awal (Penugasan/SK, Korespondensi, Keterangan/Pengantar, Berita Acara/Laporan, Operasional Madrasah).
  - **Bab 7–10**: Model `TeacherAssignment`, larangan membuat SK Pembagian Tugas dari draft/requirements, model `DocumentTemplate`, `DocumentRecord`, `DocumentVersion`, `DocumentAttachment`, `AuditEvent`, skema IndexedDB v3, Blob storage terpisah, format backup ber-checksum, aturan nomor surat, finalisasi atomic, dan revisi.
  - **Bab 11–13**: Konsistensi rendering Editor/Preview/PDF pada A4 & F4, syarat POC editor (lisensi gratis/MIT, tanpa Tiptap Pro berbayar), DOCX import/export, keamanan/privasi/regulasi (PMA 12/2026, UU 43/2009, PerANRI 6/2021), integrasi Command Palette & Beranda.
  - **Bab 14–17**: Peta implementasi bertahap Tahap 0–11, Test Matrix skenario dokumen A–F, acceptance utama, regresi akademik, dan quality gates per tahap.

---

### 8. Matriks Keterlacakan Blueprint per Persyaratan

| ID Blueprint | Bab / Subbab Blueprint | Persyaratan / Hasil yang Diharapkan | Status terhadap Source Code | Bukti File / Baris | Kesenjangan / Konflik | Risiko | Rekomendasi | Prioritas Implementasi |
|---|---|---|---|---|---|---|---|---|
| `BP-001` | Bab 2.1 | Verifikasi owner/repo `adizalmumtaz30/SIGNAL-V3-2-Jewel-Luxury`, branch `main`, commit HEAD | BELUM DAPAT DIVERIFIKASI | `git status` exit 128; `package.json:2`, `metadata.json:2` | Tidak ada direktori `.git` di container sandbox AI Studio | Sedang (risiko audit di atas revision tidak sinkron) | Verifikasi branch & commit HEAD di host Git sebelum memulai Tahap 1 | P0 |
| `BP-002` | Bab 1.2 & 4.2–4.3 | Satu aplikasi SIGNAL; pertahankan shell, sidebar 252/76px, topbar 56px, token Jewel Luxury | SESUAI BLUEPRINT | `src/App.tsx:1040-1182`, `src/styles/signal-v3-atelier.css:127,153,319`, `signal-v5-tokens.css` | Shell & token siap dipakai; perlu mekanisme auto-collapse 76px saat masuk S04 & restore state lama saat keluar | Rendah | Gunakan `.app-shell` yang ada dan simpan `prevSidebarCollapsed` untuk S04 | P1 |
| `BP-003` | Bab 1.2 & 2.4 | Pertahankan seluruh fitur akademik eksisting tanpa regresi atau penggantian `App.tsx` | SESUAI BLUEPRINT | `src/App.tsx:97-138`, hasil `vitest run` (37/37 lulus) | Perlu dijaga melalui modularisasi komponen baru dan regression gate di setiap tahap | Tinggi bila dirombak sembarangan | Isolasi modul Persuratan di folder terpisah (`src/domain/persuratan/`, `src/components/persuratan/`) | P0 |
| `BP-004` | Bab 4.1 & 4.4 | Kepatuhan WCAG 2.2 AA (focus trap dialog, return focus, kontras, shortcut aman) & viewport 1440×900 / 1280×720 | SESUAI SEBAGIAN | `SettingsScreen.tsx:2390`, `InspectorSlideDrawer.tsx:138`, `TimeMachineDrawer.tsx:188` | Drawer lama memakai `<div onClick>` tanpa `role="dialog"` / focus trap; uji layout S01–S07 belum ada | Sedang | Terapkan focus management & ARIA standar pada seluruh dialog/drawer baru & toolbar S04 | P1 |
| `BP-005` | Bab 3.1 | Tambahkan tepat 1 menu sidebar baru: **Persuratan & Arsip** dengan sub-tab internal | BELUM DIIMPLEMENTASIKAN | `src/App.tsx:97-138` | `ScreenId` & `navGroups` belum memiliki `'persuratan'` | Rendah | Tambah 1 item pada `navGroups[0]` di Tahap 2 | P1 |
| `BP-006` | Bab 3.2 & 7.4 | Penugasan Guru kontekstual di Data Master, Jadwal, dan Beban Guru tanpa menu sidebar baru | BELUM DIIMPLEMENTASIKAN | `src/App.tsx:2281,3904`, `WorkloadDashboard.tsx`, `InspectorSlideDrawer.tsx:505` | Belum ada tab/panel penugasan & aksi buat SK kontekstual; drawer guru baru untuk edit cepat profil | Tinggi (alur terputus) | Buat sub-view kontekstual Penugasan Guru di Data Master & CTA tervalidasi di Jadwal/Beban | P1 |
| `BP-007` | Bab 5.1 | Layar **S01 Pusat Persuratan & Arsip** (statistik nyata, pencarian, tabel sticky, empty/loading/error) | BELUM DIIMPLEMENTASIKAN | `src/App.tsx` (tidak ditemukan) | Seluruh komponen S01 belum dibuat | Tinggi | Implementasikan pada Tahap 2 berbasis store `documents` | P1 |
| `BP-008` | Bab 5.2 & 6 | Layar **S02 Galeri Template** & 30 katalog template awal (Penugasan, Korespondensi, Keterangan, BA/Laporan, Operasional) | BELUM DIIMPLEMENTASIKAN | `src/App.tsx` (tidak ditemukan) | Belum ada registri template, koleksi favorit, preview dokumen asli, atau impor DOCX | Sedang | Mulai dengan registri template terstruktur & versi read-only untuk bawaan sistem pada Tahap 3 & 7 | P1 |
| `BP-009` | Bab 5.3 | Layar **S03 Form Data Awal**, multi-select guru, validasi tanggal/field, salin nilai ke draft tanpa live binding | BELUM DIIMPLEMENTASIKAN | `src/App.tsx` (tidak ditemukan) | Belum ada form dinamis per template maupun penyimpanan *provenance* snapshot awal | Tinggi (mencegah edit manual tertimpa) | Implementasikan konfigurasi form per template + deep-copy ke draft di Tahap 4 | P1 |
| `BP-010` | Bab 5.4 | Layar **S04 Document Studio** (Word-like editor universal, ribbon, outline kiri, kanvas A4/F4, panel kanan, autosave, `Bandingkan Perubahan Data`) | BELUM DIIMPLEMENTASIKAN | `package.json:16-27` (tidak ada editor package) | Belum ada library rich-text editor; `pdfExport.ts` tidak dapat dipakai sebagai editor | Kritis | Lakukan POC & seleksi library open-source bebas biaya pada Tahap 5 sebelum bangun S04 penuh | P0 |
| `BP-011` | Bab 11.3 | Proof of Concept Editor sebelum mengunci dependency (lisensi MIT/gratis, tanpa paket berbayar, React 19 check, uji Skenario A–F) | BELUM DIIMPLEMENTASIKAN | `package.json:16-38` | Risiko ketidakcocokan peer-dep React 19 & pagination/DOCX jika langsung dipasang tanpa POC | Kritis | Jalankan POC terisolasi (Tiptap Core MIT + `mammoth` + `docx` + CSS `@page`/print engine) di Tahap 5 | P0 |
| `BP-012` | Bab 5.5 | Layar **S05 Preview & Finalisasi** (read-only preview, checklist administrasi, alokasi nomor atomic, kunci snapshot + PDF) | BELUM DIIMPLEMENTASIKAN | `src/App.tsx` (tidak ditemukan) | Belum ada alur pratinjau cetak finalisasi & penguncian versi | Tinggi | Implementasikan pada Tahap 8 | P1 |
| `BP-013` | Bab 5.6 | Layar **S06 Detail Dokumen & Arsip** (Dokumen, Metadata, Lampiran, Riwayat, Buat Revisi tanpa timpa final) | BELUM DIIMPLEMENTASIKAN | `src/App.tsx` (tidak ditemukan) | Belum ada tampilan arsip per dokumen maupun alur revisi non-destruktif | Tinggi | Implementasikan pada Tahap 10 | P1 |
| `BP-014` | Bab 5.7 | Layar **S07 Pengelolaan Template** (bawaan read-only → klon, sanitasi data personal saat *Simpan Sebagai Template*) | BELUM DIIMPLEMENTASIKAN | `src/App.tsx` (tidak ditemukan) | Risiko kebocoran nama/NIP guru ke template jika tidak ada *placeholder sanitizer* | Sedang | Tambahkan fungsi deteksi & pembersihan placeholder saat menyimpan dokumen menjadi template pada Tahap 10 | P2 |
| `BP-015` | Bab 1.1 & 5.1 | Pengelolaan **Surat Masuk** (catat, tanggal terima, pengirim, perihal, disposisi, lampiran, tindak lanjut) | BELUM DIIMPLEMENTASIKAN | `src/App.tsx` (tidak ditemukan) | Belum ada skema & UI pencatatan surat masuk & disposisi | Tinggi | Gabungkan pada domain `DocumentRecord` (`category: 'INCOMING'`) & tab Surat Masuk di S01 | P1 |
| `BP-016` | Bab 2.3 & 7.1 | Model **TeacherAssignment** terpisah dari `Teacher.roleTitle` (multi-tugas, TMT, tahun ajaran, status, link SK) | TIDAK SESUAI/BERKONFLIK (keterbatasan skema lama) | `src/domain/types.ts:20`, `src/domain/seed.ts:66`, `EntityEditModal.tsx:61` | `Teacher.roleTitle` hanya string bebas tunggal; belum ada riwayat atau periode | Tinggi | Tambah entity `TeacherAssignment` di Tahap 1 dengan migrasi non-destruktif dari `roleTitle` | P0 |
| `BP-017` | Bab 2.3 & 7.2–7.3 | Pemisahan `requirements` vs `draft` vs `ScheduleVersion` terbit; SK Pembagian Tugas wajib bersumber dari `ScheduleVersion` valid | TIDAK SESUAI/BERKONFLIK | `WorkloadDashboard.tsx:47`, `InspectorSlideDrawer.tsx:127-128`, `App.tsx:613-641` | `WorkloadDashboard` mencampur `draft ?? activeSchedule`, sedangkan Drawer memakai `requirements` | Tinggi (SK bisa terbit dari draft ilegal) | Pisahkan mode tampilan sumber di `WorkloadDashboard` & kunci sumber SK hanya ke `ScheduleVersion` (`history`) di Tahap 3 & 9 | P0 |
| `BP-018` | Bab 8.1–8.6 | Model data TypeScript kuat: `DocumentTemplate`, `DocumentRecord`, `DocumentVersion`, `DocumentAttachment`, `TeacherAssignment`, `AuditEvent` | BELUM DIIMPLEMENTASIKAN | `src/domain/types.ts:1-198` | Baru memiliki tipe akademik & presensi; tipe `AuditEvent` belum diformalkan di domain | Tinggi | Definisikan seluruh interface pada Tahap 1 | P0 |
| `BP-019` | Bab 9.1–9.2 | IndexedDB upgrade idempotent + store baru (`documents`, `document_versions`, `document_templates`, `document_attachments`, `teacher_assignments`) dengan Blob terpisah | BELUM DIIMPLEMENTASIKAN | `src/storage/db.ts:7-35`, `snapshotEngine.ts:37-82` | Baru DB v2 (`workspace`, `snapshots`, `audit_log`); belum ada penyimpanan Blob terpisah | Kritis (risiko OOM/kuota & kehilangan data lama) | Upgrade ke `DB_VERSION = 3` secara non-destruktif + validasi MIME/ukuran/ekstensi pada Blob store di Tahap 1 & 10 | P0 |
| `BP-020` | Bab 9.4 | Peringatan jujur *Local-first* (tersimpan di browser lokal, tidak ada klaim cloud sync) | SESUAI SEBAGIAN | `src/App.tsx:1090,1377`, `BackupScreen:6207` | UI sudah menyebut lokal aktif; namun di beberapa komponen backup masih tertulis istilah keliru ("terenkripsi" di `TimeMachineDrawer.tsx:297`) | Rendah | Bersihkan seluruh salinan kata "enkripsi/cloud" dan pertahankan narasi local-first jujur | P1 |
| `BP-021` | Bab 2.3 & 9.3 | Backup versioned + **wajib verifikasi SHA-256 saat restore**, validasi schema, konfirmasi & rollback aman | TIDAK SESUAI/BERKONFLIK | `src/storage/snapshotEngine.ts:219-239`, `src/storage/db.ts:160-177` | `parseSignalFile()` tidak mengecek checksum sama sekali; `db.ts` menolak `schemaVersion !== 1` & melewati cek jika field `checksum` kosong | Kritis (file corrupt lolos restore) | Perketat verifikasi checksum pada `parseSignalFile` & dukung `schemaVersion` berversi (v1/v2) di Tahap 1 & 10 | P0 |
| `BP-022` | Bab 10 | Penomoran surat saat finalisasi, cegah duplikasi lokal, final immutable, revisi membuat `DocumentVersion` baru | BELUM DIIMPLEMENTASIKAN | `src/App.tsx` (tidak ditemukan) | Belum ada alokasi nomor berurutan, kunci immutable, maupun proteksi multi-tab `BroadcastChannel`/transaction lock | Tinggi | Bangun mesin penomoran transaksional IndexedDB & workflow revisi di Tahap 8 | P1 |
| `BP-023` | Bab 2.3 & 11.1–11.2, 11.4 | Konsistensi rendering Editor/Preview/PDF pada A4 & F4, header tabel berulang, dan impor/ekspor DOCX terperingatkan | SESUAI SEBAGIAN | `src/utils/pdfExport.ts:63-93`, `207-305` | Dimensi A4/F4 & Kop Surat untuk jadwal/presensi sudah ada di `pdfExport.ts`, tetapi belum ada renderer terpadu dari content model S04 & DOCX | Kritis | Pisahkan renderer S04 dari `pdfExport.ts`; uji konsistensi preview↔PDF & repeating `<thead>` di Tahap 5 POC | P0 |
| `BP-024` | Bab 2.3 & 5.4 | Unifikasi shortcut keyboard global (`Ctrl+K` hyperlink di editor, `Ctrl+Shift+P` Command Palette) tanpa bentrok Master | TIDAK SESUAI/BERKONFLIK | `src/App.tsx:244-252`, `3977-3999` | Dual listener `Ctrl+K` antara global & `MasterScreen`; tidak mengecualikan fokus `[contenteditable]` | Tinggi | Buat policy dispatcher keyboard terpusat sebelum integrasi S04 di Tahap 6/9 | P1 |
| `BP-025` | Bab 12 (Regulasi) | Verifikasi kesesuaian Tata Naskah Dinas **PMA 12/2026**, **UU 43/2009**, **Peraturan ANRI 6/2021**, dan **JRA** | BELUM DAPAT DIVERIFIKASI | Tidak ada kode regulasi di `src/`; tidak ada akses web | Naskah resmi peraturan terkait & JRA madrasah tidak tersedia di workspace dan belum diverifikasi eksternal | Sedang (kepatuhan administratif) | Tandai sebagai kebutuhan verifikasi pemilik; jangan kunci aturan retensi/hapus otomatis tanpa JRA resmi | P1 |
| `BP-026` | Bab 2.3 & 12 (Privasi & Keamanan) | Pisahkan nilai demo vs identitas madrasah nyata; batasi tampilan NIP/PII berlebih; sanitasi HTML & file upload | SESUAI SEBAGIAN | `src/storage/db.ts:45-60`, `SettingsScreen.tsx:211-248`, `madrasahLogo.ts:170-219`, `server.ts:55-82` | `loadAppState` otomatis mengisi data demo ke settings kosong; `madrasahLogo.ts` belum membatasi size MB / SVG script eksplisit; `AppState.dataMode` bisa ditutup user padahal teks demo masih aktif | Tinggi (surat resmi tercetak atas nama lembaga fiktif) | Tambah `identityVerified`/`isDemoIdentity` check & modal konfirmasi identitas nyata sebelum finalisasi surat resmi | P0 |
| `BP-027` | Bab 13.1–13.2 | Perluasan `CommandPaletteModal` (cari nomor/judul/perihal/guru/template + aksi cepat persuratan) & panel ringkas Beranda | BELUM DIIMPLEMENTASIKAN | `CommandPaletteModal.tsx:62-206`, `App.tsx:1909` | Palette baru mengindeks jadwal, guru, kelas, mapel; Beranda belum memiliki panel tindakan administrasi persuratan | Sedang | Integrasikan di Tahap 11 memakai index pencarian bersama | P2 |
| `BP-028` | Bab 14–15 | Quality gates & test matrix multipage (Skenario A–F) + regression suite akademik lengkap | BELUM DIIMPLEMENTASIKAN (untuk Persuratan); Akademik lulus | `tests/` (9 file, 37 test lulus; tidak ada test persuratan) | Belum ada test S01–S07, A–F multipage, maupun checksum backup | Tinggi | Tambah automated tests & uji browser 1440×900 / 1280×720 pada setiap akhir tahap | P1 |

---

### 9. Ringkasan Jumlah Persyaratan Blueprint menurut Status

| Status terhadap Source Code | Jumlah Persyaratan | Daftar ID Blueprint |
|---|---:|---|
| **SESUAI BLUEPRINT** | 2 | `BP-002`, `BP-003` |
| **SESUAI SEBAGIAN** | 4 | `BP-004`, `BP-020`, `BP-023`, `BP-026` |
| **BELUM DIIMPLEMENTASIKAN** | 16 | `BP-005`, `BP-006`, `BP-007`, `BP-008`, `BP-009`, `BP-010`, `BP-011`, `BP-012`, `BP-013`, `BP-014`, `BP-015`, `BP-018`, `BP-019`, `BP-022`, `BP-027`, `BP-028` |
| **TIDAK SESUAI / BERKONFLIK** | 4 | `BP-016`, `BP-017`, `BP-021`, `BP-024` |
| **BELUM DAPAT DIVERIFIKASI** | 2 | `BP-001`, `BP-025` |
| **TIDAK RELEVAN** | 0 | — |
| **TOTAL** | **28** | (`2 + 4 + 16 + 4 + 2 + 0 = 28` tervalidasi tepat) |

**Catatan Ringkas Gap Paling Kritis:**
1. Belum tersedianya skema penyimpanan/migrasi IndexedDB v3 dengan pemisahan Blob (`BP-019`) serta verifikasi checksum restore (`BP-021`).
2. Belum adanya POC teruji untuk Document Studio S04 & mesin cetak A4/F4 yang konsisten antara editor, preview, dan PDF tanpa library berbayar (`BP-010`, `BP-011`, `BP-023`).
3. Konflik sumber beban kerja untuk SK (`BP-017`) serta keterbatasan `Teacher.roleTitle` (`BP-016`) dan `Ctrl+K` (`BP-024`) di kode eksisting.

---

### 10. Temuan Terperinci (`PERS-*` dan Gap `BP-*`)

> Penomoran **PERS-** merangkum temuan teknis konkret pada source code saat ini (12 temuan: 2 Kritis, 5 Tinggi, 3 Sedang, 1 Rendah, 1 Info). Gap persyaratan target blueprint dirujuk melalui ID **BP-001 s.d. BP-028** pada Bagian 8.

#### `PERS-001` — Belum Terdapat Modul Domain, UI, maupun Store Persuratan & Arsip Digital
- **Tingkat Risiko:** KRITIS · **Status Bukti:** TERBUKTI
- **Bukti:** `src/App.tsx:97-138`; `src/domain/types.ts:1-198`; `src/storage/db.ts:7-35`; hasil grep `persuratan|DocumentRecord|TeacherAssignment` di `src/` menghasilkan nol modul persuratan.
- **Kondisi Saat Ini:** Aplikasi baru mencakup 11 layar penjadwalan, master data, validasi, beban kerja, presensi, riwayat, backup, dan pengaturan. Belum ada komponen S01–S07, katalog template, pencatatan surat masuk/keluar, penomoran, maupun pengarsipan.
- **Dampak:** Tujuan perluasan aplikasi di `BLUEPRINT_UTAMA` belum dapat dijalankan sama sekali sebelum dibangun bertahap dari fondasi data.
- **Rekomendasi Tindakan:** Implementasikan sesuai urutan Tahap 1–11 (domain & IndexedDB v3 lebih dahulu sebelum UI S01–S07) di dalam shell `App.tsx` yang sama.
- **Kriteria Penerimaan:** Menu tunggal `Persuratan & Arsip` hadir di sidebar SIGNAL, seluruh alur S01–S07 berfungsi lokal-first, dan 0 regresi pada 11 layar lama.

#### `PERS-002` — Ketiadaan Library Document Studio & Mesin Render/Pagination Konsisten (A4/F4)
- **Tingkat Risiko:** KRITIS · **Status Bukti:** TERBUKTI
- **Bukti:** `package.json:16-38` (hanya `jspdf`, `jspdf-autotable`); `src/utils/pdfExport.ts:63-93, 207-305`.
- **Kondisi Saat Ini:** Tidak ada rich-text editor maupun HTML sanitizer terpasang. `pdfExport.ts` (~2.470 baris) membangun dokumen jadwal & presensi dengan koordinat tetap `jsPDF` + `autoTable` yang terpisah dari pratinjau React.
- **Dampak:** Tidak memungkinkan pengeditan bebas ala Word untuk SK, Surat Tugas, Undangan, maupun menjaga kesamaan visual 1:1 antara pratinjau layar dan hasil cetak PDF pada kertas A4 & F4 beserta tabel panjang lintas halaman.
- **Rekomendasi Tindakan:** Jangan perluas `pdfExport.ts` untuk surat bebas. Lakukan POC Tahap 5 memakai kandidat gratis/MIT (seperti **Tiptap Core + `prosemirror-tables` MIT + `dompurify` + `mammoth` + `docx`**, plus uji print-engine CSS `@page` vector vs renderer PDF) dan verifikasi Skenario A–F pada React 19 sebelum integrasi penuh.
- **Kriteria Penerimaan:** Laporan POC Tahap 5 terverifikasi untuk A4/F4 portrait/landscape, repeating `<thead>`, paste Word ter-sanitasi, dan konsistensi preview↔PDF tanpa dependency berbayar.

#### `PERS-003` — Celah Verifikasi Checksum SHA-256 & Kekakuan Versi Skema pada Backup/Restore
- **Tingkat Risiko:** TINGGI · **Status Bukti:** TERBUKTI
- **Bukti:** `src/storage/snapshotEngine.ts:179-239` (`exportSignalFile` menghitung SHA-256, `parseSignalFile` tidak memeriksa `checksum` sama sekali); `src/storage/db.ts:166, 171-175` (`if (parsed.schemaVersion !== 1)` dan `if (parsed.checksum && ...)`).
- **Kondisi Saat Ini:** (1) Impor file `.signal` melalui Time Machine melewati validasi integritas checksum seluruhnya; (2) `parseBackupFile` akan menerima file tanpa error jika properti `checksum` sengaja dihapus/terhapus; (3) label UI/komentar di `TimeMachineDrawer.tsx:297` & `snapshotEngine.ts:179` salah menyebut `.signal` sebagai "terenkripsi" padahal hanya JSON polos ber-SHA-256.
- **Dampak:** Berkas cadangan yang rusak/terpotong atau dimodifikasi diam-diam dapat menimpa seluruh workspace dan arsip persuratan tanpa peringatan; migrasi ke `schemaVersion: 2` akan tertolak oleh parser lama.
- **Rekomendasi Tindakan:** Wajibkan verifikasi SHA-256 pada `parseSignalFile()` dan `parseBackupFile()` untuk format baru/ber-checksum (beri peringatan eksplisit jika format legacy tanpa checksum), dukung migrasi `schemaVersion` 1 → 2+, dan perbaiki teks UI agar menyebut "Terverifikasi SHA-256" alih-alih "Terenkripsi".
- **Kriteria Penerimaan:** Unit test membuktikan file dengan 1 byte payload diubah atau checksum dihapus ditolak pada alur impor `.signal` dan `.json`.

#### `PERS-004` — Konflik Dual Listener Pintasan Keyboard `Ctrl+K` / `Cmd+K` dan `N`
- **Tingkat Risiko:** TINGGI · **Status Bukti:** TERBUKTI
- **Bukti:** `src/App.tsx:244-252` (global `handleGlobalKey` membuka `CommandPaletteModal`); `src/App.tsx:3977-3999` (`MasterScreen` `handleKeyDown` memfokuskan `searchInputRef` pada `Ctrl/Cmd+K` dan memicu modal tambah pada tombol `n`/`N`).
- **Kondisi Saat Ini:** Saat pengguna berada di Data Master, menekan `Ctrl+K` mengeksekusi kedua listener sekaligus. Lebih jauh, pengecekan `isInput` di baris `3979` hanya mengecek `INPUT`, `TEXTAREA`, `SELECT` — tidak memeriksa `isContentEditable` maupun fokus editor teks kaya.
- **Dampak:** Akan langsung bertabrakan dengan pintasan standar editor `Ctrl+K` (sisip hyperlink) pada Document Studio S04 dan berpotensi mengganggu pengetikan teks kaya.
- **Rekomendasi Tindakan:** Satukan manajemen pintasan dalam satu dispatcher terpusat yang mengenali konteks aktif (`[data-doc-editor="true"]` / `isContentEditable`): gunakan `Ctrl+Shift+P` (atau `Ctrl+K` saat di luar editor) untuk Command Palette dan serahkan `Ctrl+K` kepada editor saat kanvas fokus.
- **Kriteria Penerimaan:** Menekan `Ctrl+K` di editor membuka dialog hyperlink; di luar editor membuka Command Palette; di pencarian Master memakai pintasan khusus non-bentrok (`/` atau tombol fokus terpisah).

#### `PERS-005` — Ketidakkonsistenan Sumber Beban Mengajar Guru sebagai Dasar SK Resmi
- **Tingkat Risiko:** TINGGI · **Status Bukti:** TERBUKTI
- **Bukti:** `src/components/WorkloadDashboard.tsx:47` (`state.draft ?? state.activeSchedule ?? []`); `src/components/InspectorSlideDrawer.tsx:127-128` (`state.requirements`); `src/App.tsx:613-641` (`publishDraft` ke `history: ScheduleVersion[]`).
- **Kondisi Saat Ini:** `WorkloadDashboard` menampilkan statistik dari draf jadwal yang belum diterbitkan jika `state.draft` tidak null, sementara drawer profil guru membaca rencana alokasi `requirements`.
- **Dampak:** Jika SK Pembagian Tugas Mengajar dibuat langsung dari data tampilan saat ini, surat keputusan resmi berisiko mencatat pembagian jam dari jadwal *draft* yang masih mengandung bentrok atau belum disahkan.
- **Rekomendasi Tindakan:** Tambahkan indikator/pemilih sumber eksplisit di `WorkloadDashboard` (*Jadwal Resmi Terpublikasi* vs *Draft Kerja*), dan kunci pembangkitan SK Pembagian Tugas agar **hanya** menerima `ScheduleVersion` dari `state.history` (menyimpan `sourceScheduleVersionId` & `fingerprint` di metadata SK).
- **Kriteria Penerimaan:** Tombol *"Buat SK Pembagian Tugas"* diblokir atau memberi panduan publikasi bila belum ada `ScheduleVersion` valid atau masih ada draft yang belum disahkan; setiap SK menyimpan referensi versi & fingerprint jadwal sumbernya.

#### `PERS-006` — Model `Teacher.roleTitle` Tunggal Tidak Mendukung Multi-Penugasan & Riwayat
- **Tingkat Risiko:** TINGGI · **Status Bukti:** TERBUKTI
- **Bukti:** `src/domain/types.ts:13-24` (`roleTitle?: string`); `src/domain/seed.ts:66, 76, 86, 96`; `src/components/EntityEditModal.tsx:61`; `src/App.tsx:668`.
- **Kondisi Saat Ini:** Jabatan struktural maupun tugas tambahan guru digabung dalam satu teks string bebas (mis. `'Waka Kurikulum / Guru Mapel'`).
- **Dampak:** Tidak memungkinkan pelacakan tugas ganda lintas tahun ajaran, tanggal efektif mulai/selesai (TMT), status penugasan aktif/selesai, validasi bentrok tugas, maupun penautan langsung ke nomor SK/Surat Tugas yang menerbitkannya.
- **Rekomendasi Tindakan:** Tambahkan entitas `TeacherAssignment` di store terpisah/domain pada Tahap 1, migrasikan `roleTitle` awal secara non-destruktif sebagai penugasan awal, dan kelola secara kontekstual di Data Master, Beban Guru, dan Jadwal tanpa membuat menu sidebar baru.
- **Kriteria Penerimaan:** 1 guru dapat memiliki ≥2 penugasan berbeda dengan tanggal/tahun ajaran berbeda dan tertaut ke dokumen SK terkait, sementara tabel Master guru lama tetap menampilkan ringkasan peran dengan benar.

#### `PERS-007` — Pencampuran Nilai Demo Default dengan Identitas Lembaga Nyata
- **Tingkat Risiko:** TINGGI · **Status Bukti:** TERBUKTI
- **Bukti:** `src/storage/db.ts:45-60` (mengisi string `MTs Cendekia Nusantara`, NIP fiktif, dll. jika field kosong saat `loadAppState()`); `src/components/SettingsScreen.tsx:211-248`; `src/utils/pdfExport.ts:217-229`; `src/App.tsx:1185-1195`.
- **Kondisi Saat Ini:** Banner demo di `App.tsx:1193` dapat disembunyikan operator dengan men-set `dataMode = 'custom'`, meskipun field `settings` dan `teachers` masih berisi data contoh `createDemoState()`. Selain itu `loadAppState()` menambal field yang dikosongkan user kembali ke teks demo!
- **Dampak:** Saat fitur Persuratan diaktifkan, operator bisa tanpa sadar mencetak/memfinalisasi SK atau surat resmi menggunakan nama, NSM, NPSN, atau tanda tangan Kepala Madrasah simulasi.
- **Rekomendasi Tindakan:** Hentikan penimpaan balik ke teks demo pada `loadAppState()` untuk `dataMode === 'custom'`, tambahkan status verifikasi identitas madrasah nyata, dan munculkan peringatan wajib sebelum finalisasi/ekspor PDF surat jika workspace masih memakai identitas demo.
- **Kriteria Penerimaan:** Menghapus/mengosongkan field identitas di Settings tidak diisi ulang oleh teks demo saat reload; finalisasi surat menampilkan peringatan jelas bila identitas lembaga belum terverifikasi.

#### `PERS-008` — Belum Adanya Autentikasi, Kontrol Akses (RBAC), dan Pencatatan Aktor Lokal
- **Tingkat Risiko:** SEDANG · **Status Bukti:** TERBUKTI
- **Bukti:** `src/App.tsx:1171-1179`; `server.ts:47-82`; `src/storage/snapshotEngine.ts:90-96`.
- **Kondisi Saat Ini:** Aplikasi berjalan sebagai single-operator workspace lokal tanpa login atau pembedaan hak akses (Operator TU vs Kepala Madrasah vs Waka). Audit log saat ini hanya mencatat peristiwa snapshot.
- **Dampak:** Pembatasan akses template, kewenangan finalisasi/pembatalan SK, maupun pencatatan `actor` pada `AuditEvent` belum dapat ditegakkan lintas pengguna nyata dalam satu instansi (hanya dapat berupa profil aktor lokal/pengaman UI bila tetap single-device local-first).
- **Rekomendasi Tindakan:** Tetap jujur menyatakan mode single-operator lokal pada tahap awal; tambahkan identifikasi aktor lokal (*operator/penandatangan aktif*) di `AuditEvent` serta konfirmasi berjenjang sebelum finalisasi/pembatalan, tanpa menyebut kontrol UI lokal sebagai sistem keamanan multi-user.
- **Kriteria Penerimaan:** Setiap perubahan status dokumen mencatat `localActor`, waktu WIB/ISO, dan ringkasan aksi di `audit_log` tanpa klaim otorisasi server jika belum ada backend auth.

#### `PERS-009` — Risiko Kuota & Performa IndexedDB jika Lampiran Disimpan di `AppState`
- **Tingkat Risiko:** SEDANG · **Status Bukti:** TERBUKTI
- **Bukti:** `src/storage/snapshotEngine.ts:37-82` (`cloneState` dengan `JSON.parse(JSON.stringify(state))`); `src/storage/db.ts:128-131`.
- **Kondisi Saat Ini:** Setiap kali `workspace` berubah, seluruh `AppState` ditulis ulang (`db.put(STORE_NAME, { id: 'main', state })`), dan `createSnapshot` mengkloning `AppState` penuh hingga 20+ kali.
- **Dampak:** Menyimpan isi dokumen panjang beserta lampiran PDF/gambar base64 di dalam `AppState` akan menyebabkan freeze UI setiap mengetik (autosave) dan penggandaan pemakaian disk browser 20× lipat.
- **Rekomendasi Tindakan:** Simpan `documents`, `document_versions`, `document_templates`, `teacher_assignments`, dan `document_attachments` (berisi `Blob` biner asli) pada object store terpisah dengan `idb`, terlepas dari `workspace` utama.
- **Kriteria Penerimaan:** Mengetik & autosave di editor S04 tidak memicu penulisan ulang `workspace` maupun duplikasi Blob lampiran ke store `snapshots`.

#### `PERS-010` — Batas `CommandPaletteModal` & Risiko Konkurensi Penomoran Multi-Tab
- **Tingkat Risiko:** SEDANG · **Status Bukti:** TERBUKTI
- **Bukti:** `src/components/CommandPaletteModal.tsx:17-141`; `src/storage/db.ts:15-35`.
- **Kondisi Saat Ini:** `CommandPaletteModal` memiliki props `onNavigate` terbatas (`'schedule' | 'master' | 'workload' | 'attendance' | 'settings'`) dan belum memiliki service pencarian bersama. `openSignalDB()` tidak memiliki sinkronisasi `BroadcastChannel` atau `navigator.locks` antar-tab.
- **Dampak:** Jika operator membuka dua tab browser bersamaan dan memfinalisasi dua surat keluar, alokasi nomor urut surat berisiko bertabrakan atau menimpa counter di IndexedDB.
- **Rekomendasi Tindakan:** Implementasikan transaksi IndexedDB *readwrite* atomik untuk alokasi nomor surat serta kunci tab lokal via Web Locks API / `BroadcastChannel` saat finalisasi; perluas `CommandPaletteModal` memakai service indeks bersama pada Tahap 11.
- **Kriteria Penerimaan:** Uji dua kali finalisasi berturut-turut / lintas tab dalam satu browser menghasilkan nomor urut unik tanpa celah ganda, disertai catatan jujur bahwa keunikan berlaku dalam lingkup penyimpanan perangkat lokal tersebut.

#### `PERS-011` — Validasi Upload Gambar di `madrasahLogo.ts` Belum Membatasi Ukuran & Signature File
- **Tingkat Risiko:** RENDAH · **Status Bukti:** TERBUKTI
- **Bukti:** `src/utils/madrasahLogo.ts:170-219`.
- **Kondisi Saat Ini:** Hanya memeriksa `file.type.startsWith('image/')` tanpa batas maksimal ukuran file (mis. 5 MB) dan mengizinkan `image/svg+xml` masuk `FileReader` sebelum di-render ke canvas.
- **Dampak:** Dapat dijadikan referensi keliru saat membangun pengunggah lampiran PDF/DOCX/gambar di S03/S04/S06.
- **Rekomendasi Tindakan:** Saat membangun pengunggah lampiran persuratan di Tahap 8/10, terapkan validator khusus yang mengecek whitelist ekstensi + MIME + batas ukuran file + *magic bytes* (`%PDF-`, PNG/JPEG header, ZIP `PK` untuk DOCX), menyimpan file dengan ID internal acak, dan tidak merender HTML/SVG aktif di preview.
- **Kriteria Penerimaan:** Unggahan `.exe`, `.html`, `.svg` atau file > batas ukuran dengan ekstensi dipalsukan ditolak sebelum masuk ke IndexedDB.

#### `PERS-012` — Keterbatasan Lingkungan: Tanpa `.git` Lokal & Belum Diverifikasinya Regulasi Eksternal
- **Tingkat Risiko:** INFO · **Status Bukti:** TERBUKTI (`.git` absen) / BELUM DIVERIFIKASI (regulasi eksternal)
- **Bukti:** `git status -sb` (exit code 128); `BLUEPRINT_UTAMA`:683-685, 900-903.
- **Kondisi Saat Ini:** Sandbox tidak memiliki riwayat git dan tidak melakukan pengambilan naskah hukum PMA 12/2026, UU 43/2009, Peraturan ANRI 6/2021, maupun Jadwal Retensi Arsip (JRA) resmi.
- **Dampak:** Audit kepatuhan tata naskah dinas & retensi arsip belum dapat disahkan secara hukum.
- **Rekomendasi Tindakan:** Tetap jadikan aturan format penomoran, klasifikasi, kop surat, dan retensi dapat dikonfigurasi oleh madrasah tanpa fitur auto-delete arsip berdasarkan umur berkas.
- **Kriteria Penerimaan:** Aplikasi tidak mengklaim kepatuhan otomatis PMA 12/2026 / JRA tanpa verifikasi dokumen resmi oleh pengguna.

---

### 11. Matriks Kesiapan Fitur Persuratan & Arsip

| Area | Kondisi Saat Ini | Bukti | Kesenjangan | Risiko | Rekomendasi | Prioritas |
|---|---|---|---|---|---|---|
| Shell Aplikasi & Tema Jewel Luxury | SUDAH ADA DAN TERVERIFIKASI | `App.tsx:1040-1182`, `signal-v3-atelier.css`, `signal-v5-tokens.css` | Perlu tambahan 1 menu sidebar & auto-collapse 76px khusus S04 | Rendah | Tambah `persuratan` ke `ScreenId` & `navGroups` | P1 |
| Identitas Madrasah & Penandatangan | ADA SEBAGIAN | `SettingsScreen.tsx:210-248`, `db.ts:45-60` | Belum dibedakan status data demo vs data resmi nyata saat finalisasi surat | Tinggi | Tambah flag verifikasi identitas & warning pre-finalisasi | P0 |
| Data Guru & Penugasan | ADA SEBAGIAN | `types.ts:13-24`, `MasterScreen` | Hanya `roleTitle` string tunggal; sumber beban dashboard & drawer tidak sinkron | Tinggi | Tambah `TeacherAssignment` & kunci SK ke `ScheduleVersion` | P0 |
| Domain Persuratan (Surat Masuk/Keluar/Arsip/Nomor) | BELUM DITEMUKAN | `src/` (`NO_PERSURATAN_FOUND`) | Seluruh model & logika persuratan/penomoran belum ada | Kritis | Bangun di `src/domain/persuratan/` pada Tahap 1 & 4 | P0 |
| Universal Document Studio (S04) & POC | BELUM DITEMUKAN | `package.json:16-38` | Belum ada editor package, sanitizer paste Word, maupun mesin pagination A4/F4 konsisten | Kritis | POC Tiptap Core MIT + `mammoth`/`docx`/`dompurify` di Tahap 5 | P0 |
| Layar S01–S07 & 30 Katalog Template | BELUM DITEMUKAN | `src/App.tsx`, `src/components/` | Seluruh halaman S01–S07 belum ada | Tinggi | Implementasikan bertahap Tahap 2, 3, 4, 6, 7, 8, 10 | P1 |
| Penyimpanan IndexedDB v3 & Lampiran Blob | ADA SEBAGIAN | `db.ts:7-35`, `snapshotEngine.ts` | Masih DB v2; backup/restore `.signal` tidak verifikasi checksum | Kritis | Migrasi ke `DB_VERSION = 3` + wajib verifikasi SHA-256 | P0 |
| Rendering PDF A4/F4 Konsisten (Surat) | ADA SEBAGIAN | `pdfExport.ts:63-93` | Hanya mendukung jadwal/presensi hardcoded `jsPDF`, bukan konten dinamis S04 | Kritis | Rancang renderer terpadu Editor↔Preview↔PDF pada POC Tahap 5 | P0 |
| Pencarian & Command Palette | ADA SEBAGIAN | `CommandPaletteModal.tsx`, `App.tsx:244,3981` | Konflik dual listener `Ctrl+K`; belum mengindeks dokumen/template/arsip | Tinggi | Unifikasi dispatcher shortcut & shared search index | P1 |
| Autentikasi & Kontrol Akses (RBAC) | BELUM DITEMUKAN | `App.tsx:1171`, `server.ts` | Aplikasi berjalan lokal single-operator tanpa login/otorisasi | Sedang | Catat aktor lokal di audit log; jangan klaim kontrol akses multi-user aman | P2 |
| Kepatuhan Regulasi (PMA 12/2026 & JRA) | BELUM DIVERIFIKASI | `BLUEPRINT_UTAMA:683-685` | Naskah hukum eksternal & JRA belum dapat diverifikasi di sandbox | Sedang | Konfigurasi fleksibel + larangan auto-purge arsip tanpa JRA | P1 |
| Test Matrix Persuratan & Regression | ADA SEBAGIAN | `tests/` (37 tes akademik lulus) | Belum ada tes persuratan, Skenario A–F, maupun checksum backup | Tinggi | Tambah suite pengujian pada setiap tahap (Tahap 1–11) | P1 |

---

### 12. Matriks Integrasi dengan Menu / Modul SIGNAL yang Ada

*(Catatan pemisahan: **Severity** mengukur dampak kesalahan bila terjadi; **Prioritas P0–P3** menentukan urutan kerja perbaikan berdasarkan ketergantungan arsitektur).*

| Modul SIGNAL Eksisting | Lokasi Saat Ini | Bentuk Integrasi yang Direkomendasikan | Perubahan pada Fitur Lama | Risiko Konflik |
|---|---|---|---|---|
| **Sidebar & Navigasi** | `src/App.tsx:97-138` | Tambah tepat **1** menu: `Persuratan & Arsip` (`S01`) dengan sub-tab internal | Nol perubahan pada 10 item sidebar lama | Sangat rendah |
| **Beranda (`Overview`)** | `src/App.tsx:1909+` | Tambah 1 panel ringkas *Tindakan Administrasi* (4 angka aktual dapat diklik) di Tahap 11 | Tidak menambah dashboard kedua atau menghapus kartu KPI jadwal | Rendah |
| **Data Master → Guru** | `src/App.tsx:3904+`, `EntityEditModal.tsx`, `InspectorSlideDrawer.tsx` | Pertahankan `InspectorSlideDrawer` untuk edit cepat; tambah tab/modal konteks *"Penugasan & Dokumen Guru"* dari aksi baris/detail guru | Sinkronisasi ringkasan `TeacherAssignment` tanpa menghapus dukungan `roleTitle` lama | Sedang (konflik shortcut `Ctrl+K`/`N` harus diatasi) |
| **Jadwal Pelajaran** | `src/App.tsx:2281+`, `publishDraft:613` | Tambah tombol kontekstual *"Buat SK Pembagian Tugas"* yang hanya merujuk `ScheduleVersion` terbaru di `history` | Alur drag-drop, generator, dan publish draft tidak berubah | Rendah |
| **Beban Guru** | `src/components/WorkloadDashboard.tsx` | Tambah pemilih/penanda jelas *Sumber Data (Jadwal Terpublikasi vs Draft)* & ringkasan JP tugas tambahan + tombol *"Buat SK"* | Statistik JP KBM tetap akurat; menghindari dasar SK dari `draft` | Sedang |
| **Pengaturan** | `src/components/SettingsScreen.tsx` | Tambah status kesiapan identitas resmi vs demo & tab/bagian pengaturan penomoran surat | Tab Jam KBM, Identitas/Kop, Pejabat Pengesah, AI/Reset tetap utuh | Rendah |
| **Command Palette** | `src/components/CommandPaletteModal.tsx` | Perluas hasil dengan Dokumen, Nomor Surat, Perihal, Template, dan Aksi Cepat Persuratan | Menambahkan `persuratan` ke tipe navigasi `onNavigate`; unifikasi `Ctrl+K`/`Ctrl+Shift+P` | Sedang |
| **Time Machine & Backup** | `src/storage/db.ts`, `snapshotEngine.ts`, `TimeMachineDrawer.tsx` | Tambah verifikasi SHA-256 wajib & bundel backup terversi v2 (metadata persuratan + manifest lampiran) | File backup v1 lama tetap bisa direstore dengan migrasi otomatis | Tinggi (bila skema tidak backward-compatible) |

---

### 13. Risiko Regresi terhadap Fitur Lama

1. **Kerusakan Data Backup Lama / State `AppState`**: Mengubah struktur `AppState` atau `DB_VERSION` tanpa migrasi idempoten dapat membuat pengguna lama kehilangan jadwal atau gagal impor backup JSON/`.signal`.
2. **Stall/Freeze UI & Gagal Simpan Time Machine**: Menyimpan body HTML besar atau file lampiran PDF base64 di dalam `AppState` akan melumpuhkan `saveAppState()` dan `createSnapshot()`.
3. **Bentrok CSS Global pada Tabel & Form Lama**: Menambahkan stylesheet Document Studio (Ribbon, Page Paper, ProseMirror table styling) tanpa selector ter-scope (`.s4-studio-root ...`) dapat mengubah tampilan `.data-table` di Data Master atau `AttendanceScreen`.
4. **Gangguan Shortcut di Data Master & Jadwal**: Mengubah listener `Ctrl+K` atau `Escape` tanpa menjaga `InspectorSlideDrawer`, `CommandPaletteModal`, dan `MasterScreen` berisiko merusak navigasi keyboard yang sudah berjalan.
5. **Regresi Perhitungan Jam/Beban KBM**: Penambahan konversi/ekuivalensi JP tugas tambahan pada `TeacherAssignment` tidak boleh mengotori validasi slot KBM deterministik (`validator.ts` & `generator.ts`).

---

### 14. Rekomendasi Arsitektur dan Model Data Tingkat Desain (Tanpa Mengubah Kode)

1. **Pemisahan Object Store IndexedDB (`DB_VERSION = 3`)**:
   - Tetap pertahankan: `workspace`, `snapshots`, `audit_log`.
   - Tambah store baru:
     - `teacher_assignments` (index: `teacherId`, `academicYear`, `status`, `sourceScheduleVersionId`).
     - `documents` (index: `status`, `documentType`, `category`, `documentNumber`, `updatedAt`, `parentDocumentId`, `relatedTeacherIds` multiEntry).
     - `document_versions` (index: `documentId`, `versionNumber`, `sourceScheduleVersionId`).
     - `document_templates` (index: `category`, `source`, `isFavorite`).
     - `document_attachments` (menyimpan `{ id, documentId, versionId, filenameOriginal, mimeType, sizeBytes, checksumSHA256, category, blob: Blob, createdAt }`).
2. **Alur Data Snapshot (Anti-Overwrite)**:
   - S03 menyalin data `AppSettings` + `Teacher` + `TeacherAssignment` + `ScheduleVersion` ke `DocumentRecord.sourceSnapshot` dan menanamkan hasil terformat awal ke `contentJSON`.
   - Setelah masuk S04, seluruh suntingan hanya mengubah `contentJSON` di `documents`. Jika Master Data berubah, tombol `Bandingkan Perubahan Data` di panel kanan hanya menampilkan *diff* agar operator memilih mana nilai yang ingin disalin ulang.
3. **Siklus Hidup Dokumen & Nomor Surat**:
   - `TEMPLATE` (read-only sistem / custom) → klon ke `DRAFT` (`documentNumber: null`) → `REVIEW` (opsional) → finalisasi atomic di S05 (alokasi nomor unik dalam transaksi IndexedDB + Web Lock lokal, buat `DocumentVersion` immutable ke-N + render Blob `FINAL_PDF` ke `document_attachments` + catat `AuditEvent`) → `FINAL` (kunci edit langsung).
   - Koreksi dokumen final wajib melalui aksi **Buat Revisi** yang membuat `DRAFT` baru atau `DocumentVersion` berikutnya dengan `parentDocumentId` / `revisionReason` tanpa menimpa versi terdahulu.
4. **Unifikasi Shortcut Keyboard**:
   - Gunakan helper fokus `isRichEditorFocused(target)` di level `App.tsx`. Saat fokus di dalam S04 Document Studio: `Ctrl/Cmd+K` ditangani editor (hyperlink), `Ctrl/Cmd+S` memicu simpan draft segera, `Ctrl/Cmd+Shift+P` membuka `CommandPaletteModal`.

---

### 15. Rencana Implementasi Bertahap & Pemetaan Gap ke Fase Blueprint

| Tahap | Fokus Utama | Gap yang Diselesaikan | Acceptance Gate |
|---|---|---|---|
| **Tahap 0** | Audit Read-Only *(Selesai lewat laporan ini)* | `BP-001` (dicatat), penemuan seluruh `PERS-001..012` | Laporan `/HASIL_AUDIT_PERSURATAN.md` terverifikasi |
| **Tahap 1** | Model Domain & Migrasi IndexedDB v3 + Checksum Backup | `BP-016`, `BP-018`, `BP-019`, `BP-021`, `PERS-003`, `PERS-009` | Baca/tulis DB v2→v3 aman; unit test migrasi `roleTitle` & penolakan checksum corrupt lulus |
| **Tahap 2** | Pusat Persuratan & Arsip **S01** + 1 Menu Sidebar | `BP-005`, `BP-007`, `BP-015`, `PERS-001` | Menu `Persuratan & Arsip` aktif, tab Surat Masuk/Keluar/Arsip/Template, statistik nyata, 0 regresi lama |
| **Tahap 3** | Galeri Template **S02** + Aturan Sumber Beban `ScheduleVersion` | `BP-008`, `BP-017`, `PERS-005` | Registri template awal + klon read-only; pemisahan sumber beban `ScheduleVersion` vs `draft` selesai |
| **Tahap 4** | Context Form **S03** + Pengaman Identitas Demo | `BP-009`, `BP-026`, `PERS-007` | Form dinamis, multi-select guru, snapshot provenance, warning identitas demo aktif |
| **Tahap 5** | **POC Document Studio S04 & PDF/DOCX** | `BP-010`, `BP-011`, `BP-023`, `PERS-002` | Uji Skenario A–F (A4/F4, tabel 120 baris, repeating header, paste Word, DOCX) lulus tanpa paket berbayar |
| **Tahap 6** | Implementasi Editor Dasar **S04** + Unifikasi Keyboard | `BP-002`, `BP-010`, `BP-024`, `PERS-004` | Sidebar auto-collapse 76px, ribbon, outline, autosave, `Ctrl+K` bebas bentrok |
| **Tahap 7** | S04 Lanjutan (Tabel Kompleks, Gambar, Header/Footer, `Bandingkan Data`) | `BP-010`, `BP-023` | Tabel merge/split, gambar, page break, & diff data master tanpa menimpa edit manual |
| **Tahap 8** | Preview & Finalisasi **S05** + Mesin Penomoran + Revisi | `BP-012`, `BP-022`, `PERS-010` | Penomoran atomik tanpa duplikasi lokal, final immutable + snapshot PDF, alur revisi non-destruktif |
| **Tahap 9** | Integrasi Kontekstual Penugasan Guru (Master, Jadwal, Beban) | `BP-006`, `BP-016`, `BP-017`, `PERS-006` | Multi-penugasan guru & pembuatan SK resmi hanya dari `ScheduleVersion` terbit |
| **Tahap 10** | Arsip **S06**, Pengelolaan Template **S07**, Attachment Store, & Backup v2 | `BP-013`, `BP-014`, `BP-019`, `BP-021`, `PERS-011` | Upload lampiran ber-validasi magic-byte/MIME, sanitasi template, backup/restore full manifest+blob |
| **Tahap 11** | Command Palette, Beranda Panel Ringkas, A11y, & Regression Akhir | `BP-004`, `BP-020`, `BP-027`, `BP-028`, `PERS-008` | WCAG focus trap, search terintegrasi, 1440×900 & 1280×720 teruji, seluruh test & build hijau |

---

### 16. Daftar Pengujian dan Kriteria Penerimaan

1. **Pengujian Unit & Integrasi Storage/Domain (Tahap 1, 3, 8, 10)**:
   - Migrasi IDB v2 → v3 mempertahankan seluruh jadwal, presensi, dan snapshot lama.
   - Verifikasi SHA-256 menolak file `.json`/`.signal` bila payload diubah atau field checksum hilang.
   - Uji `TeacherAssignment` multi-tugas paralel lintas periode & pemblokiran SK jika jadwal masih berstatus `draft` atau `hardErrorCount > 0`.
   - Uji penomoran surat: draft batal tidak menghabiskan nomor; finalisasi berurutan tidak menghasilkan nomor ganda.
2. **Uji POC & Skenario Editor Dokumen (Tahap 5 & 7 — Blueprint 15.1 Skenario A–F)**:
   - Skenario A: Surat Tugas 1 halaman (Kop, judul, isi, peserta, blok TTD).
   - Skenario B: Surat Tugas kolektif 3–5 halaman (25–40 peserta + lampiran).
   - Skenario C: SK 100–120 baris tabel (No, Nama, NIP, Kelas, Mapel, JP) dengan header tabel berulang di halaman 2–N.
   - Skenario D: Tabel kompleks (`colspan`/`rowspan`, tinggi sel bervariasi, multi-paragraf).
   - Skenario E: Dokumen dengan gambar/logo, nomor halaman, blok tanda tangan tidak terbelah di batas halaman.
   - Skenario F: Kertas **A4 Portrait, F4 Portrait, A4 Landscape, dan F4 Landscape** dengan konsistensi preview↔PDF.
3. **Uji Regresi Akademik & Viewport (Setiap Akhir Tahap & Tahap 11)**:
   - Seluruh 37 test eksisting (`vitest run`) wajib tetap lulus.
   - `npm run lint` (`tsc -b`) dan `npm run build` bebas error.
   - Pemeriksaan visual pada viewport `1440 × 900` dan `1280 × 720` serta breakpoint `<= 1024px`.

---

### 17. Hal yang Tidak Dapat Diverifikasi dan Alasannya

1. **Verifikasi Repository GitHub, Branch `main`, dan Commit `HEAD`**: Tidak dapat diverifikasi karena container sandbox `/app/applet` tidak memiliki direktori `.git` (`git status` exit 128).
2. **Kesesuaian Hukum Tata Naskah Dinas & Retensi Arsip (PMA 12/2026, UU 43/2009, Peraturan ANRI 6/2021, serta JRA)**: Tidak dapat diverifikasi secara hukum karena tidak tersedia naskah resmi peraturan perundang-undangan eksternal dan JRA lembaga di workspace audit.
3. **Kompatibilitas Runtime Editor Dokumen Pilihan pada React 19 & Hasil Cetak Multi-Halaman**: Belum dapat diverifikasi karena belum ada package editor terpasang dan Tahap 5 POC belum dijalankan.
4. **Perilaku Visual Browser & Interaksi DOM Live untuk Fitur Persuratan**: Belum dapat diuji karena fitur Persuratan & Document Studio belum diimplementasikan.

---

### 18. Kesimpulan

**Status Keseluruhan: PERLU PRASYARAT & SIAP DILANJUTKAN BERTAHAP KE TAHAP 1.**

Aplikasi **SIGNAL V3.2 Jewel Luxury** yang ada di workspace sudah memiliki fondasi arsitektur, tema, penjadwalan, dan presensi yang solid serta lulus seluruh pemeriksaan TypeScript, Vitest (37/37), dan Vite build. Namun, fitur **Persuratan & Arsip Digital**, **Document Studio (S01–S07)**, dan **Penugasan Guru Terstruktur (`TeacherAssignment`)** saat ini **100% belum diimplementasikan**.

Prasyarat wajib sebelum memulai kode pada Tahap 1:
1. Konfirmasi pemilik repository bahwa workspace ini selaras dengan commit target branch `main` di `adizalmumtaz30/SIGNAL-V3-2-Jewel-Luxury`.
2. Persetujuan untuk memulai **Tahap 1** (Domain Models, IndexedDB v3 dengan Blob store terpisah, migrasi `Teacher.roleTitle`, dan perbaikan verifikasi checksum SHA-256 pada backup/restore `.json`/`.signal`) sebelum menyentuh UI layar S01–S07 maupun memasang dependency editor pada Tahap 5 POC.

---

### 19. Daftar File / Folder yang Benar-Benar Diperiksa

- **Blueprint Utama**: `/BLUEPRINT_UTAMA_SIGNAL_PERSURATAN_ARSIP_DOCUMENT_STUDIO.md` (baris 1–910, dibaca utuh)
- **Root & Konfigurasi**: `/`, `/package.json`, `/metadata.json`, `/index.html`, `/.gitignore`, `/vite.config.ts`, `/server.ts`, `/server/`
- **Entry & Shell**: `/src/main.tsx`, `/src/App.tsx` (baris 1–350, 595–655, 955–1400, 1570–1720, 2281–2460, 3940–4120, 4400–4560, 4700–4860, 6145–6261 + grep simbol navigasi/komponen)
- **Domain & Seed**: `/src/domain/` (`types.ts` utuh, `seed.ts` baris 1–120)
- **Storage & Backup**: `/src/storage/db.ts` (baris 1–184 utuh), `/src/storage/snapshotEngine.ts` (baris 1–261 utuh)
- **Komponen UI**: `/src/components/` (`WorkloadDashboard.tsx` utuh, `InspectorSlideDrawer.tsx` utuh, `CommandPaletteModal.tsx` utuh, `TimeMachineDrawer.tsx` utuh, `AiConflictHelper.tsx` utuh, `SettingsScreen.tsx` baris 1–250 & 1601–2497, `EntityEditModal.tsx` baris 1–220, `SchedulePdfExportModal.tsx` baris 1–60, `AttendanceScreen.tsx` baris 1–60)
- **Utilitas**: `/src/utils/pdfExport.ts` (baris 1–350), `/src/utils/madrasahLogo.ts` (baris 1–220 utuh)
- **Stylesheet**: `/src/styles/signal-v3-atelier.css` (baris 1–260 + grep dimensi), `/src/styles/signal-v3-jewel-identity.css` (baris 1–120), `/src/styles/signal-v5-tokens.css` (baris 1–120)
- **Direktori Tes**: `/tests/` (9 file: `attendance_recap.test.ts`, `generator.test.ts`, `holidays_calendar.test.ts`, `kbm_slot_adherence.test.ts`, `matrixGrouping.test.ts`, `schedule_safety.test.ts`, `time.test.ts`, `validator.test.ts`, `workload_and_pdf.test.ts`)

---

### 20. Daftar Command yang Benar-Benar Dijalankan Beserta Hasilnya

| Command | Hasil / Exit Code | Ringkasan Output |
|---|---|---|
| `TZ=Asia/Jakarta date '+%A, %d %B %Y pukul %H:%M:%S WIB (%Y-%m-%dT%H:%M:%S%:z)'` (awal) | Exit `0` | `Sunday, 15 November 2026 pukul 21:51:28 WIB (2026-11-15T21:51:28+07:00)` |
| `git status -sb 2>&1 \|\| true && ls -la .git 2>&1 \|\| true` | Exit `128` (`git`) / `2` (`ls`) | `fatal: not a git repository (or any of the parent directories): .git` |
| `grep -nE "type Screen\|activeScreen\|..." src/App.tsx` | Exit `0` | Terverifikasi 11 `ScreenId`, `navGroups`, dua listener `Ctrl+K` (baris 244 & 3977), `publishDraft` (baris 613) |
| `grep -rnE "persuratan\|SuratMasuk\|..." src/` | Exit `0` | Hanya kecocokan kata `"arsip"`/`"arsip"` pada `TimeMachineDrawer.tsx:120` dan `snapshotEngine.ts:238`; nol fitur persuratan |
| `grep -nE "1024px\|56px\|24px\|76px\|252px" src/styles/signal-v3-atelier.css` | Exit `0` | Terverifikasi sidebar `252px`/`76px`, topbar `56px`, padding `24px`, breakpoint `1024px` |
| `npm run lint && npm test` | Exit `0` | `tsc -b` lulus tanpa error; `vitest run`: **9 test files passed, 37/37 tests passed** (3.95s) |
| `npm run build` | Exit `0` | `tsc -b && vite build` lulus dalam 6.61s (`dist/` terbangun normal) |
| `ls -la HASIL_AUDIT_PERSURATAN.md 2>&1 \|\| true` | Exit `2` (`No such file`) | Memastikan tidak ada riwayat audit terdahulu sebelum penulisan file |
| `TZ=Asia/Jakarta date '+%A, %d %B %Y pukul %H:%M:%S WIB (%Y-%m-%dT%H:%M:%S%:z)'` (selesai) | Exit `0` | `Sunday, 15 November 2026 pukul 21:52:56 WIB (2026-11-15T21:52:56+07:00)` |

---

### 21. Referensi Eksternal yang Digunakan

**Tidak ada.** Seluruh verifikasi teknis berasal langsung dari source code workspace `/app/applet` dan dokumen `/BLUEPRINT_UTAMA_SIGNAL_PERSURATAN_ARSIP_DOCUMENT_STUDIO.md`. Daftar URL eksternal (repository GitHub, WCAG 2.2, Dokumentasi Tiptap, PMA 12/2026, UU 43/2009, Peraturan ANRI 6/2021) yang tercantum pada Bagian 16 Blueprint belum diakses secara eksternal pada sesi audit ini.
