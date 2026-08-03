const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const cron = require('node-cron');
const pino = require('pino');
const http = require('http');

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

    const daftarNomorTujuan = [
        '628976398855',
        '628568639957',
        '6281388323996'
    ];

    async function kirimLaporanWhatsApp(sockClient, isTest = false) {
        try {
            console.log('Menyiapkan data laporan keuangan...');
            
            // Data keuangan langsung dari database terakhir Anda
            let data = {
                "kumulatif": {
                    "total_masuk_sd": 6300000,
                    "total_keluar_sd": 4538500,
                    "sisa_kas_sd": 1761500
                },
                "bulan_ini": {
                    "masuk_bulan_ini": 40000,
                    "keluar_bulan_ini": 100000,
                    "mutasi_bulan_ini": -60000
                }
            };

            let formatRupiah = (angka) => {
                return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(angka || 0);
            };

            let headerPesan = isTest ? "📊 *[TEST MANUAL] LAPORAN KAS WARGA* 📊\n\n" : "📊 *LAPORAN KAS WARGA ROYAL RAJEG CENDANA* 📊\n🗓️ *Periode Per Tanggal 20*\n\n";

            let pesanLaporan = headerPesan +
                               "📌 *KONDISI KEUANGAN S/D SAAT INI:*\n" +
                               "• Total Penerimaan: " + formatRupiah(data.kumulatif.total_masuk_sd) + "\n" +
                               "• Total Pengeluaran: " + formatRupiah(data.kumulatif.total_keluar_sd) + "\n" +
                               "• *Total Sisa Uang Kas:* " + formatRupiah(data.kumulatif.sisa_kas_sd) + "\n\n" +
                               "📈 *MUTASI BULAN INI:*\n" +
                               "• Masuk Bulan Ini: " + formatRupiah(data.bulan_ini.masuk_bulan_ini) + "\n" +
                               "• Keluar Bulan Ini: " + formatRupiah(data.bulan_ini.keluar_bulan_ini) + "\n" +
                               "• *Mutasi Saldo Bulan Ini:* " + formatRupiah(data.bulan_ini.mutasi_bulan_ini) + "\n\n" +
                               "Terima kasih. 🙏";

            for (let nomor of daftarNomorTujuan) {
                let jid = nomor + '@s.whatsapp.net';
                await sockClient.sendMessage(jid, { text: pesanLaporan });
                console.log('Pesan berhasil dikirim ke ' + nomor);
            }
        } catch (error) {
            console.log('Gagal mengirim data laporan:', error.message);
        }
    }

    cron.schedule('0 8 20 * *', async () => {
        console.log('Menjalankan pengiriman laporan kas tanggal 20...');
        await kirimLaporanWhatsApp(sock, false);
    });

    sock.ev.on('connection.update', async (update) => {
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

            setTimeout(async () => {
                console.log('Memulai tes kirim manual ke semua nomor...');
                await kirimLaporanWhatsApp(sock, true);
            }, 5000);
        }
    });
}

mulaiBot();
