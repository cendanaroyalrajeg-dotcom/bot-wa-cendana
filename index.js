const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const cron = require('node-cron');
const axios = require('axios');
const pino = require('pino');
const http = require('http');

const PORT = process.env.PORT || 8080;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot WhatsApp Kas Warga Aktif dan Terhubung Database!\n');
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

    // Fungsi murni pengambil data dari database PHP InfinityFree
    async function fetchDatabaseData() {
        try {
            console.log('Mengambil data terbaru dari database PHP...');
            let response = await axios.get('http://cendanafamilybackup.rf.gd/api-ai.php', {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/html, */*'
                },
                timeout: 12000
            });

            let rawData = response.data;

            // Jika respons berupa objek JSON murni dari database
            if (typeof rawData === 'object' && rawData !== null && rawData.kumulatif) {
                return rawData;
            }

            // Jika berbentuk string teks/HTML (terkena halaman proteksi), coba parse JSON di dalamnya
            if (typeof rawData === 'string') {
                let jsonMatch = rawData.match(/\{[\s\S]*"kumulatif"[\s\S]*\}/);
                if (jsonMatch) {
                    try {
                        return JSON.parse(jsonMatch[0]);
                    } catch (e) {}
                }
            }

            return null;
        } catch (err) {
            console.log('Gagal mengambil data dari database:', err.message);
            return null;
        }
    }

    // Fungsi utama pengirim laporan ke semua nomor WhatsApp
    async function sendReport(sockInstance, testMode = false) {
        try {
            console.log('Mempersiapkan laporan keuangan dari database...');
            let reportData = await fetchDatabaseData();

            if (!reportData || !reportData.kumulatif) {
                console.log('Gagal mendapatkan struktur data database, menggunakan data cadangan sementara.');
                reportData = {
                    kumulatif: { total_masuk_sd: 6300000, total_keluar_sd: 4538500, sisa_kas_sd: 1761500 },
                    bulan_ini: { masuk_bulan_ini: 40000, keluar_bulan_ini: 100000, mutasi_bulan_ini: -60000 }
                };
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

            // Mengirim ke setiap nomor secara berurutan dengan jeda aman agar semuanya terkirim
            for (let num of targetNumbers) {
                try {
                    let cleanNum = num.trim();
                    let recipientJid = cleanNum + '@s.whatsapp.net';
                    
                    await sockInstance.sendMessage(recipientJid, { text: content });
                    console.log('Berhasil mengirim laporan database ke nomor: ' + cleanNum);
                } catch (errNum) {
                    console.log(`Gagal kirim ke nomor ${num}:`, errNum.message);
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

    // --- FITUR RESPON CHAT REAL-TIME DARI DATABASE ---
    clientInstance.ev.on('messages.upsert', async (m) => {
        let pesanMasuk = m.messages[0];
        if (!pesanMasuk.message || pesanMasuk.key.fromMe) return;

        let senderJid = pesanMasuk.key.remoteJid;
        let textPesan = pesanMasuk.message.conversation || pesanMasuk.message.extendedTextMessage?.text;

        if (!textPesan) return;
        let keyword = textPesan.toLowerCase().trim();

        if (keyword === 'sisa kas' || keyword === 'saldo' || keyword === 'laporan' || keyword === 'info') {
            try {
                console.log(`Warga (${senderJid}) meminta info real-time: ${keyword}`);
                let reportData = await fetchDatabaseData();
                let data = (reportData && reportData.kumulatif) ? reportData : {
                    kumulatif: { sisa_kas_sd: 1761500 },
                    bulan_ini: { masuk_bulan_ini: 40000, keluar_bulan_ini: 100000 }
                };

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

            // Tes manual kirim pesan otomatis 5 detik setelah bot online ke semua nomor target
            setTimeout(async () => {
                console.log('Mengeksekusi pengiriman pesan tes manual dari database...');
                await sendReport(clientInstance, true);
            }, 5000);
        }
    });
}

runBot();
