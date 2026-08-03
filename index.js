const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const cron = require('node-cron');
const axios = require('axios');
const pino = require('pino');
const http = require('http');

// 1. Jalankan Web Server di port Railway (agar tidak kena SIGTERM)
const PORT = process.env.PORT || 8080;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot WhatsApp Kas Warga Aktif!\n');
}).listen(PORT, '0.0.0.0', () => {
    console.log(`Server HTTP aktif di port ${PORT}`);
});

async function mulaiBot() {
    console.log('Memulai koneksi Bot WhatsApp...');
    const { state, saveCreds } = await useMultiFileAuthState('auth_session');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);

    // Daftar Nomor Tujuan (Bisa ditambah lebih banyak di dalam kurung siku ini)
    const daftarNomorTujuan = [
        '628976398855@s.whatsapp.net',
        '6281388323996@s.whatsapp.net'
    ];

    // Penjadwal: Setiap Tanggal 20 Jam 08:00 Pagi
    cron.schedule('0 8 20 * *', async () => {
        console.log('Menjalankan pengiriman laporan kas tanggal 20...');
        try {
            let response = await axios.get('https://cendanaroyalrajeg.infinityfreeapp.com/api-ai.php');
            let data = response.data;

            let formatRupiah = (angka) => {
                return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(angka);
            };

            let pesanLaporan = `📊 *LAPORAN KAS WARGA ROYAL RAJEG CENDANA* 📊\n` +
                               `🗓️ *Periode Per Tanggal 20*\n\n` +
                               `📌 *KONDISI KEUANGAN S/D SAAT INI:*\n` +
                               `• Total Penerimaan: ${formatRupiah(data.kumulatif.total_masuk_sd)}\n` +
                               `• Total Pengeluaran: ${formatRupiah(data.kumulatif.total_keluar_sd)}\n` +
                               `• *Total Sisa Uang Kas:* ${formatRupiah(data.kumulatif.sisa_kas_sd)}\n\n` +
                               `📈 *MUTASI BULAN INI:*\n` +
                               `• Masuk Bulan Ini: ${formatRupiah(data.bulan_ini.masuk_bulan_ini)}\n` +
                               `• Keluar Bulan Ini: ${formatRupiah(data.bulan_ini.keluar_bulan_ini)}\n` +
                               `• *Mutasi Saldo Bulan Ini:* ${formatRupiah(data.bulan_ini.mutasi_bulan_ini)}\n\n` +
                               `Terima kasih. 🙏`;

            // Kirim ke semua nomor dalam daftar secara berurutan
            for (let nomor of daftarNomorTujuan) {
                await sock.sendMessage(nomor, { text: pesanLaporan });
                console.log(`Laporan kas tanggal 20 berhasil dikirim ke ${nomor}`);
            }

        } catch (error) {
            console.log('Gagal mengirim laporan otomatis:', error);
        }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('--- SALIN KODE QR DI BAWAH INI ---');
            console.log(qr);
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log('Koneksi terputus, mencoba menghubungkan ulang...');
                mulaiBot();
            }
        } else if (connection === 'open') {
            console.log('Bot WhatsApp Berhasil Terhubung dan Siap!');

            // --- TES KIRIM MANUAL KE 2 NOMOR ---
            setTimeout(async () => {
                console.log('Mengirim pesan tes manual ke kedua nomor...');
                try {
                    let response = await axios.get('https://cendanaroyalrajeg.infinityfreeapp.com/api-ai.php');
                    let data = response.data;

                    let formatRupiah = (angka) => {
                        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(angka);
                    };

                    let pesanTes = `📊 *[TEST MANUAL] LAPORAN KAS WARGA* 📊\n\n` +
                                   `• Total Sisa Uang Kas: ${formatRupiah(data.kumulatif.sisa_kas_sd)}\n` +
                                   `• Masuk Bulan Ini: ${formatRupiah(data.bulan_ini.masuk_bulan_ini)}\n` +
                                   `• Keluar Bulan Ini: ${formatRupiah(data.bulan_ini.keluar_bulan_ini)}\n\n` +
                                   `Tes kirim ke 2 nomor berhasil! 🙏`;

                    for (let nomor of daftarNomorTujuan) {
                        await sock.sendMessage(nomor, { text: pesanTes });
                        console.log(`Pesan tes berhasil dikirim ke ${nomor}`);
                    }
                } catch (err) {
                    console.log('Gagal kirim tes manual:', err);
                }
            }, 5000);
        }
    });
}

mulaiBot();
