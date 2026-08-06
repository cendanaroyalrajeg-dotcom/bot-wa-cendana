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

    // Fungsi pengambil data murni dari database PHP Anda
    async function fetchDatabaseData() {
        try {
            console.log('Mengambil data dari database PHP...');
            let response = await axios.get('http://cendanafamilybackup.rf.gd/api-ai.php', {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/json'
                },
                timeout: 10000
            });

            return response.data;
        } catch (err) {
            console.log('Gagal ambil data:', err.message);
            return null;
        }
    }

    // Fungsi utama pengirim laporan ke semua nomor
    async function sendReport(sockInstance, testMode = false) {
        try {
            let reportData = await fetchDatabaseData();

            // Jika gagal karena terblokir hosting, berikan log peringatan yang jelas
            if (!reportData || !reportData.kumulatif) {
                console.log('GAGAL: Server InfinityFree memblokir akses database!');
                return;
            }

            const formatRupiah = (val) => {
                return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(val || 0);
            };

            let title = testMode ? "📊 *[TEST MANUAL] LAPORAN KAS WARGA* 📊\n\n" : "📊 *LAPORAN KAS WARGA ROYAL RAJEG CENDANA* 📊\n🗓️ *Periode Per Tanggal 20*\n\n";

            let content = title +
                          "📌 *KONDISI KEUANGAN S/D SAAT INI (DATABASE):*\n" +
                          "• Total Penerimaan: " + formatRupiah(reportData.kumulatif.total_masuk_sd) + "\n" +
                          "• Total Pengeluaran: " + formatRupiah(reportData.kumulatif.total_keluar_sd) + "\n" +
                          "• *Total Sisa Uang Kas:* " + formatRupiah(reportData.kumulatif.sisa_kas_sd) + "\n\n" +
                          "📈 *MUTASI BULAN INI:*\n" +
                          "• Masuk Bulan Ini: " + formatRupiah(reportData.bulan_ini.masuk_bulan_ini) + "\n" +
                          "• Keluar Bulan Ini: " + formatRupiah(reportData.bulan_ini.keluar_bulan_ini) + "\n" +
                          "• *Mutasi Saldo Bulan Ini:* " + formatRupiah(reportData.bulan_ini.mutasi_bulan_ini) + "\n\n" +
                          "🔗 Untuk melihat detail lengkap, silakan kunjungi:\nhttps://cendanafamilybackup.rf.gd\n\n" +
                          "Terima kasih. 🙏";

            // Mengirim secara berurutan ke SEMUA nomor target tanpa terhenti
            for (let num of targetNumbers) {
                try {
                    let recipientJid = num.trim() + '@s.whatsapp.net';
                    await sockInstance.sendMessage(recipientJid, { text: content });
                    console.log('Berhasil mengirim laporan ke nomor: ' + num);
                } catch (errNum) {
                    console.log(`Gagal kirim ke ${num}:`, errNum.message);
                }
                await delay(4000); // Jeda 4 detik antar nomor
            }
        } catch (err) {
            console.log('Gagal menjalankan sendReport:', err.message);
        }
    }

    // Cron job otomatis setiap tanggal 20 jam 08:00 Pagi
    cron.schedule('0 8 20 * *', async () => {
        console.log('Menjalankan cron job tanggal 20...');
        if (clientInstance) await sendReport(clientInstance, false);
    }, {
        timezone: "Asia/Jakarta"
    });

    // Fitur pesan masuk real-time
    clientInstance.ev.on('messages.upsert', async (m) => {
        let pesanMasuk = m.messages[0];
        if (!pesanMasuk.message || pesanMasuk.key.fromMe) return;

        let senderJid = pesanMasuk.key.remoteJid;
        let textPesan = pesanMasuk.message.conversation || pesanMasuk.message.extendedTextMessage?.text;

        if (!textPesan) return;
        let keyword = textPesan.toLowerCase().trim();

        if (keyword === 'sisa kas' || keyword === 'saldo' || keyword === 'laporan' || keyword === 'info') {
            try {
                let data = await fetchDatabaseData();
                if (!data || !data.kumulatif) {
                    await clientInstance.sendMessage(senderJid, { text: "Maaf, akses database sedang diblokir hosting." });
                    return;
                }

                const formatRupiah = (val) => {
                    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(val || 0);
                };

                let replyText = `🤖 *INFORMASI KAS WARGA (DARI DATABASE)*\n\n` +
                                `• Total Sisa Uang Kas: *${formatRupiah(data.kumulatif.sisa_kas_sd)}*\n` +
                                `• Masuk Bulan Ini: ${formatRupiah(data.bulan_ini.masuk_bulan_ini)}\n` +
                                `• Keluar Bulan Ini: ${formatRupiah(data.bulan_ini.keluar_bulan_ini)}\n\n` +
                                `🔗 Detail lengkap: https://cendanafamilybackup.rf.gd\n\n` +
                                `Terima kasih. 🙏`;

                await clientInstance.sendMessage(senderJid, { text: replyText });
            } catch (err) {
                await clientInstance.sendMessage(senderJid, { text: "Gagal mengambil data dari database." });
            }
        }
    });

    clientInstance.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('--- SALIN KODE QR ---');
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

            // Tes manual kirim pesan 5 detik setelah bot online ke SEMUA nomor
            setTimeout(async () => {
                console.log('Mengeksekusi pengiriman pesan tes manual dari database...');
                await sendReport(clientInstance, true);
            }, 5000);
        }
    });
}

runBot();
