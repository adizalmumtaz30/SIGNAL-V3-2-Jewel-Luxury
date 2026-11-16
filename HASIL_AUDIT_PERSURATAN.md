# HASIL AUDIT PERSURATAN & ARSIP DIGITAL — SIGNAL V3.2 JEWEL LUXURY

> Dokumen audit teknis. File ini diperbarui setiap kali audit dijalankan. Entri audit terbaru berada paling atas.

## Ringkasan Terakhir
- **Status terbaru:** **PHASE-5 Selesai (S04 Document Studio / Editor Dokumen Bergaya Word)** — Layar **S04 Document Studio** terintegrasi utuh di dalam menu tunggal **Persuratan & Arsip** (`S01 <-> S02 <-> S03 <-> S04`), menggunakan editor rich-text WYSIWYG **TipTap v3** (`StarterKit` termasuk `Underline`, `TextAlign`, `Table`/`TableRow`/`TableHeader`/`TableCell`) di atas kanvas kertas A4/F4 berbatas margin `mm` (`Portrait` / `Landscape`) beserta indikator estimasi garis lipat halaman, konversi deterministik 30 template `SYSTEM` + kloning `MADRASAH` murni dari snapshot S03 beku (tanpa *live binding* dan tanpa kebocoran NIP), penanganan aman draft S03 pra-Tahap 5 tanpa `previewBlocks`, pelacakan konflik non-destruktif (`s03EditedAfterStudioAt`), sanitasi paste berbasis **DOMPurify + allowlist ketat**, validasi struktural JSON & margin/kertas, serta persistensi `DocumentIntakeDraft.studio` langsung ke IndexedDB dengan *dirty guard* penuh hingga ke menu sidebar `App.tsx` (termasuk pengecualian shortcut global `Ctrl+K` saat fokus di editor).
- **Tanggal dan jam selesai Tahap 5:** Senin, 16 November 2026, pukul 18:19:05 WIB (`2026-11-16T18:19:05+07:00`)
- **Baseline GitHub `main` yang terverifikasi sebelum Tahap 5:** [`a5e4dac1b420138bf9ad81e250fcbc535e5849f5`](https://github.com/adizalmumtaz30/SIGNAL-V3-2-Jewel-Luxury/commit/a5e4dac1b420138bf9ad81e250fcbc535e5849f5) (`feat(persuratan): implement intake drafts for S03`, `2026-11-16T10:24:55Z` / Senin, 16 November 2026 pukul 17:24:55 WIB — sekaligus menutup status commit untuk `PHASE-4`).
- **Hasil verifikasi akhir Tahap 5:** `npm run lint` (`tsc -b`) Exit `0` · `npm test` **16/16 file, 106/106 tests lulus** (`12.46s`) · `npm run build` Exit `0` (`1946` modul, `8.38s`) · `diff` SHA-256 14/14 PDF root sebelum vs sesudah tes **0 perbedaan**
- **Status verifikasi & sinkronisasi Git:** Perubahan `PHASE-4` telah terverifikasi berada di GitHub `main` (`a5e4dac...`). Perubahan **Tahap 5 (S04)** saat ini berada di workspace AI Studio (`/app/applet`) dan **belum di-commit / di-push ke GitHub** (direktori `.git` tidak tersedia di container sandbox).

## Daftar Riwayat Audit

| ID Audit | Mulai (WIB) | Selesai (WIB) | Status | Temuan Kritis | Tinggi | Sedang | Rendah | Info | Commit/Revision |
|---|---|---|---|---:|---:|---:|---:|---:|---|
| PHASE-5 | 2026-11-16 18:10:07 WIB | 2026-11-16 18:19:05 WIB | Selesai (Tahap 5 — S04) | 0 baru (`BP-010` S04 selesai) | `BP-017`/`PERS-005`, `BP-026`/`PERS-007` terjaga di S04 | `BP-018` (`DocumentStudioState`), `PERS-001` S01–S04 | — | — | Workspace lokal (basis GitHub `a5e4dac...`) |
| PHASE-4 | 2026-11-16 14:40:00 WIB | 2026-11-16 17:18:00 WIB | Selesai (Tahap 4 — S03, Ter-push) | 0 baru (`BP-009` S03 selesai) | `BP-026`, `PERS-007` terkendali di S03 | `BP-018` ditambah, `PERS-001` S01–S03 | — | — | GitHub `a5e4dac1b420138bf9ad81e250fcbc535e5849f5` |
| PHASE-3-REMEDIATION | 2026-11-16 04:36:33 WIB | 2026-11-16 04:39:45 WIB | Selesai (Lulus Gate & Ter-push) | 0 baru | 2 ditutup (PDF guard + 9 PDF pulih) | — | — | 1 koreksi lap. Git | GitHub `ab3926d73ad034bc037edcdc244cd72ed67493b7` |
| PHASE-3 | 2026-11-16 02:56:58 WIB | 2026-11-16 03:10:05 WIB | Selesai (Tahap 3) | 0 baru (`BP-008` S02 selesai) | `PERS-005`, `BP-017` sumber terpisah | `BP-018` sebagian, `PERS-001` S01+S02 | — | — | GitHub `f9dd49916ba9027b0524e6ba168344569baf45f8` |
| PHASE-2 | 2026-11-15 22:47:29 WIB | 2026-11-15 22:56:27 WIB | Selesai (Tahap 2) | 0 baru (`PERS-001` Tahap 2 S01 selesai) | `BP-005`, `BP-007` selesai | `BP-015`, `BP-018` sebagian | — | — | `9afa5fe429f1d573be9919e8b49d2455ba0209fd` |
| PHASE-1 | 2026-11-15 22:11:18 WIB | 2026-11-15 22:17:50 WIB | Selesai (Tahap 1) | 0 baru (`PERS-003` selesai) | `PERS-006` fondasi selesai | — | — | — | Tidak tersedia (tanpa `.git`) |
| AUDIT #01 | 2026-11-15 21:51:28 WIB | 2026-11-15 21:52:56 WIB | Selesai | 2 | 5 | 3 | 1 | 1 | Tidak tersedia (tanpa `.git`) |

---

## IMPLEMENTASI TAHAP 5 — DOCUMENT STUDIO / EDITOR DOKUMEN BERGAYA WORD (S04)

- **ID Entri:** `PHASE-5`
- **Status Pelaksanaan:** **SELESAI** (Layar **S04 Document Studio / Editor Dokumen Bergaya Word** terintegrasi penuh di dalam menu tunggal `Persuratan & Arsip`; finalisasi, penomoran surat otomatis, status terbit/arsip, pratinjau cetak/PDF/DOCX final S05, arsip penuh S06, pengelola template S07, dan attachment Blob biner tetap ditunda sesuai batas tahap ke Tahap 6–10)
- **Waktu mulai terverifikasi:** Senin, 16 November 2026, pukul 18:10:07 WIB (`2026-11-16T18:10:07+07:00`)
- **Waktu selesai terverifikasi:** Senin, 16 November 2026, pukul 18:19:05 WIB (`2026-11-16T18:19:05+07:00`)
- **Zona waktu:** Asia/Jakarta (WIB, UTC+07:00)
- **Identitas Proyek & Sinkronisasi Git:**
  - **Repository sasaran:** `adizalmumtaz30/SIGNAL-V3-2-Jewel-Luxury` (`main`)
  - **Baseline GitHub `main` yang diverifikasi sebelum Tahap 5:** [`a5e4dac1b420138bf9ad81e250fcbc535e5849f5`](https://github.com/adizalmumtaz30/SIGNAL-V3-2-Jewel-Luxury/commit/a5e4dac1b420138bf9ad81e250fcbc535e5849f5) (`2026-11-16T10:24:55Z` / Senin, 16 November 2026, 17:24:55 WIB)
  - **Status workspace:** Perubahan Tahap 5 berada di workspace AI Studio (`/app/applet`) dan belum di-commit/di-push karena direktori `.git` tidak tersedia di container sandbox.

### 5.1 Ringkasan Perubahan Teknis (S04 Document Studio)

1. **Model Domain & Snapshot Naskah Terstruktur (`src/domain/persuratan/studio/types.ts`, `src/domain/persuratan/types.ts`, `src/domain/persuratan/intake/draftEngine.ts`)**:
   - Memperluas `TemplateSnapshot` secara kompatibel dengan properti opsional `previewBlocks?: TemplatePreviewBlock[]` melalui `buildTemplateSnapshot()`, sehingga draft S03 baru selalu membawa blok pratinjau template beku.
   - Menambahkan `DocumentStudioState` (`schemaVersion: 1`, `editorStatus: 'NOT_STARTED' | 'IN_PROGRESS'`, `content: TipTapJSONContent`, `pageSettings: DocumentStudioPageSettings`, `updatedAt`) secara opsional di `DocumentIntakeDraft.studio`, serta `s03EditedAfterStudioAt?: string | null` untuk mendeteksi pengeditan ulang S03 sesudah S04 dikerjakan tanpa menimpa naskah editor.
   - Mendukung ukuran kertas `A4` (`210×297 mm`) dan `F4` (`215×330 mm`), orientasi `portrait` / `landscape`, dan rentang margin aman `5–50 mm`.

2. **Generator Konten Awal Deterministik Anti-Live-Binding & Penanganan Draft Legacy (`src/domain/persuratan/studio/contentGenerator.ts`)**:
   - Mengonversi seluruh **30 template bawaan (`SYS-TPL-01`–`30`)** dan template salinan `MADRASAH` menjadi dokumen JSON TipTap S04 yang valid murni dari snapshot S03 (`templateSnapshot` + `sourceSnapshots` + `values` + `autoData`), **tanpa menyentuh data Master/Settings/History live**.
   - Menggunakan peta alias token eksplisit untuk seluruh **180 token unik** pada 30 template, melindungi privasi NIP (tidak pernah menyuntikkan NIP bila tidak berada di snapshot), memisahkan `SYS-TPL-30` toggle Kop (`Ya`/`Tidak`), memperluas tabel beban JP terverifikasi pada `SYS-TPL-03` langsung dari snapshot `ScheduleVersion`, dan menandai placeholder yang belum tersedia sebagai `{{TOKEN}} [Belum diisi]` beserta daftar & hitungannya.
   - Penanganan draft S03 pra-Tahap 5 (yang belum memiliki `templateSnapshot.previewBlocks`): `resolveTemplateBlocksForDraft()` mencocokkan versi terhadap template aktif (`ACTIVE_MATCH`), mendeteksi ketidaksamaan versi (`VERSION_MISMATCH`) dengan dialog konfirmasi eksplisit di UI sebelum konversi ulang, atau memberi fallback jujur bila template sudah tidak ditemukan (`NOT_FOUND`).

3. **Validasi Struktural, Keamanan Paste, & Integritas Backup/Restore (`src/domain/persuratan/studio/contentValidation.ts`, `src/storage/db.ts`)**:
   - Menambahkan validator ketat pohon JSON TipTap (`validateTipTapContent`: daftar putih tipe node `doc`, `paragraph`, `heading`, `bulletList`, `orderedList`, `listItem`, `table*`, `text`, `hardBreak`, `horizontalRule`; daftar putih mark `bold`, `italic`, `underline`; blokir atribut berbahaya seperti `style`, `class`, `href`, `src`, `on*`, `__proto__`; batas kedalaman `24`, `4000` node, `250.000` karakter) serta validator margin & dimensi kertas (`validateStudioPageSettings`, `validateStudioState`).
   - `sanitizePastedHtml()` membersihkan tempelan HTML dari Word/Google Docs/web memakai `DOMPurify.sanitize` (di browser) dan filter allowlist deterministik lintas runtime (mengupas `<script>`, `<iframe>`, `<style>`, handler `on*`, URL `javascript:`, dan style inline Word).
   - `validateAppStateStructure()` memvalidasi `item.studio` dan `item.s03EditedAfterStudioAt` tanpa menaikkan `DB_VERSION = 3` maupun `CURRENT_APP_SCHEMA_VERSION = 2`; round-trip ekspor/impor `.json` (`SIGNAL-LOCAL-BACKUP`) & `.signal` tetap terverifikasi SHA-256 dan menolak manipulasi payload.

4. **Antarmuka Document Studio S04 & Orkestrasi Alur `S01 <-> S02 <-> S03 <-> S04` (`DocumentStudio.tsx`, `DocumentStudio.css`, `DocumentIntakeForm.tsx`, `CorrespondenceCenter.tsx`, `PersuratanWorkspace.tsx`, `App.tsx`)**:
   - Membangun editor WYSIWYG nyata berbasis **TipTap v3** (`immediatelyRender: false` agar aman untuk SSR Node) lengkap dengan toolbar fungsional (`Undo`/`Redo`, `Paragraf`/`H1`/`H2`, `Bold`/`Italic`/`Underline`, perataan teks Kiri/Tengah/Kanan/Rata, `Bullet List`/`Ordered List`, `Sisipkan Tabel 3×3` + aksi tambah/hapus baris & kolom serta hapus tabel, `Hapus Format`, dan toggle panel inspektor), kanvas kertas putih `mm` terskala responsif di atas meja kerja gelap mewah Jewel Luxury, serta indikator lipatan batas halaman berbasis `ResizeObserver`.
   - Panel kanan 4 tab terstruktur & dapat dilipat (`Detail Dokumen`, `Sumber Snapshot`, `Placeholder`, `Pengaturan Halaman` kertas/orientasi/margin/reset dari snapshot dengan konfirmasi).
   - **Batas Jujur Tahap 5**: tidak ada penerbitan nomor surat (`documentNumber: null`), status tetap `'DRAFT'` (`archivedAt: null`), tidak ada tombol finalisasi/penandatanganan/ekspor PDF/DOCX final S05, dan label sidebar tetap tunggal `"Persuratan & Arsip"`.
   - **Persistensi & Perlindungan Kerja**: `Simpan Draft` menunggu `await onPersistState(nextState)` ke IndexedDB sebelum menghapus status `dirty`; berpindah sub-view di `PersuratanWorkspace` maupun berpindah menu sidebar di `App.tsx` dilindungi dialog konfirmasi perubahan belum disimpan; shortcut global `Ctrl+K` di `App.tsx` otomatis dilewati saat fokus kursor berada di dalam `[data-doc-editor="true"]` atau elemen `contenteditable`.

### 5.2 Pembaruan Status Temuan (`PERS-*`) dan Butir Blueprint (`BP-*`)

| ID | Status Sebelum | Status Setelah Tahap 5 | Keterangan Aktual |
|---|---|---|---|
| `BP-010` | Belum Diimplementasikan | **SESUAI BLUEPRINT (S04 selesai)** | Editor WYSIWYG bergaya Word (TipTap v3) di kanvas A4/F4 `mm`, toolbar format & tabel, generator 30 template + kloning non-live-binding, sanitasi paste, & persistensi IndexedDB selesai. |
| `BP-018` | Sebagian (Tahap 4) | **SEBAGIAN (Tahap 5 Ditambah)** | Menambahkan `DocumentStudioState` (`content`, `pageSettings`, `editorStatus`, `updatedAt`), `TemplateSnapshot.previewBlocks`, & `s03EditedAfterStudioAt`; `DocumentVersion` & `DocumentAttachment` menyusul Tahap 6/10. |
| `BP-017` / `PERS-005` | Terikat di S03 | **TERJAGA HINGGA S04** | `SYS-TPL-03` di S04 membangun tabel beban JP hanya dari snapshot `ScheduleVersion` resmi yang dibekukan di S03; penguncian finalisasi SK tetap dijadwalkan di S05. |
| `BP-026` / `PERS-007` | Terkendali di S03 | **TERJAGA HINGGA S04** | S04 memaparkan Kop & penandatangan murni dari snapshot S03 beserta status kelengkapan identitas & badge `Dataset Demo Aktif` tanpa fabrikasi nilai. |
| `PERS-001` | Sebagian (Tahap 4: S01–S03) | **SEBAGIAN (Tahap 5 Selesai: S01 + S02 + S03 + S04)** | Alur `S01 <-> S02 <-> S03 <-> S04` terpadu dalam 1 menu `Persuratan & Arsip`; S05–S07 dijadwalkan pada tahap berikutnya. |

### 5.3 Daftar File yang Diubah / Ditambahkan pada Tahap 5

| File | Jenis Perubahan | Ringkasan Peran |
|---|---|---|
| `package.json` & `package-lock.json` | Diubah | Tambah `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-text-align`, `@tiptap/extension-table`, `dompurify`, `@types/dompurify` |
| `src/domain/persuratan/studio/types.ts` | Baru | Kontrak tipe `DocumentStudioState`, `DocumentStudioPageSettings`, dimensi A4/F4, placeholder, & resolusi draft legacy |
| `src/domain/persuratan/studio/contentValidation.ts` | Baru | Validator whitelist JSON TipTap & margin/kertas, sanitasi paste HTML (DOMPurify + allowlist), & ekstraktor placeholder |
| `src/domain/persuratan/studio/contentGenerator.ts` | Baru | Generator konten awal deterministik 30 template + kloning dari snapshot S03, alias 180 token, & resolusi blok legacy |
| `src/domain/persuratan/types.ts` | Diubah | Tambah `previewBlocks` di `TemplateSnapshot`, `studio` & `s03EditedAfterStudioAt` di `DocumentIntakeDraft`, serta re-ekspor tipe Studio |
| `src/domain/persuratan/intake/draftEngine.ts` | Diubah | Bekukan `previewBlocks` saat simpan S03, pertahankan naskah S04 saat S03 diedit ulang (tandai `s03EditedAfterStudioAt`), & tambah `saveStudioDraftToState()` |
| `src/storage/db.ts` | Diubah | Validasi opsional `item.studio` via `validateStudioState()` dengan tetap menjaga `DB_VERSION = 3` dan `CURRENT_APP_SCHEMA_VERSION = 2` |
| `src/components/persuratan/DocumentStudio.tsx` | Baru | Editor WYSIWYG TipTap v3 S04, toolbar, kanvas `mm` A4/F4 + `ResizeObserver`, banner konflik S03 / legacy mismatch, & drawer inspektor 4 tab |
| `src/components/persuratan/DocumentStudio.css` | Baru | Tata letak meja kerja gelap `.s04-*`, kanvas kertas putih `mm`, tabel TipTap, & responsivitas toolbar/drawer |
| `src/components/persuratan/DocumentIntakeForm.tsx` | Diubah | Tambah aksi `"Buka Document Studio (S04)"` pada banner pasca-simpan & sticky bar |
| `src/components/persuratan/CorrespondenceCenter.tsx` | Diubah | Tambah tombol `"Lanjutkan S04"` / `"Buka S04"` pada daftar & modal detail sambil mempertahankan status jujur S03 |
| `src/components/persuratan/PersuratanWorkspace.tsx` | Diubah | Tambah subview `'studio'`, guard dirty terpadu `intake | studio`, konfirmasi konflik edit S03 bila naskah S04 sudah ada, & propagasi persistensi |
| `src/App.tsx` | Diubah | Pengecualian shortcut `Ctrl+K` di dalam `[data-doc-editor="true"]`, `persistWorkspaceNow` ber-`await` ke IndexedDB, & guard navigasi sidebar S04 |
| `tests/phase5_document_studio.test.ts` | Baru | 9 skenario uji penerimaan Tahap 5 (30 template + klon, `SYS-TPL-01` anti-NIP, `SYS-TPL-03` `ScheduleVersion`, `SYS-TPL-30` Kop, draft legacy, idempotensi + konflik S03, validasi/sanitasi XSS & Word, SHA-256 round-trip + anti-tamper, & SSR S04/S01/S03/`App`) |
| `HASIL_AUDIT_PERSURATAN.md` | Diubah (Prepend + Koreksi) | Tambah laporan `PHASE-5` & perbarui status commit `a5e4dac...` untuk `PHASE-4` |

### 5.4 Verifikasi Akhir, Checksum 14 PDF Root, & Batasan Pengujian Tahap 5

| Pemeriksaan | Hasil | Detail Aktual |
|---|---|---|
| `npm run lint` (`tsc -b`) | **Exit `0`** | Lulus penuh tanpa error TypeScript (`tsconfig.app.json` & `tsconfig.node.json`) |
| `npm test` (`vitest run`) | **Exit `0`** | **16/16 file test lulus, 106/106 tests lulus** (`12.46s`; mencakup 9 kasus baru di `tests/phase5_document_studio.test.ts`) |
| `npm run build` (`tsc -b && vite build`) | **Exit `0`** | **1946 modul**, selesai dalam `8.38s` menghasilkan `dist/` |
| `diff -u` SHA-256 14 PDF root sebelum vs sesudah tes | **Exit `0` (0 diff)** | Seluruh 14 berkas `SIGNAL_*.pdf` tetap 100% identik pasca `npm test` |
| Kenaikan `DB_VERSION` / `CURRENT_APP_SCHEMA_VERSION` | **Tidak Ada** | `DB_VERSION` tetap `3`, `CURRENT_APP_SCHEMA_VERSION` tetap `2` |
| Uji visual interaktif browser (`1440×900` & `1280×720`) | **Belum dijalankan** | Suite test dijalankan pada environment Node/SSR (`renderToStaticMarkup`); pengetikan interaktif TipTap, paste Word live di browser, zoom/lipat halaman `ResizeObserver`, dan navigasi klik UI tetap perlu diverifikasi di browser pada host |

---

## IMPLEMENTASI TAHAP 4 — FORM DATA AWAL / CONTEXT FORM (S03)

- **ID Entri:** `PHASE-4`
- **Status Pelaksanaan:** **SELESAI & TERVERIFIKASI TER-PUSH KE GITHUB `main`** (Layar **S03 Form Data Awal / Context Form** terintegrasi penuh di dalam menu tunggal `Persuratan & Arsip`; editor rich-text S04, finalisasi/penomoran S05, arsip S06, editor template S07, dan attachment Blob store biner tetap ditunda sesuai batas tahap ke Tahap 5–10)
- **Waktu selesai terverifikasi:** Senin, 16 November 2026, pukul 17:18:00 WIB (`2026-11-16T17:18:00+07:00`)
- **Zona waktu:** Asia/Jakarta (WIB, UTC+07:00)
- **Identitas Proyek & Sinkronisasi Git:**
  - **Repository sasaran:** `adizalmumtaz30/SIGNAL-V3-2-Jewel-Luxury` (`main`)
  - **Baseline GitHub `main` yang diverifikasi sebelum Tahap 4:** `ab3926d73ad034bc037edcdc244cd72ed67493b7` (`2026-11-15T21:49:36Z`)
  - **Commit Tahap 4 yang terverifikasi di GitHub `main`:** [`a5e4dac1b420138bf9ad81e250fcbc535e5849f5`](https://github.com/adizalmumtaz30/SIGNAL-V3-2-Jewel-Luxury/commit/a5e4dac1b420138bf9ad81e250fcbc535e5849f5) (`feat(persuratan): implement intake drafts for S03`, `2026-11-16T10:24:55Z` / Senin, 16 November 2026, 17:24:55 WIB)
  - **Status Git lokal sandbox:** Direktori `.git` tidak tersedia di container sandbox; koreksi status commit ini menutup catatan *"belum di-commit / di-push"* sebelumnya untuk `PHASE-4`.

### 4.1 Ringkasan Perubahan Teknis (S03 Form Data Awal / Context Form)

1. **Registri Skema S03 Dinamis untuk 30 Template & Klon Madrasah (`src/domain/persuratan/intake/types.ts`, `schemaRegistry.ts`)**:
   - Memetakan seluruh **30 template bawaan (`SYS-TPL-01` s.d. `SYS-TPL-30`)** plus dukungan otomatis template hasil kloning `MADRASAH` (via `sourceTemplateId`) serta fallback aman bila ditemukan template custom tanpa induk sistem.
   - Membedakan sumber isian setiap kontrol via `FieldProvenance`: `AUTO_SYSTEM`, `MASTER_REFERENCE`, dan `OPERATOR_INPUT`.
   - **Surat Tugas Pelatihan (`SYS-TPL-01`)**: `peserta` (`teacher_multi_select` wajib ≥ 1 guru aktif), `nama_kegiatan`, `penyelenggara`, `tanggal_pelaksanaan` (`date_range`, validasi kalender riil & `tanggal_selesai >= tanggal_mulai`), `lokasi`, `dasar_surat` (opsional), penandatangan (`AUTO_SYSTEM`), `catatan_khusus` (opsional), plus banner informasi jujur batas lampiran (penyimpanan biner Blob akan hadir di store terpisah Tahap 10; tanpa menyimpan base64 di `AppState`).
   - **Korespondensi Eksternal (`SYS-TPL-08`, `SYS-TPL-23`, `SYS-TPL-28`)**: Memakai input pihak tujuan/instansi teks bebas tanpa memaksa multi-select guru.
   - **SK Pembagian Tugas Mengajar (`SYS-TPL-03`)**: Terikat ketat pada `ScheduleVersion` resmi terverifikasi dari `scheduleSources.ts` (`verifyScheduleVersion()`), menolak `draft`, `activeSchedule` polos tanpa versi, maupun versi dengan fingerprint/entri rusak.
   - **Perlindungan Privasi NIP & Guru Nonaktif**: Picker guru (`teacher_multi_select` & `teacher_single_select`) hanya menampilkan guru berstatus `isActive: true`, menolak ID guru nonaktif pada validasi, dan **tidak pernah mengekspos NIP** pada chip peserta maupun daftar picker umum.
   - **Anti-Fabrikasi Data Sistem**: `resolveSystemAutoData()` membaca `state.settings` apa adanya. Jika `schoolName` atau `headmasterName` kosong, UI menampilkan status belum lengkap dan menolak penyimpanan (kecuali `SYS-TPL-30` saat operator memilih `tampilkan_kop: 'Tidak'`). Jika `state.dataMode === 'demo'`, badge peringatan eksplisit **"Dataset Demo Aktif"** ditampilkan secara jujur.

2. **Mesin Draft & Snapshot Immutable Non-Live-Binding (`src/domain/persuratan/intake/draftEngine.ts`)**:
   - Menyimpan `DocumentIntakeDraft` ke `AppState.intakeDrafts` dan melakukan upsert idempoten `DocumentRecord` ke `AppState.documents` dengan `status: 'DRAFT'`, `documentNumber: null`, dan `intakeDraftId` tertaut.
   - Membekukan salinan mendalam (`deepCloneValue`) atas `TemplateSnapshot` (`templateSnapshot`) dan `SourceSnapshotEntry[]` (`sourceSnapshots`: Kop/Penandatangan, daftar peserta guru terpilih, serta snapshot `ScheduleVersion` dan beban JP untuk `SYS-TPL-03`), sehingga mutasi berikutnya pada Data Master/Pengaturan tidak mengubah snapshot yang sudah tersimpan.
   - Edit ulang draft (`existingDraftId` / `existingDocumentId`) memperbarui pasangan `DocumentIntakeDraft` & `DocumentRecord` yang sama tanpa menciptakan duplikat.

3. **Antarmuka S03, Aksesibilitas & Guard Perubahan (`DocumentIntakeForm.tsx`, `DocumentIntakeForm.css`, `PersuratanWorkspace.tsx`, `TemplateGallery.tsx`, `CorrespondenceCenter.tsx`, `App.tsx`)**:
   - Layout desktop proporsional (`max-width: 1140px`: form utama `792px` + gap `24px` + panel kanan sumber data & ringkasan `324px`, header + stepper, dan sticky footer `64px`; responsif aman di `1280×720` dan layar sempit tanpa horizontal overflow).
   - Validasi aksesibel dengan **Error Summary** ber-fokus di atas form plus pesan error inline (`aria-invalid`, `aria-describedby`, `role="alert"`).
   - Batas jujur Tahap 4: tidak ada editor palsu S04, tidak ada tombol `"Terbitkan Nomor"` / `"Finalisasi Dokumen"` / cetak PDF final; konfirmasi pasca-simpan menampilkan identitas draft & rujukan kesiapan menuju Document Studio (S04).
   - Guard perubahan belum tersimpan (`dirty state`): dialog konfirmasi aksesibel (`role="dialog"`, `aria-modal="true"`, Escape & focus management) baik saat berpindah sub-tab internal `S03 -> S01/S02` di `PersuratanWorkspace.tsx` maupun saat mengklik menu sidebar lain di `App.tsx`.
   - `TemplateGallery.tsx` mengarahkan `"Gunakan Template"` ke S03 (dengan tetap menjaga fallback kompatibilitas mandiri), dan `CorrespondenceCenter.tsx` (S01) menampilkan label `"Data awal S03 tersimpan · Menunggu Document Studio (S04)"` beserta aksi `"Edit S03"` pada baris & modal detail dokumen.

4. **Skema `AppState` & Integritas Storage (`src/domain/persuratan/types.ts`, `src/domain/types.ts`, `src/domain/seed.ts`, `src/storage/db.ts`, `tests/phase1_integrity_and_assignments.test.ts`)**:
   - Menambahkan field opsional `intakeDrafts?: DocumentIntakeDraft[]` di `AppState` dan metadata opsional (`intakeDraftId`, `templateId`, `templateVersion`, `scheduleVersionId`) di `DocumentRecord`.
   - **Tidak menaikkan `DB_VERSION = 3`** dan tidak menambah dependensi baru di `package.json`.
   - `validateAppStateStructure()` dan `migrateAppStateSchema()` memvalidasi serta menormalkan `intakeDrafts` secara idempoten setelah verifikasi checksum SHA-256 (backup lama tanpa `intakeDrafts` tetap lolos verifikasi).

### 4.2 Pembaruan Status Temuan (`PERS-*`) dan Butir Blueprint (`BP-*`)

| ID | Status Sebelum | Status Setelah Tahap 4 | Keterangan Aktual |
|---|---|---|---|
| `BP-009` | Belum Diimplementasikan | **SESUAI BLUEPRINT (S03 selesai)** | Form Data Awal S03 dinamis untuk 30 template + klon Madrasah, validasi ketat, multi-select guru aktif, snapshot immutable non-live-binding, & guard unsaved changes selesai. |
| `BP-018` | Sebagian (Tahap 3) | **SEBAGIAN (Tahap 4 Ditambah)** | Menambahkan tipe `DocumentIntakeDraft`, `DocumentIntakeStatus`, `FieldProvenance`, `SourceSnapshotEntry`, dan `TemplateSnapshot`; `DocumentVersion` & `DocumentAttachment` (Blob) menyusul Tahap 8/10. |
| `BP-026` / `PERS-007` | Sesuai Sebagian / Terbuka | **TERKENDALI DI S03 (Pengawalan Finalisasi Menyusul S05)** | S03 tidak pernah memfabrikasi Kop/Penandatangan kosong dan menampilkan penanda jujur `Dataset Demo Aktif`; blokir finalisasi bila identitas belum terverifikasi menyusul di S05 (Tahap 8). |
| `BP-017` / `PERS-005` | Sesuai Sebagian / Terkendali | **TERIKAT DI S03 UNTUK `SYS-TPL-03`** | SK Pembagian Tugas Mengajar di S03 wajib mengikat `ScheduleVersion` resmi terverifikasi dan menolak draft/`activeSchedule` polos; penguncian finalisasi & CTA Beban Guru menyusul di Tahap 8–9. |
| `PERS-001` | Sebagian (Tahap 3: S01 + S02) | **SEBAGIAN (Tahap 4 Selesai: S01 + S02 + S03)** | Alur `S01 <-> S02 <-> S03` terpadu dalam 1 menu `Persuratan & Arsip`; S04–S07 dijadwalkan pada Tahap 5–10. |

### 4.3 Daftar File yang Diubah / Ditambahkan pada Tahap 4

| File | Jenis Perubahan | Ringkasan Peran |
|---|---|---|
| `src/domain/persuratan/types.ts` | Diubah | Tambah `DocumentIntakeDraft`, `SourceSnapshotEntry`, `TemplateSnapshot`, & tautan `intakeDraftId` pada `DocumentRecord` |
| `src/domain/persuratan/intake/types.ts` | Baru | Kontrak skema S03, validasi, & hasil penyimpanan draft |
| `src/domain/persuratan/intake/schemaRegistry.ts` | Baru | Skema dinamis seluruh 30 template (`SYS-TPL-01`–`30`), fallback, resolusi `AUTO_SYSTEM`, & validator |
| `src/domain/persuratan/intake/draftEngine.ts` | Baru | Inisialisasi nilai awal, derivasi metadata, snapshot immutable, & upsert idempoten `intakeDrafts` + `documents` |
| `src/domain/types.ts` | Diubah | Tambah `intakeDrafts?: DocumentIntakeDraft[]` di `AppState` |
| `src/domain/seed.ts` | Diubah | Inisialisasi `intakeDrafts: []` pada `createDemoState()` dan `createEmptyState()` |
| `src/storage/db.ts` | Diubah | Validasi opsional struktur `intakeDrafts` & normalisasi idempoten pasca-SHA-256 |
| `src/components/persuratan/DocumentIntakeForm.tsx` | Baru | Antarmuka Form Data Awal S03 (2 kolom, panel sumber data, picker guru aktif tanpa NIP, validasi, & banner batas jujur) |
| `src/components/persuratan/DocumentIntakeForm.css` | Baru | Tata letak `.s03-*` Jewel Luxury responsif & sticky action bar `64px` |
| `src/components/persuratan/TemplateGallery.tsx` | Diubah | Hubungkan tombol `"Gunakan Template"` ke callback `onUseTemplate` untuk membuka S03 |
| `src/components/persuratan/CorrespondenceCenter.tsx` | Diubah | Tampilkan status jujur draft S03 dan tombol `"Edit S03"` pada daftar & detail modal |
| `src/components/persuratan/PersuratanWorkspace.tsx` | Diubah | Orkestrasi sub-layar `center | templates | intake`, preservasi state S01, & modal guard unsaved changes |
| `src/App.tsx` | Diubah | Guard `persuratanDirty` saat berpindah ke menu sidebar lain dari S03 |
| `tests/phase1_integrity_and_assignments.test.ts` | Diubah (1 baris) | Sertakan `intakeDrafts` dalam uji pengurutan kunci kanonik payload backup |
| `tests/phase4_template_intake.test.ts` | Baru | 10 skenario uji penerimaan Tahap 4 (30 template, validasi `SYS-TPL-01`, anti-NIP, `SYS-TPL-08`, anti-fabrikasi/`SYS-TPL-30`, `SYS-TPL-03` `ScheduleVersion`, snapshot immutable, upsert idempoten, SHA-256 `.json`/`.signal`, SSR shell) |
| `HASIL_AUDIT_PERSURATAN.md` | Diubah (Prepend + Koreksi) | Tambah laporan `PHASE-4` & perbarui status commit `ab3926d...` untuk `PHASE-3-REMEDIATION` |

### 4.4 Verifikasi Akhir, Checksum 14 PDF Root, & Batasan Pengujian Tahap 4

| Pemeriksaan | Hasil | Detail Aktual |
|---|---|---|
| `npm run lint` (`tsc -b`) | **Exit `0`** | Lulus penuh tanpa error TypeScript (`tsconfig.app.json` & `tsconfig.node.json`) |
| `npm test` (`vitest run`) | **Exit `0`** | **15/15 file test lulus, 97/97 tests lulus** (`11.37s`; mencakup 10 kasus baru di `tests/phase4_template_intake.test.ts`) |
| `npm run build` (`tsc -b && vite build`) | **Exit `0`** | **1873 modul**, selesai dalam `7.40s` menghasilkan `dist/` |
| `diff -u` SHA-256 14 PDF root sebelum vs sesudah tes | **Exit `0` (0 diff)** | Seluruh 14 berkas `SIGNAL_*.pdf` tetap 100% identik pasca `npm test` |
| Penambahan dependency / kenaikan `DB_VERSION` | **Tidak Ada (`0`)** | `package.json` tidak berubah; `DB_VERSION` tetap `3` |
| Uji visual interaktif browser (`1440×900` & `1280×720`) | **Belum dijalankan** | Suite test dijalankan pada environment Node/SSR (`renderToStaticMarkup`); interaksi DOM klik, navigasi fokus keyboard, dan inspeksi layout live tetap perlu diverifikasi di browser pada host |

---

## PERBAIKAN PRA-TAHAP 4 — PENGAMAN EKSPOR PDF VITEST & PEMULIHAN PDF BASELINE TAHAP 2

- **ID Entri:** `PHASE-3-REMEDIATION`
- **Status Pelaksanaan:** **SELESAI (LULUS ACCEPTANCE GATE & TERVERIFIKASI TER-PUSH KE GITHUB `main`)**
- **Waktu mulai:** Senin, 16 November 2026, pukul 04:36:33 WIB (`2026-11-16T04:36:33+07:00`)
- **Waktu selesai:** Senin, 16 November 2026, pukul 04:39:45 WIB (`2026-11-16T04:39:45+07:00`)
- **Commit remediasi yang terverifikasi di GitHub `main`:** [`ab3926d73ad034bc037edcdc244cd72ed67493b7`](https://github.com/adizalmumtaz30/SIGNAL-V3-2-Jewel-Luxury/commit/ab3926d73ad034bc037edcdc244cd72ed67493b7) (`test: add jsPDF save mocking in test setup`, `2026-11-15T21:49:36Z` / Senin, 16 November 2026 pukul 04:49:36 WIB)
- **Zona waktu:** Asia/Jakarta (WIB, UTC+07:00)
- **Identitas Repository & Commit yang Diverifikasi via GitHub API:**
  - **Repository:** `adizalmumtaz30/SIGNAL-V3-2-Jewel-Luxury` (`main`)
  - **Commit Baseline Tahap 2:** `9afa5fe429f1d573be9919e8b49d2455ba0209fd`
  - **Commit Awal Tahap 3 yang Diperbaiki:** [`f9dd49916ba9027b0524e6ba168344569baf45f8`](https://github.com/adizalmumtaz30/SIGNAL-V3-2-Jewel-Luxury/commit/f9dd49916ba9027b0524e6ba168344569baf45f8) · Pesan: `refactor: update correspondence workspace and labels` · Waktu GitHub: `2026-11-15T20:55:41Z` (Senin, 16 November 2026, pukul 03:55:41 WIB)
  - **Commit Remediasi di GitHub:** [`ab3926d73ad034bc037edcdc244cd72ed67493b7`](https://github.com/adizalmumtaz30/SIGNAL-V3-2-Jewel-Luxury/commit/ab3926d73ad034bc037edcdc244cd72ed67493b7) (`2026-11-15T21:49:36Z`)
  - **Status Git Lokal Sandbox:** Direktori `.git` tidak tersedia pada container `/app/applet`.

### R.1 Ringkasan Temuan & Perbaikan Masalah A, B, dan C

1. **Masalah A — Kontaminasi Tes Lama (`tests/workload_and_pdf.test.ts` & `tests/attendance_recap.test.ts`) yang Menulis Ulang PDF ke Root:**
   - **Akar Masalah Terbukti:** Pada `jspdf` `^4.2.1` (`dist/jspdf.node.min.js`), `save` dipasang langsung pada instance baru di konstruktor (tidak berada pada `jsPDF.prototype`, melainkan ditimpa oleh properti `jsPDF.API` saat inisialisasi). Karena suite tes lama memanggil `exportScheduleMasterPDF`, `exportScheduleClassPDF`, `exportScheduleTeacherPDF`, `exportAllClassesSinglePageA4PDF`, dan `exportAttendanceRecapPDF` di Node tanpa mock `save`, `jsPDF` menjalankan `fs.writeFileSync` dan menimpa 9 file PDF di root workspace setiap kali `npm test` dijalankan.
   - **Perbaikan Sentral (`tests/setup.ts` + `vite.config.ts`):**
     - Membuat `tests/setup.ts` yang mencegat `jsPDF.API.save` di lingkungan Vitest (memasang `noopSave` aman di tingkat modul, memasang `vi.spyOn(api, 'save')` pada `beforeEach`, dan memasang kembali `noopSave` setelah `vi.restoreAllMocks()` pada `afterEach`).
     - Mendaftarkan `setupFiles: ['./tests/setup.ts']` di `vite.config.ts`.
     - **Tanpa mengubah perilaku produksi browser:** `src/utils/pdfExport.ts` tidak diubah dan tidak mengimpor file setup tes, sehingga unduhan PDF oleh pengguna di browser tetap berjalan normal.
   - **Verifikasi Regresi (`tests/pdf_save_guard.test.ts`):** Membuktikan dokumen tetap dirender di memori (`output('arraybuffer')` menghasilkan header `%PDF-` valid), seluruh 6 fungsi `export*PDF` memanggil `.save()` tanpa membuat/menimpa berkas PDF pada direktori kerja, dan pengaman bertahan setelah `vi.restoreAllMocks()`.
   - **Koreksi Penemuan Lama (`PHASE-2`):** Dikonfirmasi ulang bahwa sumber perubahan 9 checksum PDF pada saat pengujian sebelumnya berasal semata-mata dari tes lama Vitest di Node yang memanggil `jsPDF.save()`, bukan dari proses eksternal lain.

2. **Masalah B — Pemulihan 9 Berkas PDF Root Byte-for-Byte ke Baseline Tahap 2 (`9afa5fe429f1d573be9919e8b49d2455ba0209fd`):**
   - Karena `.git` tidak tersedia di sandbox, kesembilan berkas PDF diunduh biner langsung dari URL raw commit baseline `https://raw.githubusercontent.com/adizalmumtaz30/SIGNAL-V3-2-Jewel-Luxury/9afa5fe429f1d573be9919e8b49d2455ba0209fd/<path>`, divalidasi header `%PDF-`, serta dicocokkan Git Blob SHA-1 lokal terhadap objek tree commit `9afa5fe429f1d573be9919e8b49d2455ba0209fd` di GitHub API (**9/9 match 100%**). Lima berkas PDF root lainnya juga diverifikasi identik terhadap baseline `9afa5fe...`.

3. **Masalah C — Sinkronisasi Laporan Audit:**
   - Pada saat remediasi (`04:39:45 WIB`), status telah disinkronkan terhadap commit `f9dd499...`; **koreksi tambahan pada awal Tahap 4** juga menutup pernyataan lama *"belum di-commit / di-push"* untuk `PHASE-3-REMEDIATION` karena seluruh perubahan remediasi telah terverifikasi live di GitHub `main` pada commit [`ab3926d73ad034bc037edcdc244cd72ed67493b7`](https://github.com/adizalmumtaz30/SIGNAL-V3-2-Jewel-Luxury/commit/ab3926d73ad034bc037edcdc244cd72ed67493b7) (`2026-11-15T21:49:36Z` / `16 Nov 2026 04:49:36 WIB`).
   - Mempertahankan seluruh entri historis `PHASE-3`, `PHASE-2`, `PHASE-1`, dan `AUDIT #01` di bawah bagian ini tanpa penghapusan.

### R.2 Tabel Verifikasi Checksum SHA-256 Sembilan PDF Baseline vs Pra/Pasca Tes

| # | Nama Berkas PDF Root | Kondisi Awal (Commit `f9dd499...` / Pasca Tes Lama) | Baseline `9afa5fe...` & Setelah Pemulihan | Sebelum `npm test` Pasca-Perbaikan | Sesudah `npm test` Pasca-Perbaikan | Status Akhir |
|---|---|---|---|---|---|---|
| 1 | `SIGNAL_Jadwal_Guru_Ahmad_Fauzi__S_Pd_.pdf` | `2ef000e6d906c69fa555feddceb7e4b9517ddc5f0da41a88cdf20d1487eea869` | `b0930c54d6b3fbd48baf0e4ec1964dc10c89b1922986c8808074230cdf34a1e2` | `b0930c54d6b3fbd48baf0e4ec1964dc10c89b1922986c8808074230cdf34a1e2` | `b0930c54d6b3fbd48baf0e4ec1964dc10c89b1922986c8808074230cdf34a1e2` | **IDENTIK** (blob `dc51f209...`) |
| 2 | `SIGNAL_Jadwal_Mingguan_Kelas_VII_A_A4.pdf` | `f1d7f53bf247e0d5e4e8ffb133eea93be84c1e17197d8ee88bec4bb68ad71f75` | `0f76a594a38b0da8bea9666ec1dd14c08ecfb79fba5ee45c16de490bbcd5c213` | `0f76a594a38b0da8bea9666ec1dd14c08ecfb79fba5ee45c16de490bbcd5c213` | `0f76a594a38b0da8bea9666ec1dd14c08ecfb79fba5ee45c16de490bbcd5c213` | **IDENTIK** (blob `c0f6e772...`) |
| 3 | `SIGNAL_Jadwal_Semua_Kelas_A4_2026_2027.pdf` | `baa9581df18c2b40ff05f49934d2dfb7871c1d739bab5ccc628bc5a5713dd963` | `08cb6d64b9d3fd33ff6ebcd837bd34938ba6e965e0110e366d4587ee7c3d8862` | `08cb6d64b9d3fd33ff6ebcd837bd34938ba6e965e0110e366d4587ee7c3d8862` | `08cb6d64b9d3fd33ff6ebcd837bd34938ba6e965e0110e366d4587ee7c3d8862` | **IDENTIK** (blob `d24b7f7c...`) |
| 4 | `SIGNAL_Jadwal_Semua_Kelas_F4_2026_2027.pdf` | `9fb71cc17aed71485b9ec0b6590cbc0014380f378f7a8a796d8f0f4be50e7c65` | `d2cc5f801f8585c5a5ba71a20849c330104931143559ac15d033d69af3448386` | `d2cc5f801f8585c5a5ba71a20849c330104931143559ac15d033d69af3448386` | `d2cc5f801f8585c5a5ba71a20849c330104931143559ac15d033d69af3448386` | **IDENTIK** (blob `3d0542ff...`) |
| 5 | `SIGNAL_Rekap_Presensi_Guru_A4_Januari_2026.pdf` | `6e77c64ebdc84ffd3065c98642fd1ce33b1e7a80ba67b4ad95026dda1bfffa3b` | `d81e90e31ed7219ae549ca2d70bc7f6490ffab190c108cb6d1fd5d50b2f4bf7b` | `d81e90e31ed7219ae549ca2d70bc7f6490ffab190c108cb6d1fd5d50b2f4bf7b` | `d81e90e31ed7219ae549ca2d70bc7f6490ffab190c108cb6d1fd5d50b2f4bf7b` | **IDENTIK** (blob `5ce168fd...`) |
| 6 | `SIGNAL_Rekap_Presensi_Guru_A4_Juli_September_2026_3_Bulan.pdf` | `8f9fc717d0c47f2c8c31b037ab5736317f62da35672f9b20d7235029061ea066` | `d64286c347a33ad6a0193fc8e85439da146c2924c88052f64ba91d28392b95eb` | `d64286c347a33ad6a0193fc8e85439da146c2924c88052f64ba91d28392b95eb` | `d64286c347a33ad6a0193fc8e85439da146c2924c88052f64ba91d28392b95eb` | **IDENTIK** (blob `e1602d5d...`) |
| 7 | `SIGNAL_Rekap_Presensi_Guru_A4_Oktober_2026.pdf` | `c84076d3eb633adf1b22fb07e8aa661249263ab957ee37b9c007ea2872ebfd67` | `04e9b239cd431d7d61fe73d520979f9cb4628605c65efc61060a3a5a4f5512ea` | `04e9b239cd431d7d61fe73d520979f9cb4628605c65efc61060a3a5a4f5512ea` | `04e9b239cd431d7d61fe73d520979f9cb4628605c65efc61060a3a5a4f5512ea` | **IDENTIK** (blob `7a2d2982...`) |
| 8 | `SIGNAL_Rekap_Presensi_Guru_F4_Februari_2029.pdf` | `fff13795227389063cccd3dad0e3dd106484ae700068dfab2ca55b21a7fcb660` | `03912dbcfa5ddb509edfa253e467ba1d21a3d6b05cb137b55658a1e7c0095538` | `03912dbcfa5ddb509edfa253e467ba1d21a3d6b05cb137b55658a1e7c0095538` | `03912dbcfa5ddb509edfa253e467ba1d21a3d6b05cb137b55658a1e7c0095538` | **IDENTIK** (blob `8672bc3b...`) |
| 9 | `SIGNAL_Rekap_Presensi_Guru_F4_Juli_Desember_2026_6_Bulan.pdf` | `d285f228edbec1f2f3383fe3f842a46fea64ff37b4e986f2691c3f165ceb15eb` | `47e3cd491e624f4ce81c6aa3859459afe7bd4dfb5ba69a3dfaa2ca02f3303e17` | `47e3cd491e624f4ce81c6aa3859459afe7bd4dfb5ba69a3dfaa2ca02f3303e17` | `47e3cd491e624f4ce81c6aa3859459afe7bd4dfb5ba69a3dfaa2ca02f3303e17` | **IDENTIK** (blob `93093192...`) |

*Konfirmasi 5 PDF root lainnya (`SIGNAL_Jadwal_Kelas_VII_A.pdf`, `SIGNAL_Jadwal_Mingguan_Kelas_VII_A.pdf`, `SIGNAL_Jadwal_Sekolah_2026_2027.pdf`, `SIGNAL_Jadwal_Semua_Kelas_Satu_Halaman_2026_2027.pdf`, `SIGNAL_Rekap_Presensi_Guru_Oktober_2026.pdf`):* **Tetap 100% identik** terhadap baseline `9afa5fe...` sebelum dan sesudah `npm test`.

### R.3 Daftar File Teks yang Diubah / Ditambahkan & Hasil Verifikasi Aktual

| File | Jenis Perubahan | Ringkasan Peran |
|---|---|---|
| `tests/setup.ts` | Baru | Setup global Vitest untuk menonaktifkan penulisan file oleh `jsPDF.save()` dengan tetap merender objek PDF di memori |
| `vite.config.ts` | Diubah | Menambahkan `setupFiles: ['./tests/setup.ts']` pada blok `test` |
| `tests/pdf_save_guard.test.ts` | Baru | 3 kasus uji regresi pengaman sentral `jsPDF.save()`, validasi `%PDF-` di memori, dan ketahanan pasca `vi.restoreAllMocks()` |
| `HASIL_AUDIT_PERSURATAN.md` | Diubah (Prepend) | Menambahkan entri `PHASE-3-REMEDIATION` dan memperbarui `Ringkasan Terakhir` dengan fakta GitHub `f9dd499...` |

| Pemeriksaan | Hasil | Detail Aktual |
|---|---|---|
| `npm run lint` (`tsc -b`) | **Exit `0`** | Lulus penuh tanpa error TypeScript |
| `npm test` (`vitest run`) | **Exit `0`** | **14/14 file test lulus, 87/87 tests lulus** (durasi `9.24s`; mencakup `pdf_save_guard.test.ts`) |
| `npm run build` (`tsc -b && vite build`) | **Exit `0`** | **1869 modul**, selesai dalam `6.42s` |
| `diff -u` SHA-256 14 PDF sebelum vs sesudah tes | **Exit `0` (0 diff)** | Seluruh 14 berkas PDF root tetap byte-identical pasca `npm test` |
| Pengujian browser visual (`1440×900` / `1280×720`) | **Belum dijalankan** | Lingkungan pengujian saat ini masih Node/SSR; pengujian runtime browser langsung tetap harus dijalankan di host |

---

## IMPLEMENTASI TAHAP 3 — GALERI TEMPLATE S02 & SUMBER RESMI BEBAN GURU (SCHEDULEVERSION)

- **ID Entri:** `PHASE-3`
- **Status Pelaksanaan:** **SELESAI** (Bagian A: Galeri Template S02 dengan 30 template terstruktur di dalam menu tunggal `Persuratan & Arsip`; Bagian B: Pemisahan sumber beban mengajar guru berbasis `ScheduleVersion` resmi terverifikasi vs Pratinjau Draft vs Rencana Kebutuhan JP vs Catatan Administratif `TeacherAssignment`; S03–S07, editor DOCX/dokumen kosong, dan pembuatan SK otomatis tetap ditunda ke Tahap 4–10 sesuai batas tahap)
- **Waktu mulai:** Senin, 16 November 2026, pukul 02:56:58 WIB (`2026-11-16T02:56:58+07:00`)
- **Waktu selesai:** Senin, 16 November 2026, pukul 03:10:05 WIB (`2026-11-16T03:10:05+07:00`)
- **Zona waktu:** Asia/Jakarta (WIB, UTC+07:00)
- **Status verifikasi repository:** Tidak dapat diverifikasi dari `.git` lokal (direktori `.git` tidak ditemukan di `/app/applet`; identifikasi proyek berdasarkan file workspace `package.json`, `metadata.json`, dan `BLUEPRINT_UTAMA_SIGNAL_PERSURATAN_ARSIP_DOCUMENT_STUDIO.md`; commit dasar `9afa5fe429f1d573be9919e8b49d2455ba0209fd` tidak dapat dicek lewat `git` dalam sandbox ini).

### 3.1 Ringkasan Perubahan Teknis

#### A. Galeri Template S02 (`src/domain/persuratan/templates/`, `src/components/persuratan/`, `src/App.tsx`)
1. **Model & Registri 30 Template Bawaan SIGNAL (`types.ts` & `registry.ts`)**:
   - Mendefinisikan `DocumentTemplate`, `TemplateCategory`, `TemplateCollection`, `TemplatePreferences`, `TemplatePreviewBlock`, dan konstanta koleksi di `src/domain/persuratan/templates/types.ts`.
   - Membangun `SYSTEM_DOCUMENT_TEMPLATES` (`Object.freeze`) tepat **30 template** (`SYS-TPL-01` s.d. `SYS-TPL-30`, urutan `1..30`) sesuai Blueprint §6 pada 6 kategori (*SK & Penugasan*, *Surat Dinas Resmi*, *Kesiswaan & Wali Kelas*, *Kurikulum & Ujian*, *Kepegawaian & Internal*, *Keuangan & Sarpras*).
   - Seluruh template sistem menggunakan placeholder semantik (`{{NAMA_MADRASAH}}`, `{{NAMA_LENGKAP_PENERIMA}}`, `{{NOMOR_SURAT}}`, dll.) tanpa PII fiktif, `createdAt: null`, `updatedAt: null`, serta menyertakan catatan kewenangan/hukum kontekstual pada dokumen berisiko tinggi (seperti *Nota Dinas* `SYS-TPL-10`, *Surat Rekomendasi/Referensi* `SYS-TPL-15`, dan kelompok *SK* `SYS-TPL-03`–`05`).
2. **Selektor Murni, Preferensi & Kloning Non-Mutatif (`selectors.ts`)**:
   - Menyediakan `collectAllTemplates()`, `sanitizeTemplatePreferences()`, `toggleFavoriteTemplate()`, `recordRecentTemplateUsage()` (deduplikasi & batas **maksimal 10 ID** terakhir dipakai), `computeCategoryCounts()`, `computeCollectionCounts()`, `filterTemplates()`, dan `cloneTemplateToMadrasah()` yang **tidak pernah memutasi** template `SYSTEM` serta menyimpan salinan ke `MADRASAH` dengan `sourceTemplateId` dan `sourceTemplateVersion`.
3. **Antarmuka Layar S02 & Navigasi Internal `S01 <-> S02` (`TemplateGallery.tsx`, `TemplateGallery.css`, `PersuratanWorkspace.tsx`, `CorrespondenceCenter.tsx`, `App.tsx`)**:
   - Menjaga tepat **1 menu sidebar** (`Persuratan & Arsip`) tanpa menambah item sidebar baru. `PersuratanWorkspace` mengelola pergantian internal `S01 <-> S02` dengan mempertahankan state filter/pencarian/urutan/paginasi S01 tetap utuh saat berpindah layar.
   - Layout desktop 3 kolom proporsional (`184px + 24px + 536px + 24px + 372px = 1140px` di viewport `1440×900`, bebas horizontal overflow pada `1280×720`), bilah pencarian + badge kategori & koleksi dinamis, pratinjau kertas surat A4 autentik dengan token `{{PLACEHOLDER}}`, modal *Duplikasi ke Template Madrasah* aksesibel, tombol `"Gunakan Template"` yang menyimpan `selectedTemplateId` beserta pemberitahuan jujur batas Tahap 4 S03 (tanpa menciptakan `DocumentRecord` palsu), tombol nonaktif jujur untuk *Dokumen Kosong* dan *Impor DOCX*, serta tanpa tombol mati `"Edit Template"`.
4. **Ekstensi Skema & Migrasi Non-Destruktif (`src/domain/types.ts`, `src/domain/seed.ts`, `src/storage/db.ts`)**:
   - Menambahkan `customTemplates?: DocumentTemplate[]` dan `templatePreferences?: TemplatePreferences` ke `AppState`, menginisialisasi kosong di `createDemoState()`/`createEmptyState()`, memvalidasi struktur pada `validateAppStateStructure()`, dan menormalkan secara idempoten di `migrateAppStateSchema()` sesudah verifikasi SHA-256 backup selesai.

#### B. Sumber Resmi Beban Mengajar Guru Berbasis `ScheduleVersion` (`src/domain/scheduleSources.ts`, `WorkloadDashboard.tsx`, `InspectorSlideDrawer.tsx`, `pdfExport.ts`, `App.tsx`)
1. **Pemisahan Tegas 4 Sumber Data Jadwal & Beban (`src/domain/scheduleSources.ts`)**:
   - Memisahkan secara struktural dan UI: **(1) `ScheduleVersion` Terbit Resmi** dalam `state.history`, **(2) `draft`** (pratinjau kerja belum terbit), **(3) `requirements`** (rencana Kebutuhan JP), dan **(4) `teacherAssignments`** (catatan tugas tambahan administratif, bukan jam KBM).
   - `verifyScheduleVersion()` memverifikasi ulang `buildScheduleFingerprint(version.entries)` dan jumlah entri; versi dengan checksum/entri tidak cocok ditandai rusak/dimodifikasi dan **ditolak** sebagai dasar resmi.
   - `resolveWorkloadSource()` **menolak `activeSchedule` polos** tanpa pasangan `ScheduleVersion` yang sah di `state.history`.
2. **Stempel Periode Historis (`src/App.tsx`, `src/domain/types.ts`, `src/domain/seed.ts`)**:
   - Menambahkan `academicYear?: string` dan `semester?: 'Ganjil' | 'Genap'` ke `ScheduleVersion`.
   - `publishDraft()` di `App.tsx` serta `VER-DEMO-01` di `seed.ts` (bersama fingerprint asli dari `buildScheduleFingerprint`) langsung menstempel periode ajaran saat diterbitkan. Untuk versi historis lama tanpa field periode, UI & PDF menampilkan `"Tidak tercatat pada versi lama"` tanpa memfabrikasi dari `state.settings` terkini.
3. **Pembaruan UI & Ekspor PDF Terikat Sumber (`WorkloadDashboard.tsx`, `InspectorSlideDrawer.tsx`, `pdfExport.ts`)**:
   - `WorkloadDashboard.tsx` menyediakan pemilih eksplisit 3 mode (*Jadwal Terbit (Resmi)*, *Pratinjau Draft*, *Kebutuhan JP (Rencana)*), dropdown pemilih `ScheduleVersion`, grid metadata audit integritas versi, banner peringatan/pemblokir saat versi tidak sah atau `activeSchedule` tidak sinkron, tabel khusus rencana saat mode *Kebutuhan JP*, serta catatan konteks administratif `teacherAssignments` yang terpisah dari JP KBM.
   - `InspectorSlideDrawer.tsx` memberi label eksplisit `"Rencana Kebutuhan JP (Planning)"` agar tidak tertukar dengan jadwal terbit resmi.
   - `exportScheduleTeacherPDF()` menerima `entriesOverride`, `sourceMode`, `versionInfo`, dan opsi `skipSave?: boolean` (untuk verifikasi stream PDF di test tanpa menulis disk); kop & metadata PDF mencetak stempel versi terbit + fingerprint resmi atau penanda ASCII `"PRATINJAU DRAFT - BELUM DITERBITKAN; BUKAN DOKUMEN RESMI ATAU DASAR SK"`.

### 3.2 Pembaruan Status Temuan (`PERS-*`) dan Butir Blueprint (`BP-*`)

| ID | Status Sebelum | Status Setelah Tahap 3 | Keterangan Aktual |
|---|---|---|---|
| `BP-008` | Belum Diimplementasikan | **SESUAI BLUEPRINT (S02 selesai)** | Layar S02 Galeri Template lengkap dengan 30 template `SYSTEM`, 6 kategori, 5 koleksi, pratinjau `{{PLACEHOLDER}}`, & kloning ke `MADRASAH`; S07 editor template tetap dijadwalkan pada Tahap 10 dan *Dokumen Kosong*/*Impor DOCX* tetap dinonaktifkan jujur menunggu Tahap 5–6. |
| `BP-017` | Belum Diimplementasikan | **SESUAI SEBAGIAN / SUMBER SELESAI** | Pemisahan 4 sumber jadwal/beban & validasi `ScheduleVersion` resmi selesai di `scheduleSources.ts`, `WorkloadDashboard.tsx`, `InspectorSlideDrawer.tsx`, `pdfExport.ts`, `publishDraft()`, & `seed.ts`; integrasi alur penerbitan SK di S04/S05 menyusul pada Tahap 9. |
| `BP-018` | Sebagian (Tahap 2) | **SEBAGIAN (Tahap 3 Ditambah)** | Menambahkan `DocumentTemplate`, `TemplatePreferences`, dan metadata periode historis pada `ScheduleVersion`; `DocumentVersion` & `DocumentAttachment` menyusul pada Tahap 8/10. |
| `PERS-005` | Terbuka | **SEBAGIAN TERKENDALI / SUMBER TERPISAH** | Ambiguitas sumber beban guru vs draft vs rencana kebutuhan JP di UI & ekspor PDF guru sudah diselesaikan dan diuji; penguncian pembuatan SK otomatis ke `ScheduleVersion` terverifikasi mengikuti pada Tahap 9. |
| `PERS-001` | Sebagian (Tahap 2 Selesai) | **SEBAGIAN (Tahap 3 Selesai: S01 + S02)** | Layar S01 dan S02 aktif terpadu di dalam menu `Persuratan & Arsip`; S03–S07 dijadwalkan pada Tahap 4–10. |

### 3.3 Daftar File yang Diubah / Ditambahkan pada Tahap 3

| File | Jenis Perubahan | Ringkasan Peran |
|---|---|---|
| `src/domain/persuratan/templates/types.ts` | Baru | Kontrak tipe S02 (`DocumentTemplate`, `TemplateCategory`, `TemplateCollection`, `TemplatePreferences`, blok pratinjau) |
| `src/domain/persuratan/templates/registry.ts` | Baru | `SYSTEM_DOCUMENT_TEMPLATES` beku berisi tepat 30 template resmi (`SYS-TPL-01`–`30`), 6 kategori, placeholder tanpa PII |
| `src/domain/persuratan/templates/selectors.ts` | Baru | Hitung kategori/koleksi, filter, favorit, riwayat terbaru (maks 10 unik), & kloning non-mutatif ke `MADRASAH` |
| `src/domain/scheduleSources.ts` | Baru | Verifikasi integritas `ScheduleVersion`, resolusi 4 sumber beban guru, agregasi JP, & pemformat periode |
| `src/domain/types.ts` | Diubah | Tambah `academicYear`/`semester` di `ScheduleVersion`, `customTemplates` & `templatePreferences` di `AppState` |
| `src/domain/seed.ts` | Diubah | Stempel periode + fingerprint asli pada `VER-DEMO-01`; inisialisasi `customTemplates: []` & `templatePreferences` |
| `src/storage/db.ts` | Diubah | Validasi opsional & migrasi idempoten `customTemplates` + `templatePreferences` |
| `src/utils/pdfExport.ts` | Diubah | Dukungan `entriesOverride`, `sourceMode`, `versionInfo`, `skipSave`, & label sumber resmi/draft pada PDF Guru |
| `src/components/InspectorSlideDrawer.tsx` | Diubah | Perjelas label bar ringkasan JP sebagai `Rencana Kebutuhan JP (Planning)` |
| `src/components/WorkloadDashboard.tsx` | Diubah | Pemilih 3 mode sumber beban, pemilih `ScheduleVersion`, audit integritas, tabel rencana terpisah, & ekspor PDF terikat sumber |
| `src/components/persuratan/TemplateGallery.tsx` | Baru | Layar S02 Galeri Template 3 kolom, pratinjau kertas surat, modal kloning, & batas jujur Tahap 4 |
| `src/components/persuratan/TemplateGallery.css` | Baru | Tata letak `.s02-*` Jewel Luxury responsif `1440×900` (1140px) & `1280×720` tanpa overflow horizontal |
| `src/components/persuratan/PersuratanWorkspace.tsx` | Baru | Pengelola navigasi internal `S01 <-> S02` dengan preservasi state filter/sort/paginasi S01 |
| `src/components/persuratan/CorrespondenceCenter.tsx` | Diubah | Sambungkan CTA `"Buat Dokumen"` / `"Jelajahi Galeri Template"` langsung ke S02 melalui callback `onOpenTemplateGallery` |
| `src/App.tsx` | Diubah | Render `PersuratanWorkspace` di menu `Persuratan & Arsip` & stempel `academicYear`/`semester` pada `publishDraft()` |
| `tests/phase1_integrity_and_assignments.test.ts` | Diubah (2 baris) | Sertakan `templatePreferences` & `customTemplates` pada uji kanonik pengurutan kunci payload |
| `tests/phase3_template_gallery.test.ts` | Baru | 9 skenario uji S02 (30 template, hitungan, filter, favorit, maks 10 terbaru, kloning, notice hukum, round-trip SHA-256, SSR) |
| `tests/phase3_workload_sources.test.ts` | Baru | 9 skenario uji sumber beban guru (pemisahan 4 sumber, tolak `activeSchedule` polos & versi rusak, periode historis, PDF stream, SSR) |
| `/HASIL_AUDIT_PERSURATAN.md` | Diubah (Prepend) | Penambahan laporan `PHASE-3` ini di atas `PHASE-2` tanpa mengubah laporan terdahulu |

### 3.4 Audit Checksum PDF Root, Verifikasi Akhir & Batasan Pengujian

| Pemeriksaan | Hasil | Detail |
|---|---|---|
| `npm run lint` (`tsc -b`) | **Exit `0`** | Lulus penuh tanpa error TypeScript di `tsconfig.app.json` maupun `tsconfig.node.json` |
| `npm test` (`vitest run`) | **Exit `0`** | **13/13 file test lulus, 84/84 tests lulus** (66 eksisting + 9 `phase3_template_gallery.test.ts` + 9 `phase3_workload_sources.test.ts`) |
| `npm run build` (`tsc -b && vite build`) | **Exit `0`** | **1869 modul**, selesai dalam `6.62s`, menghasilkan `dist/` |
| Penambahan dependency `package.json` | **Tidak Ada (`0`)** | Tidak ada paket npm baru yang ditambahkan pada Tahap 3 |

**Temuan Audit Checksum SHA-256 Berkas PDF Root (`SIGNAL_*.pdf`):**
Selama audit Tahap 3, dilakukan pengukuran checksum `sha256sum SIGNAL_*.pdf` sebelum dan sesudah menjalankan `npm test` (`2026-11-15 19:42:33 UTC` vs sesudah test pada `2026-11-16 03:10 WIB`):
1. **5 berkas PDF tetap 100% identik** (`SIGNAL_Jadwal_Kelas_VII_A.pdf`, `SIGNAL_Jadwal_Mingguan_Kelas_VII_A.pdf`, `SIGNAL_Jadwal_Sekolah_2026_2027.pdf`, `SIGNAL_Jadwal_Semua_Kelas_Satu_Halaman_2026_2027.pdf`, `SIGNAL_Rekap_Presensi_Guru_Oktober_2026.pdf`).
2. **9 berkas PDF di root berubah checksum SHA-256 setiap kali `npm test` dijalankan** (`SIGNAL_Jadwal_Guru_Ahmad_Fauzi__S_Pd_.pdf`, `SIGNAL_Jadwal_Mingguan_Kelas_VII_A_A4.pdf`, `SIGNAL_Jadwal_Semua_Kelas_A4_2026_2027.pdf`, `SIGNAL_Jadwal_Semua_Kelas_F4_2026_2027.pdf`, `SIGNAL_Rekap_Presensi_Guru_A4_Januari_2026.pdf`, `SIGNAL_Rekap_Presensi_Guru_A4_Juli_September_2026_3_Bulan.pdf`, `SIGNAL_Rekap_Presensi_Guru_A4_Oktober_2026.pdf`, `SIGNAL_Rekap_Presensi_Guru_F4_Februari_2029.pdf`, `SIGNAL_Rekap_Presensi_Guru_F4_Juli_Desember_2026_6_Bulan.pdf`).
3. **Akar penyebab:** Pengujian eksisting sebelumnya (`tests/workload_and_pdf.test.ts` dan `tests/attendance_recap.test.ts`) memanggil fungsi `exportSchedule*PDF` dan `exportAttendanceRecapPDF` di runtime Node tanpa mock `jsPDF.save()`, sehingga `jsPDF` menulis ulang kesembilan file PDF tersebut ke direktori kerja root dengan metadata `/CreationDate` dan `/ID` saat test berjalan (yang juga menjelaskan diskrepansi klaim SHA-256 PDF identik pada catatan `PHASE-2`). Seluruh pengujian baru Tahap 3 (`tests/phase3_workload_sources.test.ts`) menggunakan opsi `skipSave: true` sehingga **Tahap 3 tidak menulis/mengubah file PDF contoh apa pun di disk**.

**Batasan Pengujian & Sinkronisasi:**
1. **Lingkungan Pengujian Node/SSR:** `vitest` dijalankan di `environment: 'node'` (`react-dom/server` `renderToStaticMarkup`); interaksi DOM klik nyata maupun verifikasi visual CSS langsung di browser headless pada viewport `1440×900` dan `1280×720` belum dieksekusi di sandbox ini.
2. **Ketidaktersediaan `.git` Lokal:** Container `/app/applet` tidak menyertakan direktori `.git`, sehingga verifikasi terhadap commit dasar `9afa5fe429f1d573be9919e8b49d2455ba0209fd` serta proses commit/push ke GitHub harus dilakukan oleh pengguna dari luar container.

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
