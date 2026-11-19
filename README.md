# CLANCY GENERATOR — Personal Seedance Studio

Versi baru, tanpa database dan tanpa SQL.

## Fitur
- Studio pribadi tanpa halaman login atau kode akses.
- RelayRouter API key hanya berada di environment server.
- Seedance 2.0, 2.0 Fast, 2.0 Mini, dan 2.5.
- Prompt, referensi gambar, durasi, rasio, resolusi, audio, dan watermark.
- Status tugas dan pemutar video hasil.

## Vercel Environment Variables
- `RELAYROUTER_API_KEY`: API key RelayRouter dari console.

Tidak perlu Supabase, SQL, wallet, atau payment gateway. Hapus environment variables Supabase lama dari project Vercel jika sudah tidak dipakai.

## Deploy
Hubungkan repository ini ke Vercel dan deploy branch `main`.

## Catatan
Aplikasi tidak menyimpan riwayat task di database. ID task disimpan selama sesi halaman terbuka. Model ID dan jalur API mengikuti konfigurasi RelayRouter yang digunakan; dukungan aktual tetap bergantung pada model yang diaktifkan pada akun API.
