# SIGNAL V3.2 — Google AI Studio Import & Handoff

## 1. Tujuan paket

Paket ini adalah source aplikasi SIGNAL yang berjalan menggunakan React + TypeScript + Vite, dengan Express sebagai server opsional. ZIP dapat diekstrak untuk diperiksa atau dipakai sebagai source repository sebelum diimpor melalui workflow GitHub yang tersedia di Google AI Studio Build.

## 2. File penting

- `src/` — aplikasi, komponen, domain, storage, utilitas.
- `server.ts`, `server/` — Express dan Gemini endpoint opsional.
- `public/` — logo, favicon, ilustrasi, dan aset lokal.
- `tests/` — regression suite.
- `AI_STUDIO_IMPORT_PROMPT.md` — master prompt terbaru; ikuti ini sebagai instruksi implementasi utama.
- `docs/DESIGN_SYSTEM.md` — design system V3.2.
- `docs/BRAND_IDENTITY_V3_2.md` — logo, token, dan material visual.
- `docs/QA_VISUAL_REFRESH_V3_2.md` — status pemeriksaan paket yang dikirim.

## 3. Import workflow

1. Ekstrak ZIP ke folder lokal.
2. Tinjau `.env.example`; jangan membuat atau memasukkan secret ke project.
3. Siapkan repository kerja pribadi di GitHub bila alur AI Studio meminta repository. Jangan unggah backup data sekolah atau data pribadi guru/siswa.
4. Push source ke branch kerja. Pertahankan struktur folder dan lockfile yang tersedia.
5. Di Google AI Studio, buka Build dan gunakan alur Import from GitHub yang tersedia pada akun.
6. Berikan `AI_STUDIO_IMPORT_PROMPT.md` sebagai instruksi utama. Jangan minta AI Studio scaffold ulang dari nol.
7. Install dependencies, lalu jalankan test dan build.

Import ZIP langsung tidak diasumsikan tersedia pada seluruh versi UI/akun. Ikuti dokumentasi dan pilihan UI AI Studio yang berlaku saat import.

## 4. Instruksi penting untuk AI Studio

- Visual source of truth aktif: **SIGNAL V3.2 Signature Jewel Luxury**.
- Baca `AI_STUDIO_IMPORT_PROMPT.md`, `docs/DESIGN_SYSTEM.md`, dan `docs/BRAND_IDENTITY_V3_2.md`.
- Jika dokumen historis menyebut Bento/quiet luxury sebagai final atau menolak Atelier, anggap arahan visual itu superseded.
- Pertahankan seluruh route, tabs, modals, actions, feature logic, validator, generator, IndexedDB, attendance, history, backup/restore, dan PDF.
- Jangan membuat seluruh preview/plate menjadi layar Beranda.
- Jangan membuat ulang aplikasi dengan template statis.
- Jangan mengubah domain engine tanpa bug yang terisolasi dan regression test.
- Gemini OFF default; aplikasi inti harus berjalan tanpa API key.
- Jangan mengklaim build/test lulus bila tidak dijalankan.

## 5. Batasan teknis dan keamanan

- Data local-first tersimpan di browser/perangkat; tidak ada sinkronisasi otomatis lintas perangkat.
- Jangan menaruh Gemini API key pada frontend, `VITE_*`, localStorage, URL, atau repository.
- Tidak ada autentikasi aplikasi pada baseline saat ini. Hosting publik perlu dipertimbangkan sebelum digunakan dengan data asli.
- Kuota layanan gratis tidak dijamin dan dapat berubah.
