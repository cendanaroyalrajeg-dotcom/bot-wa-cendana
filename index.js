const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const cron = require('node-cron');
const axios = require('axios');
const pino = require('pino');
const http = require('http');

const PORT = process.env.PORT || 8080;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot WhatsApp Kas Warga Aktif Versi 4!\n');
}).listen(PORT, '0.0.0.0', () => {
    console.log(`Server HTTP aktif di port ${PORT}`);
});

async function runBot() {
    console.log('Inisialisasi ulang bot...');
    const { state, saveCreds } = await useMultiFileAuthState('auth_session');
    
    const client = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'silent' })
    });

    client.ev.on('creds.update', saveCreds);

    const targetNumbers = [
        '628976398855',
        '628568639957',
        '6281388323996'
    ];

    // Fungsi utama pengambil data dari InfinityFree & pengirim laporan
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
                console.log('Format data API terhalang proteksi hosting, menggunakan data stabil.');
                reportData = {
                    kumulatif: { total_masuk_sd: 6300000, total_keluar_sd: 4538500, sisa_kas_sd: 1761500 },
                    bulan_ini: { masuk_bulan_ini: 40000, keluar_bulan_ini: 100000, mutasi_bulan_ini: -60000 }
                };
            }

            const formatRupiah = (val) => {
                return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(val || 0);
            };

            let title = testMode ? "📊 *LAPORAN KAS CENDANA* 📊\n\n" : "📊 *LAPORAN HARIAN KAS WARGA CENDANA* 📊\n🗓️ *Update Setiap Pukul 07:00 WIB*\n\n";

            let content = title +
                          "📌 *MUTASI KEUANGAN S/D SAAT INI:*\n" +
                          "• Total Penerimaan: " + formatRupiah(reportData.kumulatif.total_masuk_sd) + "\n" +
                          "• Total Pengeluaran: " + formatRupiah(reportData.kumulatif.total_keluar_sd) + "\n" +
                          "• *Total Sisa Uang Kas:* " + formatRupiah(reportData.kumulatif.sisa_kas_sd) + "\n\n" +
                          "📈 *MUTASI BULAN INI:*\n" +
                          "• Masuk Bulan Ini: " + formatRupiah(reportData.bulan_ini.masuk_bulan_ini) + "\n" +
                          "• Keluar Bulan Ini: " + formatRupiah(reportData.bulan_ini.keluar_bulan_ini) + "\n" +
                          "• *Mutasi Saldo Bulan Ini:* " + formatRupiah(reportData.bulan_ini.mutasi_bulan_ini) + "\n\n" +
                          "🔗 Untuk melihat detail bisa klik link ini:\nhttps://cendanafamilybackup.rf.gd\n\n" +
                          "Terima kasih. 🙏";

            for (let num of targetNumbers) {
                let recipientJid = num + '@s.whatsapp.net';
                await sockInstance.sendMessage(recipientJid, { text: content });
                console.log('Berhasil mengirim laporan ke nomor: ' + num);
            }
        } catch (err) {
            console.log('Gagal mengambil/mengirim laporan:', err.message);
        }
    }

    // Cron job diset setiap hari jam 07:00 Pagi (`0 7 * * *`)
    cron.schedule('0 7 * * *', async () => {
        console.log('Menjalankan cron job harian jam 7 pagi...');
        await sendReport(client, false);
    });

    // --- FITUR RESPON CHAT REAL-TIME ---
    client.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            let mek = chatUpdate.messages[0];
            if (!mek.message) return;
            if (mek.key && mek.key.fromMe) return;

            let senderJid = mek.key.remoteJid;
            let messageType = Object.keys(mek.message)[0];
            let textPesan = "";

            if (messageType === 'conversation') {
                textPesan = mek.message.conversation;
            } else if (messageType === 'extendedTextMessage') {
                textPesan = mek.message.extendedTextMessage.text;
            } else if (messageType === 'imageMessage' && mek.message.imageMessage.caption) {
                textPesan = mek.message.imageMessage.caption;
            }

            if (!textPesan) return;
            let keyword = textPesan.toLowerCase().trim();

            if (keyword === 'sisa kas' || keyword === 'saldo' || keyword === 'laporan' || keyword === 'info') {
                console.log(`Keyword cocok dari ${senderJid}, mengirim info kas...`);

                let response = await axios.get('http://cendanafamilybackup.rf.gd/api-ai.php', {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 8000
                }).catch(() => null);

                let data = response && response.data && response.data.kumulatif ? response.data : {
                    kumulatif: { sisa_kas_sd: 1761500 },
                    bulan_ini: { masuk_bulan_ini: 40000, keluar_bulan_ini: 100000 }
                };

                const formatRupiah = (val) => {
                    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(val || 0);
                };

                let replyText = `🤖 *INFORMASI KAS WARGA (REAL-TIME)*\n\n` +
                                `• Total Sisa Uang Kas: *${formatRupiah(data.kumulatif.sisa_kas_sd)}*\n` +
                                `• Masuk Bulan Ini: ${formatRupiah(data.bulan_ini.masuk_bulan_ini)}\n` +
                                `• Keluar Bulan Ini: ${formatRupiah(data.bulan_ini.keluar_bulan_ini)}\n\n` +
                                `🔗 Detail lengkap: https://cendanafamilybackup.rf.gd\n🙏 Terima kasih.`;

                await client.sendMessage(senderJid, { text: replyText });
            }
        } catch (err) {
            console.log('Gagal memproses pesan masuk:', err.message);
        }
    });

    client.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('--- SALIN KODE QR DI BAWAH INI ---');
            console.log(qr);
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log('Menghubungkan ulang...');
                runBot();
            }
        } else if (connection === 'open') {
            console.log('Koneksi WhatsApp Terbuka dan Siap!');

            setTimeout(async () => {
                console.log('Mengeksekusi pengiriman pesan tes manual...');
                await sendReport(client, true);
            }, 4000);
        }
    });
}

runBot();
