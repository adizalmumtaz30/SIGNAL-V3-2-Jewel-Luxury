# SIGNAL Design System — V3.2 Signature Jewel Luxury

**Status:** visual system aktif untuk source aplikasi di repo ini. Dokumen eksplorasi desain yang lebih lama adalah arsip, bukan instruksi visual aktif.

## 1. Design thesis

**Modern academic systems, dressed in expressive jewel materials.** SIGNAL harus terasa modern, elegan, berkelas, dan berkarakter dari layar pertama sampai detail terkecil. Ini bukan quiet luxury, bukan monochrome, dan bukan dashboard SaaS generik. Kekayaan visual datang dari warna permata, kontras material, ornamen arsitektural, ilustrasi vektor, dan detail logam yang terukur.

Kemewahan visual tidak boleh memperumit pekerjaan operator. Jadwal, tabel, angka, status, dan tindakan harus selalu lebih mudah dibaca daripada ornamen.

## 2. Visual identity and material methods

Gunakan teknik berikut sebagai sistem, bukan dekorasi acak:

1. **Jewel enamel:** bidang emerald, midnight blue, plum, dan warm gold dengan gradasi pendek untuk hero dan KPI prioritas.
2. **Engraved geometry:** garis radial, rosette geometris, arch, grid, dan motif terinspirasi arsitektur Islam modern. Opacity rendah dan hanya di area dekoratif.
3. **Metal detailing:** garis tipis antique gold, bevel 1px, emblem, dan highlight kecil. Hindari frame emas tebal.
4. **Layered relief:** inner highlight, border ganda yang halus, dan shadow bertingkat untuk memberi kedalaman.
5. **Editorial typography:** Fraunces untuk display/angka tertentu, Inter untuk navigasi, tabel, form, dan instruksi.
6. **Signature illustration:** motif harus mengikuti fungsi layar. Jadwal memakai grid/calendar geometry; generator memakai orbit/flow; validasi memakai shield/precision mark; presensi memakai calendar/record; PDF memakai document seal.
7. **Brand continuity:** logo, hero, KPI, footer sidebar, topbar, loading state, favicon, dan logo dokumen harus terasa berasal dari keluarga identitas yang sama.

Jangan memasang semua motif sekaligus. Pilih satu ornamen utama dan maksimal satu tekstur pendukung per bidang. Jangan menaruh tekstur di belakang isi tabel.

## 3. Palette tokens

| Token | Hex | Role |
|---|---|---|
| Heritage Night | `#173D32` | Sidebar dan permukaan gelap utama |
| Heritage Green | `#245748` | Brand surface dan aksi utama |
| Jade | `#5F8D79` | Aksen sekunder |
| Emerald | `#2D8066` | Status/aksen brand sekunder |
| Midnight Blue | `#334F70` | Analitik dan metrik |
| Dusty Blue | `#748DA6` | Aksen informasi |
| Deep Plum | `#4C3455` | Metrik sekunder premium |
| Muted Plum | `#927D98` | Aksen plum ringan |
| Antique Gold | `#B39A68` | Border, divider, signature detail |
| Gold Light | `#E5C97A` | Highlight gold |
| Warm Ivory | `#F7F4ED` | Canvas aplikasi |
| Paper | `#FFFEFA` | Surface konten |
| Warm Stone | `#E9E4DC` | Surface sekunder |
| Soft Sage | `#E2EAE1` | Selected state |
| Ink | `#26352F` | Teks utama |

Status tetap semantik dan kontras: success green, warning amber, danger red, info blue, neutral stone. Selalu sertakan teks/ikon; jangan mengandalkan warna saja.

## 4. Logo system

- `public/signal-mark.svg`: emblem utama untuk sidebar, loading, favicon/app icon.
- `public/signal-logo.svg`: wordmark horizontal untuk latar terang.
- `public/signal-logo-light.svg`: wordmark horizontal untuk latar gelap.
- `public/signal-mark.png`, `public/signal-logo.png`, `public/signal-logo-light.png`: PNG hi-res untuk software yang tidak mendukung SVG.
- `public/favicon.svg`: favicon.

Monogram S melambangkan hubungan antaroperasi akademik; aksen gold menjadi titik signature. Jangan mengganti logo dengan huruf S default, emoji, atau ikon kalender generik.

## 5. Typography

- Display/headings: Fraunces, weight 600–700; fallback Georgia/serif.
- Operational UI/data: Inter, weight 400–800; fallback system sans.
- Body copy singkat dan sehari-hari. Hindari istilah teknis tanpa kebutuhan.
- Label harus terbaca; angka KPI memakai tabular numerals bila tersedia.
- Jangan memakai font eksternal sebagai syarat aplikasi berjalan; fallback wajib ada.

## 6. Hero and KPI architecture

Setiap halaman inti memiliki satu hirarki pembuka yang jelas, tetapi tidak semua harus menjadi hero besar.

- **Overview hero:** jewel-enamel utama, judul status singkat, satu tindakan utama, satu tindakan sekunder, motif geometris besar di sisi kosong.
- **Feature heading:** judul editorial, kicker ringkas, tindakan utama, signature medallion kecil. Hindari paragraf penjelasan panjang.
- **KPI:** empat keluarga material yang dapat dipilih sesuai konteks: Emerald Enamel, Midnight Blue, Deep Plum, Warm Gold. Angka harus berasal dari state aplikasi. Setiap KPI menampilkan nama, angka, unit/konteks, dan status bila relevan.
- **Workload:** hero analitik emerald; KPI membedakan total JP, rata-rata, pemenuhan standar, dan overload.
- **Generator:** KPI kebutuhan, kapasitas, kandidat, dan status solver. `SEARCH_LIMIT_REACHED` harus berbeda dari `INFEASIBLE`.
- **Requirements:** KPI kebutuhan, kapasitas, keseimbangan, dan rombel tuntas.
- **Schedule:** angka konteks kecil, tidak mengalahkan matriks jadwal.

Aturan anti-noise:
- Maksimal satu motif besar + satu tekstur per hero.
- Ornamen selalu `pointer-events: none`, tidak memengaruhi layout, dan tidak menutupi angka/tombol.
- Jangan membuat grafik atau KPI palsu untuk memenuhi komposisi.
- Gunakan shadow dan border untuk membangun kedalaman, bukan glow berlebihan.

## 7. Sidebar and application shell

- Sidebar Heritage Night dengan navigasi yang mudah dipindai.
- Logo tampil utuh ketika lebar dan emblem tetap terlihat ketika collapsed.
- Panel bawah sidebar menjadi signature panel: emblem, status local-first, tahun ajaran, ornamen geometris halus. Pada mode collapsed, tampilkan emblem mini.
- Jangan menyembunyikan fitur penting hanya untuk mengurangi panjang menu.
- Topbar tetap ringkas dan sticky; hindari banner berlapis.

## 8. Layout and feature patterns

### Dashboard / Overview
Hero status → KPI inti → status per rombel → aksi dan ringkasan yang mendukung pekerjaan. Prioritaskan tindakan, bukan kumpulan kartu dekoratif.

### Jadwal Pelajaran
Matriks jadwal adalah artefak utama dan harus tetap lebar, padat, kronologis, dan terbaca. Slot KBM dan non-KBM harus dibedakan secara jelas. Horizontal scroll hanya di area tabel, bukan seluruh halaman. Pertahankan zoom/compact mode dan alternatif edit yang aksesibel.

### Kebutuhan & Alokasi
Tampilkan kebutuhan, kapasitas, sisa/kelebihan, dan rombel yang belum tepat. Form alokasi dibuat singkat, pencarian dan pilihan guru/mapel jelas.

### Schedule Generator
Tampilkan status proses, kandidat, search nodes, dan langkah berikutnya. Jangan menyamakan pencarian mencapai batas dengan bukti tidak feasible.

### Validasi & Konflik
Ringkas jumlah error dan warning. Kelompokkan isu, jelaskan dengan kalimat pendek, dan sediakan aksi menuju perbaikan. Validator deterministik tetap otoritatif.

### Beban Guru
Tampilkan JP aktual, batas mingguan, sesi, distribusi hari, dan guru overload/underload. Semua perhitungan berasal dari jadwal, bukan angka ilustratif.

### Data Master
Tabs, pencarian, filter, tabel, dan form singkat. Hindari memecah setiap record menjadi card pada desktop.

### Presensi Guru
Pertahankan tab harian, bulanan, per guru, rekap, dan hari libur. Prioritaskan tanggal, status, cakupan guru, tindakan simpan, dan rekap. Bahasa sederhana.

### Riwayat, Backup, Restore
Versi dan snapshot harus mudah dipindai. Restore perlu konfirmasi dan validasi ulang. Jelaskan bahwa data local-first tidak otomatis tersinkron antarperangkat.

### Pengaturan
Kelompokkan hari aktif, slot, identitas madrasah, dan Gemini opsional. Jangan menyebar pengaturan serupa ke beberapa layar.

### Ekspor PDF
Dialog ekspor fokus pada cakupan, ukuran kertas, orientasi, kop, tanda tangan, rekap JP, pewarnaan, pemadatan konten, dan preview. Pastikan semua opsi yang sudah ada dipertahankan.

## 9. UX language and density

- Gunakan kalimat pendek dan kata yang umum.
- Satu instruksi untuk satu tindakan.
- Hindari deskripsi berulang di hero, card, tooltip, dan banner.
- Default tampilkan ringkasan; detail dibuka saat diperlukan.
- Minimalkan klik untuk pekerjaan yang sering dilakukan.
- Gunakan inline edit jika aman dan jelas; jangan mengorbankan validasi.
- Filter/search tetap dekat dengan tabel yang dikendalikan.
- Hindari scroll halaman yang panjang; gunakan pengelompokan, sticky action, dan overflow lokal secara selektif.

## 10. Responsive, accessibility and performance

- Target kontras minimal WCAG 2.2 AA.
- Focus-visible kuat; seluruh aksi keyboard accessible.
- Touch target praktis 40–44px.
- 320–375px: sidebar menjadi drawer; KPI menjadi dua kolom bila isi masih terbaca; tabel melakukan scroll lokal.
- Tablet: dua kolom hanya jika lebar cukup.
- Desktop: gunakan ruang lebar untuk matriks, jangan memaksa grid tiga kolom untuk semua halaman.
- Hindari body-level horizontal overflow.
- Animasi 120–200ms, hanya untuk feedback; hormati `prefers-reduced-motion`.
- Ornamen lokal dan SVG ringan; tidak perlu request gambar eksternal.

## 11. Anti-slop guardrails

- Tidak ada placeholder KPI atau chart palsu.
- Tidak ada teks marketing filler.
- Tidak ada ornamen yang menutupi angka, data, atau kontrol.
- Tidak ada bento grid untuk setiap komponen.
- Tidak ada glassmorphism, skeuomorphism, gradient neon, atau glow massal.
- Tidak ada penambahan library icon/font jika yang tersedia sudah cukup.
- Tidak ada penghapusan fungsi atau simplifikasi aturan domain demi tampilan.
