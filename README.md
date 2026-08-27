# Log Akses — Webapp Data Penghuni & Kartu

Static SPA (Vue 3 + Vite + TypeScript + Tailwind) untuk mengelola data penghuni komplek,
kartu akses, dan hubungan keduanya. Terdeploy sebagai static site (GitHub Pages) dan
berbicara langsung ke Supabase (Auth + Postgres) dari browser — tanpa backend terpisah.

## Fitur
- **Auth**: login email/password via Supabase Auth. Session persisten.
- **Penghuni**: tabel blok / nama / status; tambah manual atau upload `.txt` (TAB-separated).
- **Kartu**: master kartu (UID, Label A, Label B); tambah manual atau upload `.txt` (pipe-separated).
- **Hubungan**: pasangkan kartu ke penghuni via combobox (cari berdasarkan Label B),
  ubah status kartu (Aktif/Rusak/Hilang), lepas kartu (kembali ke pool).

## Setup lokal
1. `npm install`
2. Copy `.env.example` → `.env` dan isi:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_BASE_PATH` (lihat di bawah)
3. Buat project Supabase, lalu jalankan `supabase/schema.sql` di SQL editor.
4. Buat user admin lewat Supabase Dashboard (Authentication → Users → Add user).
5. `npm run dev`

## Build & deploy (GitHub Pages)
- `npm run build` → hasil di `dist/` (base path relatif `./` agar cocok di sub-path).
- `npm run deploy` (butuh `gh-pages`) untuk publish ke branch `gh-pages`.
- Pastikan `VITE_BASE_PATH` sesuai: `/` untuk user/org pages, `/<repo>/` untuk project pages.

## Format upload
- **Penghuni** (TAB-separated, header otomatis dilewati): `Blok<TAB>Nama`
- **Kartu** (pipe-separated, header otomatis dilewati): `UID|LabelA|LabelB`

## Catatan
- RLS diaktifkan: hanya user terautentikasi yang boleh baca/tulis.
- Hapus penghuni = hard delete; jika masih punya kartu, kartu kembali ke pool (resident_id = NULL).
- Hapus kartu = hard delete; jika sedang terpasang, hubungan ikut terlepas.
- Tombol **Import Sample Data** di Beranda memuat data contoh dari `public/sample-*.txt`.
