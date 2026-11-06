# SIGNAL — Decision Log & Evolution

## Keputusan visual aktif


**SIGNAL V3.2 — Signature Jewel Luxury** adalah arah visual aktif. Arah ini dipilih setelah iterasi V3 dan menggantikan keputusan visual historis yang tercatat pada versi sebelumnya.

- Modern, chic, elegant, colorful jewel luxury; bukan quiet luxury dan bukan monochrome.
- Heritage Night, Heritage Green, Jade, Midnight Blue, Deep Plum, Warm Ivory, Antique Gold, dan Gold Light.
- Fraunces × Inter.
- Hero dan KPI memakai jewel enamel, engraved geometry, relief halus, serta ilustrasi sesuai fungsi fitur.
- Logo SVG SIGNAL mempunyai emblem, wordmark terang/gelap, PNG high-resolution, dan favicon.
- Sidebar bawah mempunyai brand panel yang tetap terlihat pada mode collapsed.
- Visual harus premium di seluruh fitur, tetapi ringkas dan data-first.

## Evolusi desain (riwayat tetap dipertahankan)

| Urutan | Artefak/arah | Status saat ini | Catatan |
|---|---|---|---|
| 1 | SIGNAL Scheduling Stack / dashboard exploration | Arsip eksplorasi | Masukan struktur dan prioritas data |
| 2 | Dashboard Desktop-First / Budget Simple | Arsip eksplorasi | Pembanding density dan layout |
| 3 | Workspace Redesign v3/v4 + references | Arsip riset dan iterasi | Sumber pola dan referensi |
| 4 | No-Slop Luxury Compact | Prinsip UX aktif, bukan visual final | Anti-slop, clarity, performance tetap wajib |
| 5 | Quiet Luxury refresh branch | Baseline kode historis | Bukan identitas final |
| 6 | Atelier / Expressive Jewel Luxury V3 | Pendahulu identitas final | Dikembangkan dan diperinci pada V3.2 |
| 7 | Islamic School Bento / mockup eksplorasi | Arsip eksplorasi | Bukan layout source of truth saat ini |
| 8 | SIGNAL V3.2 Signature Jewel Luxury | **AKTIF** | Source of truth visual dan logo |

## Keputusan pengguna yang mengikat

- Ubah visual secara besar, tetapi jangan membuang fitur, aturan bisnis, data, atau perilaku aplikasi.
- Kemewahan harus terasa di seluruh layar, fitur, hero, KPI, sidebar footer, brand, dan detail kecil.
- Gunakan ornamen, tekstur, ilustrasi, emblem, relief, dan garis arsitektural sesuai konteks. Ornamen tidak boleh mengganggu pembacaan.
- Aplikasi harus sederhana, ringkas, cepat dipahami orang awam, minim klik, dan minim scroll yang tidak perlu.
- Logo SIGNAL harus modern, elegan, sederhana, scalable, dan cocok untuk banyak media.
- Jangan menambahkan fitur absensi atau AI assistant baru.
- Target kualitas tinggi adalah aspirasi; skor hanya diberikan setelah pengujian visual, fungsional, responsive, keyboard, dan task usability.

## Keputusan teknis

- React 19 + TypeScript + Vite + Express.
- IndexedDB local-first; tidak ada cloud database wajib.
- Domain engine, validator, generator, attendance, storage, backup/restore, history, dan PDF export harus dipertahankan.
- Visual layer terpisah dari domain agar mudah dirawat dan rollback.
- Aset brand/ilustrasi harus lokal dan ringan.
- Gemini opsional dan OFF secara default. Ia tidak menentukan validitas jadwal.
- Build/test hanya boleh dinyatakan lulus setelah benar-benar dijalankan.

## Catatan implementasi

- `src/main.tsx` memuat `sakala-modern.css` sebagai fondasi komponen lama, `signal-v3-atelier.css` sebagai sistem V3, lalu `signal-v3-jewel-identity.css` sebagai lapisan signature V3.2.
- Jangan menghapus stylesheet dasar karena masih mendefinisikan komponen layar yang diwarisi.
- Aturan domain dan folder tests tidak boleh diubah untuk sekadar menyesuaikan mockup.
