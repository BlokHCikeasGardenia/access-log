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
- `npm run build` → hasil di `dist/`. Base path (prefix aset & router) otomatis mengikuti
  `VITE_BASE_PATH` (lihat bagian *Routing & Base Path* di bawah). Di mode *production*
  nilai ini diambil dari `.env.production`.
- `npm run deploy` (butuh `gh-pages`) untuk publish isi `dist/` ke branch `gh-pages`.
  Skrip ini otomatis menjalankan `npm run build` dahulu (via `predeploy`).
- Pastikan `VITE_BASE_PATH` sesuai: `/` untuk user/org pages, `/<repo>/` untuk project pages.

## Routing & Base Path (GitHub Pages SPA)
Aplikasi ini memakai **vue-router history mode**, jadi URL-nya bersih tanpa `#`
(mis. `/login`, `/residents`). Karena host statis seperti GitHub Pages tidak punya
server rewrite, mengunjungi/merefresh route secara langsung akan memicu halaman 404
dari GitHub. Untuk itu ada **SPA fallback** yang sudah diatur:

- Meninggalkan `404.html` di root, jadi GitHub Pages menserve `404.html` untuk path
  yang tidak ada sebagai file fisik.
- `404.html` men-stash URL asli ke `sessionStorage` (kunci `spa-redirect`), lalu
  redirect ke root project page (`/access-log/`).
- `src/main.ts` membaca `spa-redirect` tersebut dan memulihkan URL dengan
  `history.replaceState` **sebelum** router mount, sehingga Vue Router menampilkan
  route yang benar.
- `SEGMENTS_TO_KEEP` di `404.html` harus sama dengan jumlah segmen base path
  (mis. `/access-log` = **1**). Jika repo/base path berubah, perbarui angka ini.

### Perilaku status HTTP
Harap dicatat: karena deep link `/path` tidak ada sebagai file fisik, GitHub Pages
balas **status 404** di level HTTP — tapi body yang dikirim adalah `404.html` kita
(bukan halaman 404 default). Di browser fallback ini berjalan transparan: user tetap
diarahkan ke halaman yang benar. Jadi "404" di *DevTools Network* untuk route dalam
skenario ini adalah **normal** di GitHub Pages dan bukan karena bug.

### Contoh base path
| Jenis halaman | URL | `VITE_BASE_PATH` | `SEGMENTS_TO_KEEP` |
|---|---|---|---|
| User/Org page | `https://user.github.io/` | `/` | 0 |
| Project page | `https://user.github.io/access-log/` | `/access-log/` | 1 |

Saat develop lokal dengan `npm run dev`, `VITE_BASE_PATH` dari `.env` (biasanya bernilai
`/`) dipakai sebagai base, sehingga app berjalan di root dan deep link tidak perlu
prefix. Nilai `/access-log/` hanya berpengaruh saat `npm run build` karena diambil
dari `.env.production` yang menimpa `.env`.

## Format upload
- **Penghuni** (TAB-separated, header otomatis dilewati): `Blok<TAB>Nama`
- **Kartu** (pipe-separated, header otomatis dilewati): `UID|LabelA|LabelB`

## Catatan
- RLS diaktifkan: hanya user terautentikasi yang boleh baca/tulis.
- Hapus penghuni = hard delete; jika masih punya kartu, kartu kembali ke pool (resident_id = NULL).
- Hapus kartu = hard delete; jika sedang terpasang, hubungan ikut terlepas.
- Tombol **Import Sample Data** di Beranda memuat data contoh dari `public/sample-*.txt`.
