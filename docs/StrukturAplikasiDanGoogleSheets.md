# Struktur FocusFlow dan alur Google Sheets

Dokumen ini menjelaskan struktur **kode yang ada saat ini**, file mana yang saling terhubung, dan cara kerja sinkronisasi Google Sheets.

## Gambaran arsitektur

```text
Pengguna
  │
  ▼
React UI (app/src/App.tsx) ── menyimpan data lokal ──► browser/Tauri localStorage
  │
  └── POST webhook (bila URL .env tersedia) ────────► Google Apps Script
                                                        │
                                                        ▼
                                                   Google Spreadsheet
                                                   ├─ Daily Tasks
                                                   ├─ Insights
                                                   └─ Insight Chart

Tauri membungkus React/Vite menjadi aplikasi desktop/mobile.
```

`localStorage` adalah sumber data utama aplikasi. Spreadsheet hanya menerima salinan data dari aplikasi (sinkronisasi satu arah), bukan sumber data yang dibaca kembali saat aplikasi dibuka.

## Struktur folder dan file terkait

| Lokasi | Peran | Terkait dengan |
| --- | --- | --- |
| `app/src/main.tsx` | Titik masuk React. Me-render komponen `App`. | `app/src/App.tsx` |
| `app/src/App.tsx` | Seluruh logika UI: task, kalender, insight, timer, tema, `localStorage`, dan request ke Google Sheets. | `App.css`, `.env`, `GoogleSheetsSync.gs` |
| `app/src/App.css` | Tampilan/layout semua halaman yang dibuat oleh `App.tsx`. | `App.tsx` |
| `app/index.html` | Halaman HTML dasar dengan elemen `#root` untuk React. | `main.tsx` |
| `app/vite.config.ts` | Konfigurasi Vite saat development/build. | `package.json` |
| `app/package.json` | Perintah `npm run dev`, `npm run build`, dan `npm run tauri`; daftar dependensi React, Vite, dan Tauri. | seluruh folder `app` |
| `app/.env` *(dibuat lokal, tidak ada di Git)* | Menyimpan `VITE_GOOGLE_SHEETS_WEB_APP_URL`, URL webhook Apps Script. | `App.tsx` |
| `docs/GoogleSheetsSync.gs` | Kode Google Apps Script yang menerima data dan menulisnya ke Spreadsheet. | Spreadsheet dan `App.tsx` |
| `docs/GoogleSheetsSetup.md` | Panduan deployment Apps Script dan pengisian `.env`. | `GoogleSheetsSync.gs` |
| `app/src-tauri/tauri.conf.json` | Konfigurasi packaging Tauri: nama aplikasi, jendela, dan lokasi hasil build. | Vite dan Rust/Tauri |
| `app/src-tauri/src/main.rs` | Entry point native Tauri. | `lib.rs` |
| `app/src-tauri/src/lib.rs` | Menjalankan Tauri serta plugin pembuka tautan. | `Cargo.toml` |
| `app/src-tauri/Cargo.toml` | Dependensi Rust untuk Tauri. | file Rust di `src-tauri` |
| `app/src-tauri/gen/android/` | Berkas Android yang dihasilkan Tauri. Umumnya tidak diedit untuk logika aplikasi sehari-hari. | konfigurasi Tauri |

## Alur kerja aplikasi

### 1. Aplikasi dimulai

1. `index.html` menyediakan `<div id="root">`.
2. `main.tsx` memasang React ke elemen tersebut dan memanggil `App`.
3. `App.tsx` mengambil daftar task dari `localStorage` dengan key `focusflow-tasks`.
4. Jika belum ada data atau data rusak, daftar awal adalah kosong.

### 2. Pengelolaan task

Task memakai bentuk data berikut:

```ts
{
  id: number,
  title: string,
  category: string,
  due: string,
  priority: "High" | "Medium" | "Low",
  done: boolean,
  date: "YYYY-MM-DD",
  createdAt?: string,
  completedAt?: string
}
```

- Form **New task** membuat task baru dengan `id` dari `Date.now()`.
- Tombol centang mengubah `done`, lalu mengisi atau menghapus `completedAt`.
- Tombol delete menghapus task dari state dan `localStorage`.
- Kalender menampilkan task berdasarkan `date`.
- Overview dan Insights menghitung progres hanya dari task pada tanggal Jakarta saat ini.

Setiap perubahan `tasks` menjalankan efek React yang melakukan dua hal: menyimpan seluruh daftar ke `localStorage`, lalu mengirim snapshot task ke Google Sheets jika webhook sudah dikonfigurasi.

### 3. Timer, insight, dan streak

- Timer Focus/Short Break/Long Break berjalan di memori halaman. Saat Focus aktif, `focusSeconds` bertambah setiap detik.
- Saat membuat task, user dapat memasukkan waktu pengingat. Browser akan meminta izin notifikasi dan mengingatkan pada waktu tersebut selama aplikasi masih terbuka.
- Insight menghitung total dan task selesai dari state task, bukan dari spreadsheet.
- Streak menggunakan key `focusflow-activity` di `localStorage`; aplikasi menambahkan tanggal saat aplikasi dibuka.
- Timer dan streak belum disimpan permanen sebagai sesi detail. `focusSeconds` juga kembali ke `0` ketika aplikasi/browser dimuat ulang.

## Cara kerja Google Sheets

### Konfigurasi

1. Buka spreadsheet tujuan, pilih **Extensions → Apps Script**.
2. Salin isi `docs/GoogleSheetsSync.gs` ke editor Apps Script dan simpan.
3. Deploy sebagai **Web app** dan salin URL deployment yang berakhiran `/exec`.
4. Buat `app/.env` berisi:

```env
VITE_GOOGLE_SHEETS_WEB_APP_URL=https://script.google.com/macros/s/.../exec
```

5. Restart Vite/Tauri setelah mengubah `.env`.

Script sebaiknya dibuat dari menu Apps Script milik spreadsheet tujuan agar `SpreadsheetApp.getActiveSpreadsheet()` mengarah ke spreadsheet tersebut.

### Data yang dikirim aplikasi

Fungsi `syncGoogleSheets()` di `App.tsx` mengirim `POST` dengan format form URL-encoded. Field `payload` berisi JSON seperti ini:

```json
{
  "tasks": ["seluruh daftar task saat ini"],
  "insight": {
    "date": "2026-08-12",
    "totalTasks": 3,
    "completedTasks": 1,
    "completionRate": 33,
    "focusSeconds": 120,
    "syncedAt": "2026-08-12T...Z"
  }
}
```

Pengiriman memakai `mode: "no-cors"`. Ini memudahkan request lintas domain ke Apps Script, tetapi browser tidak dapat membaca respons atau memberi tahu aplikasi bila server menolak/gagal memproses request.

### Pemrosesan di Apps Script

`doPost(event)` di `GoogleSheetsSync.gs` melakukan langkah berikut:

1. Membaca `event.parameter.payload` dan mengubahnya dari JSON.
2. Memastikan sheet `Daily Tasks` dan `Insights` ada. Jika belum ada, script membuat sheet serta baris header.
3. Menulis ulang snapshot `Daily Tasks`, sehingga task baru maupun task dengan tanggal masa depan masuk ke spreadsheet dan task yang dihapus dari aplikasi juga ikut hilang dari sheet.
4. Menjalankan `upsertInsight_()` berdasarkan kolom `Date`: satu baris insight per tanggal akan diperbarui, bukan diduplikasi.
5. Membuat/menyegarkan sheet `Insight Chart` dan grafik kolom dari data `Insights`.

### Isi setiap sheet

| Sheet | Kolom | Kegunaan |
| --- | --- | --- |
| `Daily Tasks` | Task ID, Date, Title, Category, Priority, Status, Reminder time, Created at, Completed at, Last synced | Snapshot task yang tersimpan saat ini. |
| `Insights` | Date, Total tasks, Completed tasks, Completion rate, Focus seconds, Last synced | Ringkasan produktivitas harian. |
| `Insight Chart` | Judul dan grafik kolom | Visualisasi completion rate berdasarkan data `Insights`. |

## Batasan penting implementasi saat ini

- Sinkronisasi **satu arah**: mengubah spreadsheet tidak akan mengubah task di aplikasi.
- Spreadsheet disinkronkan ketika `tasks` berubah. Perubahan `focusSeconds` dari timer saja tidak memicu request baru, sehingga nilai Focus seconds di spreadsheet biasanya merupakan nilai ketika task terakhir diubah.
- Pengingat browser hanya dapat dijadwalkan secara andal saat aplikasi terbuka; untuk notifikasi saat aplikasi benar-benar tertutup diperlukan notifikasi native/background service.
- Bila pengguna mulai memakai perangkat/browser lain, kedua `localStorage` berbeda. Spreadsheet tidak menyatukan atau mengunduh data kembali.
- URL spreadsheet di halaman Settings ditulis langsung (hard-coded) di `App.tsx`, sedangkan URL webhook dibaca dari `.env`. Keduanya dapat mengarah ke spreadsheet yang berbeda bila tidak dikonfigurasi konsisten.
- Karena `no-cors`, kegagalan webhook tidak terlihat di UI.

## Lokasi paling relevan bila ingin mengubah fitur

- Ubah perilaku UI, task, timer, dan payload sync: `app/src/App.tsx`.
- Ubah gaya visual: `app/src/App.css`.
- Ubah kolom/aturan penyimpanan spreadsheet dan grafik: `docs/GoogleSheetsSync.gs`.
- Ubah target/izin deployment: Apps Script deployment dan `app/.env`.
- Ubah packaging aplikasi desktop/mobile: `app/src-tauri/`.
