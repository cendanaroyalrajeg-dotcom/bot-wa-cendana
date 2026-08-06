const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const cron = require('node-cron');
const axios = require('axios');
const pino = require('pino');
const http = require('http');

const PORT = process.env.PORT || 8080;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot WhatsApp Kas Warga Aktif!\n');
}).listen(PORT, '0.0.0.0', () => {
    console.log(`Server HTTP aktif di port ${PORT}`);
});

let clientInstance;

async function runBot() {
    console.log('Inisialisasi ulang bot...');
    const { state, saveCreds } = await useMultiFileAuthState('auth_session');
    
    clientInstance = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'silent' })
    });

    clientInstance.ev.on('creds.update', saveCreds);

    const targetNumbers = [
        '628976398855',
        '628568639957',
        '6281388323996'
    ];

    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    // FUNGSI UTAMA PENGAMBIL DATA MURNI DARI DATABASE PHP (SESUAI SCRIPT LAMA ANDA)
    async function sendReport(sockInstance, testMode = false) {
        try {
            console.log('Mengambil data terbaru dari database InfinityFree...');
            
            let response = await axios.get('http://cendanafamilybackup.rf.gd/api-ai.php', {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 10000
            });

            let reportData = response.data;

            if (!reportData || !reportData.kumulatif) {
                console.log('Format data API tidak valid:', reportData);
                return;
            }

            const formatRupiah = (val) => {
                return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(val || 0);
            };

            let title = testMode ? "📊 *[TEST MANUAL] LAPORAN KAS WARGA* 📊\n\n" : "📊 *LAPORAN KAS WARGA ROYAL RAJEG CENDANA* 📊\n🗓️ *Periode Per Tanggal 20*\n\n";

            let content = title +
                          "📌 *KONDISI KEUANGAN S/D SAAT INI:*\n" +
                          "• Total Penerimaan: " + formatRupiah(reportData.kumulatif.total_masuk_sd) + "\n" +
                          "• Total Pengeluaran: " + formatRupiah(reportData.kumulatif.total_keluar_sd) + "\n" +
                          "• *Total Sisa Uang Kas:* " + formatRupiah(reportData.kumulatif.sisa_kas_sd) + "\n\n" +
                          "📈 *MUTASI BULAN INI:*\n" +
                          "• Masuk Bulan Ini: " + formatRupiah(reportData.bulan_ini.masuk_bulan_ini) + "\n" +
                          "• Keluar Bulan Ini: " + formatRupiah(reportData.bulan_ini.keluar_bulan_ini) + "\n" +
                          "• *Mutasi Saldo Bulan Ini:* " + formatRupiah(reportData.bulan_ini.mutasi_bulan_ini) + "\n\n" +
                          "Terima kasih. 🙏";

            // Mengirim ke SEMUA nomor target secara berurutan menggunakan jeda
            for (let num of targetNumbers) {
                try {
                    let recipientJid = num + '@s.whatsapp.net';
                    await sockInstance.sendMessage(recipientJid, { text: content });
                    console.log('Berhasil mengirim laporan ke nomor: ' + num);
                } catch (errNum) {
                    console.log(`Gagal mengirim ke nomor ${num}:`, errNum.message);
                }
                await delay(4000); // Jeda 4 detik agar aman ke setiap nomor
            }
        } catch (err) {
            console.log('Gagal mengambil/mengirim laporan:', err.message);
        }
    }

    // Cron job otomatis setiap tanggal 20 jam 08:00 Pagi
    cron.schedule('0 8 20 * *', async () => {
        console.log('Menjalankan cron job tanggal 20...');
        if (clientInstance) await sendReport(clientInstance, false);
    });

    // --- FITUR RESPON CHAT REAL-TIME DARI DATABASE ---
    clientInstance.ev.on('messages.upsert', async (m) => {
        let pesanMasuk = m.messages[0];
        if (!pesanMasuk.message || pesanMasuk.key.fromMe) return;

        let senderJid = pesanMasuk.key.remoteJid;
        let textPesan = pesanMasuk.message.conversation || pesanMasuk.message.extendedTextMessage?.text;

        if (!textPesan) return;
        let keyword = textPesan.toLowerCase().trim();

        if (keyword === 'sisa kas' || keyword === 'saldo' || keyword === 'laporan') {
            try {
                console.log(`Warga (${senderJid}) meminta info real-time: ${keyword}`);
                
                let response = await axios.get('http://cendanafamilybackup.rf.gd/api-ai.php', {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 8000
                });
                let data = response.data;

                const formatRupiah = (val) => {
                    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(val || 0);
                };

                let replyText = `🤖 *INFORMASI KAS WARGA (REAL-TIME)*\n\n` +
                                `• Total Sisa Uang Kas: *${formatRupiah(data.kumulatif.sisa_kas_sd)}*\n` +
                                `• Masuk Bulan Ini: ${formatRupiah(data.bulan_ini.masuk_bulan_ini)}\n` +
                                `• Keluar Bulan Ini: ${formatRupiah(data.bulan_ini.keluar_bulan_ini)}\n\n` +
                                `Data diambil langsung dari database. 🙏`;

                await clientInstance.sendMessage(senderJid, { text: replyText });
            } catch (err) {
                await clientInstance.sendMessage(senderJid, { text: "Maaf, saat ini gagal mengambil data dari database." });
            }
        }
    });

    clientInstance.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('--- SALIN KODE QR DI BAWAH INI ---');
            console.log(qr);
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log('Menghubungkan ulang...');
                setTimeout(runBot, 3000);
            }
        } else if (connection === 'open') {
            console.log('Koneksi WhatsApp Terbuka dan Siap!');

            setTimeout(async () => {
                console.log('Mengeksekusi pengiriman pesan tes manual dari database...');
                await sendReport(clientInstance, true);
            }, 5000);
        }
    });
}

runBot();
