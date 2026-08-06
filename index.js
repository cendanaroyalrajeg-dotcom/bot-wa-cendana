const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const cron = require('node-cron');
const axios = require('axios');
const pino = require('pino');
const http = require('http');

const PORT = process.env.PORT || 8080;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot WhatsApp Kas Warga Aktif Versi 7!\n');
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

    // Fungsi jeda waktu (delay)
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    // Fungsi utama pengambil data murni dari database InfinityFree
    async function sendReport(sockInstance, testMode = false) {
        try {
            console.log('Mengambil data murni dari database InfinityFree...');
            
            let response = await axios.get('http://cendanafamilybackup.rf.gd/api-ai.php', {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    'Accept': 'application/json'
                },
                timeout: 12000
            });

            let reportData = response.data;

            // Pengecekan ketat: Pastikan data benar-benar JSON dari database, bukan HTML proteksi hosting
            if (typeof reportData === 'string' && reportData.includes('<html>')) {
                throw new Error('Server InfinityFree memblokir request (terkena halaman proteksi HTML/Cloudflare).');
            }

            if (!reportData || !reportData.kumulatif) {
                throw new Error('Struktur data JSON dari database tidak lengkap.');
            }

            const formatRupiah = (val) => {
                return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(val || 0);
            };

            let title = testMode ? "📊 *[TEST MANUAL] LAPORAN KAS CENDANA* 📊\n\n" : "📊 *LAPORAN HARIAN KAS WARGA CENDANA* 📊\n🗓️ *Update Pukul 21:30 WIB*\n\n";

            let content = title +
                          "📌 *MUTASI KEUANGAN S/D SAAT INI (DATABASE):*\n" +
                          "• Total Penerimaan: " + formatRupiah(reportData.kumulatif.total_masuk_sd) + "\n" +
                          "• Total Pengeluaran: " + formatRupiah(reportData.kumulatif.total_keluar_sd) + "\n" +
                          "• *Total Sisa Uang Kas:* " + formatRupiah(reportData.kumulatif.sisa_kas_sd) + "\n\n" +
                          "📈 *MUTASI BULAN INI:*\n" +
                          "• Masuk Bulan Ini: " + formatRupiah(reportData.bulan_ini.masuk_bulan_ini) + "\n" +
                          "• Keluar Bulan Ini: " + formatRupiah(reportData.bulan_ini.keluar_bulan_ini) + "\n" +
                          "• *Mutasi Saldo Bulan Ini:* " + formatRupiah(reportData.bulan_ini.mutasi_bulan_ini) + "\n\n" +
                          "🔗 Untuk melihat detail bisa klik link ini:\nhttps://cendanafamilybackup.rf.gd\n\n" +
                          "Terima kasih. 🙏";

            // Mengirim ke setiap nomor satu per satu dengan jeda aman
            for (let num of targetNumbers) {
                try {
                    let recipientJid = num + '@s.whatsapp.net';
                    await sockInstance.sendMessage(recipientJid, { text: content });
                    console.log('Berhasil mengirim laporan database ke nomor: ' + num);
                } catch (errNum) {
                    console.log(`Gagal mengirim ke nomor ${num}:`, errNum.message);
                }
                await delay(4000);
            }
        } catch (err) {
            console.log('GAGAL MENGAMBIL DATA DATABASE:', err.message);
            // Kirim pesan peringatan ke nomor pertama bahwa koneksi database terhalang hosting
            try {
                await sockInstance.sendMessage(targetNumbers[0] + '@s.whatsapp.net', { 
                    text: "⚠️ *PERINGATAN BOT KAS*\n\nGagal menarik data langsung dari database InfinityFree karena proteksi keamanan hosing gratis. Silakan cek koneksi atau file API di hosting." 
                });
            } catch (e) {}
        }
    }

    // Cron job diset setiap jam 21:30 WIB ('30 21 * * *')
    cron.schedule('30 21 * * *', async () => {
        console.log('Menjalankan cron job harian jam 21:30 WIB...');
        await sendReport(client, false);
    }, {
        timezone: "Asia/Jakarta"
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
                console.log(`Keyword cocok dari ${senderJid}, mengambil data database real-time...`);

                let response = await axios.get('http://cendanafamilybackup.rf.gd/api-ai.php', {
                    headers: { 
                        'User-Agent': 'Mozilla/5.0',
                        'Accept': 'application/json'
                    },
                    timeout: 8000
                });

                let data = response.data;
                if (typeof data === 'string' && data.includes('<html>')) {
                    await client.sendMessage(senderJid, { text: "⚠️ Gagal mengambil data real-time: Server hosting memblokir akses luar." });
                    return;
                }

                const formatRupiah = (val) => {
                    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(val || 0);
                };

                let replyText = `🤖 *INFORMASI KAS WARGA (DARI DATABASE)*\n\n` +
                                `• Total Sisa Uang Kas: *${formatRupiah(data.kumulatif.sisa_kas_sd)}*\n` +
                                `• Masuk Bulan Ini: ${formatRupiah(data.bulan_ini.masuk_bulan_ini)}\n` +
                                `• Keluar Bulan Ini: ${formatRupiah(data.bulan_ini.keluar_bulan_ini)}\n\n` +
                                `🔗 Detail lengkap: https://cendanafamilybackup.rf.gd\n🙏 Terima kasih.`;

                await client.sendMessage(senderJid, { text: replyText });
            }
        } catch (err) {
            console.log('Gagal memproses pesan chat masuk:', err.message);
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
        }
    });
}

runBot();
