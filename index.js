const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const cron = require('node-cron');
const axios = require('axios');
const pino = require('pino');
const http = require('http');

// Membuat Web Server kecil agar Railway menganggap aplikasi aktif (mencegah SIGTERM)
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot WhatsApp Kas Warga Aktif!\n');
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server HTTP berjalan di port ${PORT}`);
});

async function mulaiBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_session');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);

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

            let nomorTujuan = '628xxxxxxxxxx@s.whatsapp.net'; // Ganti nomor WhatsApp tujuan Anda
            await sock.sendMessage(nomorTujuan, { text: pesanLaporan });
            console.log('Laporan kas tanggal 20 berhasil dikirim!');

        } catch (error) {
            console.log('Gagal mengirim laporan otomatis:', error);
        }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) mulaiBot();
        } else if (connection === 'open') {
            console.log('Bot WhatsApp Berhasil Terhubung dan Siap!');
        }
    });
}

mulaiBot();
