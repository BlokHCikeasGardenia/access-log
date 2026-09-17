# Rencana Implementasi Push Data Kartu ke Reader Gate

## 1. Tujuan

Membangun fitur untuk mengirim perubahan kartu akses ke reader yang berada di gate melalui:

- Command: `https://cek.goepoet.com/card-command.php`
- Feedback: `https://cek.goepoet.com/command-result.php`

Fitur harus mendukung tiga aksi:

```json
{
  "action": "UPDATE",
  "uid": 56909775,
  "blok": "H",
  "no_rumah": "25"
}
```

```json
{
  "action": "ADD",
  "uid": 56909775,
  "blok": "H",
  "no_rumah": "25"
}
```

```json
{
  "action": "DELETE",
  "uid": 56909775,
  "blok": "H",
  "no_rumah": "25"
}
```

Feedback dari gate diformat sebagai berikut:

```json
{
  "success": true,
  "message": "Hasil command berhasil diambil",
  "data": {
    "action": "UPDATE",
    "uid": 56909775,
    "status": "DONE",
    "tgl_kirim": "2026-08-27 14:39:21",
    "tgl_eksekusi": "2026-08-27 22:53:58",
    "pesan": "Kartu berhasil diupdate"
  }
}
```

## 2. Konteks Aplikasi

Aplikasi saat ini menggunakan:

- Vue 3, Vite, TypeScript, dan Supabase.
- GitHub Pages sebagai hosting static.
- Supabase Edge Function sebagai proxy API eksternal.
- Tabel utama `cards` dan `residents`.
- Field kartu `uid`, `blok`, dan `no_rumah` sudah tersedia pada migration:
  `supabase/migrations/20260914030502_add-blok-no-rumah-to-cards.sql`.

Pola integrasi eksternal yang sudah ada:

- `supabase/functions/log-gate/index.ts`
- `supabase/functions/log-card-list/index.ts`
- Konfigurasi JWT pada `supabase/config.toml`.

Pengecekan awal menunjukkan endpoint eksternal tidak dapat dipanggil langsung dari browser tanpa proxy karena tidak mendukung CORS preflight dengan benar. Oleh karena itu, seluruh komunikasi harus melalui Supabase Edge Function.

## 3. Keputusan Desain

1. Database lokal Supabase tetap menjadi sumber data utama.
2. Perubahan lokal disimpan terlebih dahulu, kemudian command gate dikirim secara asinkron.
3. Kegagalan gate tidak membatalkan perubahan database lokal.
4. Command yang gagal dapat diulang dari halaman sinkronisasi.
5. Gunakan antrean command agar proses tidak hilang saat browser ditutup atau terjadi gangguan jaringan.
6. Gunakan `uid` sebagai string pada payload untuk mempertahankan angka nol di depan.
7. Gunakan field `blok` dan `no_rumah` dari data kartu sebagai sumber utama.
8. Jangan melakukan sinkronisasi otomatis saat menarik data dari `card-list.php` agar tidak terjadi loop sinkronisasi.
9. Hanya kartu yang dipasangkan ke penghuni yang dikirim secara otomatis ke gate.
10. Command untuk UID yang sama harus diproses berurutan untuk mencegah konflik ADD, UPDATE, dan DELETE.

## 4. Penempatan Fitur

### 4.1 Halaman Kartu

Halaman utama untuk memulai command adalah `/cards` karena UID, Blok, dan No Rumah berada pada tabel kartu.

File:

- `src/views/CardsView.vue`

Perubahan UI:

- Tambahkan tombol **Kirim ke Gate** pada header.
- Tambahkan kolom **Status Gate** pada tabel.
- Tambahkan badge status:
  - Antre
  - Mengirim
  - Menunggu Reader
  - Selesai
  - Gagal
- Tambahkan aksi **Kirim ke Gate** pada setiap baris kartu.
- Tambahkan tombol bulk **Kirim Pilihan** jika fitur pemilihan banyak kartu diimplementasikan.

Referensi UI saat ini:

- Header: `src/views/CardsView.vue:326-344`
- Tabel desktop: `src/views/CardsView.vue:409-436`
- Tabel mobile: `src/views/CardsView.vue:457-461`

### 4.2 Halaman Sinkronisasi Gate

Buat halaman baru:

- Route: `/gate-sync`
- Menu navigasi: **Sinkronisasi Gate**
- File: `src/views/GateSyncView.vue`

Halaman ini digunakan untuk:

- Melihat antrean command.
- Melihat feedback dari reader.
- Melihat riwayat ADD, UPDATE, dan DELETE.
- Melihat pesan error.
- Mengulang command yang gagal.
- Mengirim command manual jika diperlukan.

Menu ditambahkan pada:

- Desktop: `src/App.vue:33-36`
- Mobile: `src/App.vue:44-47`
- Route: `src/router/index.ts:7-13`

### 4.3 Halaman Pairing

Halaman `/relationships` menjadi sumber trigger untuk:

- Pairing kartu ke penghuni → `ADD`
- Melepas kartu dari penghuni → `DELETE`

File:

- `src/views/RelationshipsView.vue`

Referensi:

- Pairing: `src/views/RelationshipsView.vue:64-78`
- Unpairing: `src/views/RelationshipsView.vue:91-104`

### 4.4 Halaman Penghuni

Halaman `/residents` menjadi sumber trigger untuk perubahan data penghuni yang memengaruhi kartu:

- Perubahan blok penghuni → `UPDATE` untuk kartu yang dipasangkan, jika blok penghuni menjadi sumber data gate.
- Penghapusan penghuni → `DELETE` untuk seluruh kartu yang dipasangkan.

File:

- `src/views/ResidentsView.vue`

Referensi:

- Edit penghuni: `src/views/ResidentsView.vue:133-151`
- Hapus penghuni: `src/views/ResidentsView.vue:167-181`

## 5. Mapping Aksi

| Aksi | Trigger | Payload |
|---|---|---|
| `ADD` | Kartu dipasang ke penghuni atau dikirim manual | `action`, `uid`, `blok`, `no_rumah` |
| `UPDATE` | Blok atau No Rumah kartu berubah dan kartu sedang dipasangkan | `action`, `uid`, `blok`, `no_rumah` |
| `DELETE` | Kartu dilepas, kartu dihapus, atau penghuni dihapus | `action`, `uid`, `blok`, `no_rumah` |

Aturan payload:

- `uid` tidak boleh kosong.
- `uid` dikirim sebagai string.
- `blok` dan `no_rumah` dibersihkan dari spasi di awal dan akhir.
- Untuk MVP, ketiga field lokasi tetap dikirim pada semua aksi sesuai format yang diberikan.
- Jika validasi API gate ternyata hanya membutuhkan `uid` untuk `DELETE`, aturan payload dapat disesuaikan setelah kontrak API dikonfirmasi.

## 6. Arsitektur

```text
Aksi pengguna di Vue
        ↓
Perubahan data pada Supabase
        ↓
Pencatatan command ke tabel gate_commands
        ↓
Edge Function card-command
        ↓
POST ke https://cek.goepoet.com/card-command.php
        ↓
Edge Function command-result
        ↓
POST ke https://cek.goepoet.com/command-result.php
        ↓
Penyimpanan status dan feedback
        ↓
Tampilan pada halaman Sinkronisasi Gate
```

### 6.1 Alasan Menggunakan Antrean

Antrean diperlukan untuk:

- Menahan command ketika jaringan gate sedang gangguan.
- Mencegah command hilang saat halaman ditutup.
- Menghindari command ganda untuk UID yang sama.
- Menyediakan riwayat audit.
- Memungkinkan retry tanpa mengubah data lokal.
- Memisahkan proses UI dari proses komunikasi dengan reader.

### 6.2 Tabel `gate_commands`

Buat migration baru, misalnya:

`supabase/migrations/<timestamp>_create-gate-commands.sql`

Kolom yang direkomendasikan:

```text
id              uuid primary key
action          text not null
uid             text not null
blok            text
no_rumah        text
status          text not null
attempt_count   integer not null default 0
last_error      text
sent_at         timestamptz
executed_at     timestamptz
message         text
result          jsonb
created_by      uuid
created_at      timestamptz
updated_at      timestamptz
```

Status:

```text
QUEUED
SENDING
WAITING_RESULT
DONE
FAILED
```

Index yang direkomendasikan:

- `gate_commands_status_idx` pada `status`.
- `gate_commands_created_at_idx` pada `created_at`.
- `gate_commands_uid_idx` pada `uid`.
- Unique atau locking mechanism untuk satu command aktif per `uid`.

Jika endpoint feedback hanya mengembalikan hasil terbaru secara global dan tidak menyediakan ID command, proses command harus dijalankan satu per satu secara global, bukan paralel.

## 7. Edge Function

### 7.1 `card-command`

File:

`supabase/functions/card-command/index.ts`

Tugas:

1. Terima JSON dari frontend.
2. Validasi method `POST`.
3. Validasi `action`, `uid`, `blok`, dan `no_rumah`.
4. Simpan command ke `gate_commands`.
5. Teruskan payload ke `https://cek.goepoet.com/card-command.php`.
6. Gunakan header `Content-Type: application/json`.
7. Teruskan response dari API gate ke frontend.
8. Tandai command sebagai `SENDING` atau `WAITING_RESULT`.
9. Tangani HTTP error, network error, dan response `success: false`.
10. Tambahkan header CORS pada response Edge Function.

Konfigurasi:

```toml
[functions.card-command]
verify_jwt = true
```

### 7.2 `command-result`

File:

`supabase/functions/command-result/index.ts`

Tugas:

1. Terima `command_id` atau data command dari frontend.
2. Ambil snapshot command dari `gate_commands`.
3. Panggil `https://cek.goepoet.com/command-result.php`.
4. Cocokkan feedback dengan `action` dan `uid`.
5. Tangani response berupa object atau array.
6. Tandai command sebagai `DONE` jika `status` bernilai `DONE`.
7. Tandai command sebagai `FAILED` jika status menunjukkan kegagalan.
8. Simpan `tgl_kirim`, `tgl_eksekusi`, dan `pesan`.
9. Simpan raw result jika diperlukan untuk audit.
10. Tambahkan header CORS pada response Edge Function.

Konfigurasi:

```toml
[functions.command-result]
verify_jwt = true
```

Catatan penting:

- `GET https://cek.goepoet.com/command-result.php` mengembalikan `405 Method Not Allowed`.
- Method dan body request untuk feedback harus dikonfirmasi sebelum implementasi.
- Jangan mengasumsikan endpoint feedback dapat dipanggil dengan GET.

## 8. Environment

Tambahkan pada `.env.example`, `.env`, dan konfigurasi production:

```env
VITE_SUPABASE_EDGE_CARD_COMMAND=https://<project-ref>.functions.supabase.co/card-command
VITE_SUPABASE_EDGE_COMMAND_RESULT=https://<project-ref>.functions.supabase.co/command-result
```

Referensi pola environment:

- `.env.example:11-18`
- `src/views/HomeView.vue:70`
- `src/views/CardsView.vue:16`

## 9. Frontend Module

Buat helper:

`src/lib/gate-command.ts`

Isi helper:

- Type `CardCommandAction`.
- Type `CardCommand`.
- Type `GateCommandStatus`.
- Type `GateCommandResult`.
- Fungsi validasi payload.
- Fungsi membangun payload ADD, UPDATE, dan DELETE.
- Fungsi mengirim command ke Edge Function.
- Fungsi mengambil feedback.
- Fungsi polling dengan timer.
- Fungsi menghentikan polling saat component unmount.
- Fungsi normalisasi error.

Jenis data dapat ditambahkan pada:

`src/types.ts`

Contoh:

```ts
export type CardCommandAction = 'ADD' | 'UPDATE' | 'DELETE'

export type GateCommandStatus =
  | 'QUEUED'
  | 'SENDING'
  | 'WAITING_RESULT'
  | 'DONE'
  | 'FAILED'

export interface CardCommand {
  action: CardCommandAction
  uid: string
  blok?: string
  no_rumah?: string
}

export interface GateCommandResult {
  action?: CardCommandAction
  uid?: string
  status?: string
  tgl_kirim?: string
  tgl_eksekusi?: string
  pesan?: string
}
```

## 10. Alur Trigger

### 10.1 Menambah Kartu

Pada `submitManual()` dan `submitUpload()`:

1. Simpan kartu ke Supabase.
2. Jika kartu langsung dipasangkan dan memiliki data gate yang lengkap, enqueue `ADD`.
3. Jika kartu belum dipasangkan, tampilkan status **Belum Dikirim**.
4. Pengguna dapat mengirim command manual dari halaman Kartu.

### 10.2 Pairing Kartu

Pada `assignCard()`:

1. Update `resident_id` kartu di Supabase.
2. Set status kartu menjadi `Aktif`.
3. Enqueue `ADD` dengan UID, blok, dan no rumah kartu.
4. Tampilkan status **Antre** atau **Menunggu Reader**.
5. Jika enqueue gagal, tampilkan error tetapi biarkan pairing tetap tersimpan.

### 10.3 Unpairing Kartu

Pada `unassignCard()`:

1. Enqueue `DELETE` sebelum atau bersamaan dengan perubahan status lokal.
2. Update `resident_id` menjadi `null`.
3. Jika DELETE gagal, tampilkan status **Gagal** dan sediakan tombol ulangi.

### 10.4 Edit Blok atau No Rumah

Pada `submitEdit()` di `CardsView.vue`:

1. Bandingkan nilai lama dan baru.
2. Jika tidak ada perubahan, jangan kirim command.
3. Jika kartu dipasangkan, enqueue `UPDATE`.
4. Jika kartu tidak dipasangkan, cukup simpan data lokal.

### 10.5 Hapus Kartu

Pada `confirmDelete()` di `CardsView.vue`:

1. Ambil data kartu sebelum dihapus.
2. Enqueue `DELETE`.
3. Hapus kartu dari Supabase setelah command berhasil tercatat.
4. Jika command gagal, tampilkan peringatan bahwa kartu mungkin masih terdaftar di gate.

### 10.6 Hapus Penghuni

Pada `confirmDelete()` di `ResidentsView.vue`:

1. Ambil seluruh kartu dengan `resident_id` penghuni tersebut.
2. Enqueue `DELETE` untuk setiap kartu.
3. Set `resident_id = null` pada kartu-kartu tersebut.
4. Hapus penghuni.
5. Tampilkan jumlah command yang berhasil dan gagal.

Perhatikan relasi foreign key saat ini pada `supabase/schema.sql:15-23`. Jika tidak menggunakan `ON DELETE SET NULL`, langkah pelepasan kartu harus dilakukan sebelum penghuni dihapus.

## 11. UI Halaman Sinkronisasi Gate

### 11.1 Statistik

Tampilkan empat ringkasan:

- Antre
- Menunggu Reader
- Selesai
- Gagal

### 11.2 Form Manual

Field:

- Aksi: ADD, UPDATE, DELETE
- UID
- Blok
- No Rumah
- Tombol **Kirim Command**

Form manual digunakan untuk recovery dan pengujian.

### 11.3 Tabel Riwayat

Kolom:

- Waktu dibuat
- UID
- Aksi
- Blok
- No Rumah
- Status
- Waktu dikirim
- Waktu eksekusi
- Pesan
- Aksi

Aksi yang tersedia:

- **Detail**
- **Ulangi** untuk command `FAILED`

### 11.4 Detail Command

Tampilkan:

- Payload command.
- Response command.
- Feedback reader.
- Jumlah percobaan.
- Error terakhir.
- Waktu pengiriman dan eksekusi.

Jangan menampilkan access token atau credential apa pun.

## 12. Polling Feedback

Implementasi polling:

- Interval default: 2 detik.
- Timeout: 60–120 detik.
- Hentikan polling jika:
  - status `DONE`,
  - status `FAILED`,
  - component di-unmount,
  - batas percobaan tercapai.
- Gunakan satu timer per command.
- Cegah polling overlap.
- Jika feedback belum tersedia, tampilkan **Menunggu Reader**.
- Jika response berupa array, pilih data yang cocok dengan `action` dan `uid`.
- Jika tidak ada feedback setelah timeout, biarkan status `WAITING_RESULT` dan izinkan retry.

## 13. Error Handling

Kasus yang harus ditangani:

- API gate tidak dapat dijangkau.
- HTTP response bukan 2xx.
- Response tidak valid atau bukan JSON.
- API mengembalikan `success: false`.
- Feedback belum tersedia.
- Timeout reader.
- Command duplikat.
- Browser ditutup saat command berjalan.
- Refresh halaman saat polling berlangsung.
- Database lokal berhasil, tetapi gate gagal.

Pesan error harus membedakan:

- Gagal menyimpan data lokal.
- Data lokal tersimpan, tetapi command gagal.
- Command tercatat, tetapi feedback belum tersedia.
- Command gagal setelah percobaan berulang.

## 14. Keamanan

- Frontend tidak memanggil endpoint eksternal secara langsung.
- Frontend hanya memanggil Supabase Edge Function.
- Edge Function menggunakan `verify_jwt = true`.
- Validasi enum action hanya mengizinkan `ADD`, `UPDATE`, dan `DELETE`.
- Validasi UID, panjang field, dan tipe data.
- Gunakan RLS pada tabel `gate_commands`.
- Service role hanya digunakan di Edge Function.
- Jangan menyimpan token pada database, log, atau UI.
- Tambahkan konfirmasi untuk DELETE dan bulk command.
- Gunakan idempotency atau locking untuk mencegah command ganda.

## 15. Tahapan Implementasi

### Tahap 1 — Kontrak API

- [ ] Konfirmasi method request `command-result.php`.
- [ ] Konfirmasi body atau parameter yang diperlukan untuk mengambil feedback.
- [ ] Konfirmasi apakah response feedback bersifat global atau per UID.
- [ ] Konfirmasi apakah `DELETE` wajib menyertakan `blok` dan `no_rumah`.
- [ ] Uji endpoint dengan UID percobaan, bukan UID produksi.

### Tahap 2 — Database

- [ ] Buat migration `gate_commands`.
- [ ] Tambahkan index dan constraint yang diperlukan.
- [ ] Tambahkan policy RLS.
- [ ] Sinkronkan `supabase/schema.sql` dengan migration terbaru.

### Tahap 3 — Edge Function

- [ ] Buat `supabase/functions/card-command/index.ts`.
- [ ] Buat `supabase/functions/command-result/index.ts`.
- [ ] Tambahkan konfigurasi pada `supabase/config.toml`.
- [ ] Tambahkan environment variable.
- [ ] Deploy kedua Edge Function.

### Tahap 4 — Frontend Core

- [ ] Tambahkan type pada `src/types.ts`.
- [ ] Buat `src/lib/gate-command.ts`.
- [ ] Buat helper payload dan validasi.
- [ ] Buat helper pengiriman command.
- [ ] Buat helper polling dan cleanup timer.

### Tahap 5 — UI

- [ ] Buat `src/views/GateSyncView.vue`.
- [ ] Tambahkan route `/gate-sync`.
- [ ] Tambahkan menu **Sinkronisasi Gate** pada `src/App.vue`.
- [ ] Tambahkan status gate pada `CardsView.vue`.
- [ ] Tambahkan aksi kirim command pada tabel kartu.
- [ ] Tambahkan tampilan mobile untuk status dan riwayat.

### Tahap 6 — Trigger

- [ ] Integrasikan `ADD` pada pairing.
- [ ] Integrasikan `DELETE` pada unpairing.
- [ ] Integrasikan `UPDATE` pada edit blok/no rumah.
- [ ] Integrasikan `DELETE` pada hapus kartu.
- [ ] Integrasikan `DELETE` pada hapus penghuni.
- [ ] Pastikan import dari `card-list.php` tidak memicu command.

### Tahap 7 — Reliability

- [ ] Tambahkan retry.
- [ ] Tambahkan timeout.
- [ ] Tambahkan concurrency control.
- [ ] Tambahkan persistence status.
- [ ] Tambahkan detail response untuk audit.
- [ ] Tambahkan konfirmasi untuk aksi destruktif.

### Tahap 8 — Validasi dan Deployment

- [ ] Jalankan `npm run typecheck`.
- [ ] Jalankan `npm run build`.
- [ ] Uji alur ADD, UPDATE, dan DELETE.
- [ ] Uji feedback `DONE` dan `FAILED`.
- [ ] Uji refresh halaman saat command berjalan.
- [ ] Uji browser ditutup saat command berjalan.
- [ ] Uji tampilan mobile.
- [ ] Deploy melalui workflow `.github/workflows/deploy.yml`.

## 16. Skenario Pengujian

### ADD

1. Pilih kartu yang belum dipasangkan.
2. Pasangkan kartu ke penghuni.
3. Pastikan command `ADD` tercatat.
4. Pastikan payload mengandung `uid`, `blok`, dan `no_rumah`.
5. Pastikan feedback berubah menjadi `DONE`.
6. Pastikan riwayat menampilkan waktu dan pesan dari gate.

### UPDATE

1. Edit blok atau no rumah kartu yang sudah dipasangkan.
2. Pastikan hanya perubahan lokasi yang menghasilkan `UPDATE`.
3. Pastikan perubahan label saja tidak menghasilkan command.
4. Pastikan feedback tersimpan pada riwayat.

### DELETE

1. Lepas kartu dari penghuni atau hapus kartu.
2. Pastikan command `DELETE` tercatat.
3. Pastikan data lokal tetap terhapus atau terlepas.
4. Pastikan feedback gate ditampilkan.
5. Jika gagal, pastikan tombol ulangi tersedia.

### Kegagalan dan Retry

1. Matikan akses ke API gate atau gunakan response error.
2. Pastikan status menjadi `FAILED`.
3. Pastikan data lokal tidak ikut di-rollback.
4. Klik ulangi.
5. Pastikan attempt count bertambah.
6. Pastikan status berubah menjadi `DONE` setelah berhasil.

### Ketahanan Browser

1. Kirim command.
2. Refresh halaman sebelum feedback diterima.
3. Pastikan command masih ada di antrean.
4. Buka halaman Sinkronisasi Gate.
5. Pastikan status dan feedback tetap dapat dilanjutkan.

## 17. Acceptance Criteria

Fitur diterima jika:

- ADD, UPDATE, dan DELETE mengirim payload sesuai kontrak.
- UID dikirim sebagai string.
- Blok dan no rumah dikirim sesuai data kartu.
- Feedback `DONE` ditampilkan dengan `tgl_kirim`, `tgl_eksekusi`, dan `pesan`.
- Status command dapat dilihat setelah refresh.
- Command gagal dapat diulang.
- Tidak ada command duplikat untuk UID yang sama.
- DELETE memerlukan konfirmasi.
- Browser tidak mengalami error CORS.
- Database lokal tetap tersimpan saat gate gagal.
- Tampilan berfungsi pada desktop dan mobile.
- Typecheck dan build berhasil.

## 18. Risiko dan Tindak Lanjut

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Kontrak `command-result.php` belum lengkap | Polling dapat salah | Konfirmasi method, body, dan respons sebelum coding |
| Feedback bersifat global | Command dapat tertukar | Proses satu command dalam satu waktu dan cocokkan UID/action |
| API gate sedang down | Reader tidak menerima perubahan | Gunakan antrean, retry, dan status gagal |
| Browser ditutup | Polling berhenti | Simpan command di database dan lanjutkan dari halaman sinkronisasi |
| Foreign key penghuni | Hapus penghuni dapat gagal | Lepaskan kartu sebelum menghapus penghuni atau gunakan `ON DELETE SET NULL` |
| Command duplikat | Akses kartu tidak konsisten | Gunakan locking/idempotency per UID |
| Data kartu tidak lengkap | Payload tidak valid | Validasi sebelum enqueue dan tampilkan form perbaikan |

## 19. Rekomendasi Urutan Eksekusi

1. Konfirmasi kontrak API.
2. Buat tabel antrean dan Edge Function.
3. Buat halaman Sinkronisasi Gate.
4. Integrasikan trigger dari Kartu dan Pairing.
5. Tambahkan error handling, retry, dan persistence.
6. Uji dengan UID percobaan.
7. Deploy ke production.
