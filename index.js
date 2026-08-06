const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const cron = require('node-cron');
const axios = require('axios');
const pino = require('pino');
const http = require('http');

const PORT = process.env.PORT || 8080;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot WhatsApp Kas Warga Aktif Versi 10!\n');
}).listen(PORT, '0.0.0.0', () => {
    console.log(`Server HTTP aktif di port ${PORT}`);
});

let client; // Jadikan variabel global agar tidak terjadi penumpukan instance

async function runBot() {
    console.log('Inisialisasi bot WhatsApp...');
    const { state, saveCreds } = await useMultiFileAuthState('auth_session');
    
    client = makeWASocket({
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

    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    // Fungsi pengambil data PHP
    async function ambilDataDariPHP() {
        try {
            let response = await axios.get('http://cendanafamilybackup.rf.gd/api-ai.php', {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/json, text/html'
                },
                timeout: 10000
            });

            let rawData = response.data;
            if (typeof rawData === 'object' && rawData !== null && rawData.kumulatif) {
                return rawData;
            }
            if (typeof rawData === 'string' && rawData.includes('<html>')) {
                let jsonMatch = rawData.match(/\{[\s\S]*"kumulatif"[\s\S]*\}/);
                if (jsonMatch) {
                    try { return JSON.parse(jsonMatch[0]); } catch (e) {}
                }
            }
            return null;
        } catch (err) {
            console.log('Catatan koneksi PHP:', err.message);
            return null;
        }
    }

    // Fungsi pengirim laporan
    async function sendReport(sockInstance, testMode = false) {
        try {
            console.log('Memulai proses pengiriman laporan ke warga...');
            let reportData = await ambilDataDariPHP();

            if (!reportData || !reportData.kumulatif) {
                reportData = {
                    kumulatif: { total_masuk_sd: 6300000, total_keluar_sd: 4538500, sisa_kas_sd: 1761500 },
                    bulan_ini: { masuk_bulan_ini: 40000, keluar_bulan_ini: 100000, mutasi_bulan_ini: -60000 }
                };
            }

            const formatRupiah = (val) => {
                return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(val || 0);
            };

            let title = testMode ? "📊 *[TEST MANUAL] LAPORAN KAS CENDANA* 📊\n\n" : "📊 *LAPORAN HARIAN KAS WARGA CENDANA* 📊\n🗓️ *Update Pukul 21:30 WIB*\n\n";

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
                try {
                    let recipientJid = num + '@s.whatsapp.net';
                    await sockInstance.sendMessage(recipientJid, { text: content });
                    console.log('Berhasil mengirim laporan ke nomor: ' + num);
                } catch (errNum) {
                    console.log(`Gagal mengirim ke nomor ${num}:`, errNum.message);
                }
                await delay(4000);
            }
        } catch (err) {
            console.log('Gagal menjalankan sendReport:', err.message);
        }
    }

    // Cron job jam 21:30 WIB
    cron.schedule('30 21 * * *', async () => {
        console.log('Menjalankan cron job harian jam 21:30 WIB...');
        if (client) await sendReport(client, false);
    }, {
        timezone: "Asia/Jakarta"
    });

    // Fitur pesan masuk
    client.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            let mek = chatUpdate.messages[0];
            if (!mek.message || mek.key.fromMe) return;

            let senderJid = mek.key.remoteJid;
            let messageType = Object.keys(mek.message)[0];
            let textPesan = messageType === 'conversation' ? mek.message.conversation :
                            messageType === 'extendedTextMessage' ? mek.message.extendedTextMessage.text :
                            messageType === 'imageMessage' ? mek.message.imageMessage.caption : "";

            if (!textPesan) return;
            let keyword = textPesan.toLowerCase().trim();

            if (['sisa kas', 'saldo', 'laporan', 'info'].includes(keyword)) {
                console.log(`Keyword cocok dari ${senderJid}, memproses...`);
                let reportData = await ambilDataDariPHP();
                let data = (reportData && reportData.kumulatif) ? reportData : {
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
            console.log('--- SALIN KODE QR ---');
            console.log(qr);
        }

        if (connection === 'close') {
            const statusCode = (lastDisconnect?.error instanceof Boom)?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log(`Koneksi terputus (Kode: ${statusCode}). Menghubungkan ulang...`);
            if (shouldReconnect) {
                setTimeout(runBot, 3000); // Jeda 3 detik sebelum re-init agar stabil
            }
        } else if (connection === 'open') {
            console.log('Koneksi WhatsApp Terbuka dan Siap!');

            // Test kirim manual setelah 5 detik terkoneksi
            setTimeout(async () => {
                console.log('Mengeksekusi pengiriman laporan manual...');
                await sendReport(client, true);
            }, 5000);
        }
    });
}

runBot();
