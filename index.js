// ? index.js
import fs from 'fs';
import qrcode from 'qrcode-terminal';
import { GoogleGenerativeAI } from '@google/generative-ai';
import 'dotenv/config';
import pkg from 'whatsapp-web.js';
const {Client, LocalAuth} = pkg;

// 1. Konfigurasi Gemini AI
const genAI = new GoogleGenerativeAI(process.env.API_KEY);
// Gunakan model yang terbukti jalan di akun Anda (Lite/Flash)
const model = genAI.getGenerativeModel({ model: "gemini-flash-lite-latest" });

// --- 2. SETUP LOGGER ---
const LOG_FILE = 'data-penelitian.csv';
const logResearchData = (question, answer, duration) => {
    if (!fs.existsSync(LOG_FILE)) {
        fs.writeFileSync(LOG_FILE, 'Timestamp,Pertanyaan,Jawaban,Waktu_Proses_ms\n');
    }
    const cleanQ = question ? question.replace(/[\n,]/g, ' ') : ''; 
    const cleanA = answer ? answer.replace(/[\n,]/g, ' ') : '';
    const time = new Date().toISOString();
    const row = `${time},"${cleanQ}","${cleanA}",${duration}\n`;
    fs.appendFileSync(LOG_FILE, row);
};

// --- 3. LOAD DATABASE SEKOLAH (SEKALI SAJA DI AWAL) ---
// Kita baca file ini SEBELUM bot nyala. Data akan disimpan di RAM.
let SCHOOL_DATA_CONTEXT = "";

try {
    console.log("📂 Membaca Database Sekolah...");
    const rawData = fs.readFileSync('data-sekolah.json', 'utf8');
    const jsonData = JSON.parse(rawData);
    // Kita stringify di awal biar tidak perlu proses ulang tiap ada chat
    SCHOOL_DATA_CONTEXT = JSON.stringify(jsonData, null, 2);
    console.log("✅ Database berhasil dimuat ke Memory!");
} catch (error) {
    console.error("❌ FATAL ERROR: Gagal membaca data-sekolah.json");
    console.error("Pastikan file ada dan format JSON benar.");
    process.exit(1); // Matikan program karena database wajib ada
}

// --- 4. SYSTEM INSTRUCTION (Prompt Dasar) ---
const SYSTEM_INSTRUCTION = `
PERAN: Anda adalah "Meki", Asisten Digital Cerdas dari SMA Negeri 1 Baji Ajalah.

TUGAS UTAMA:
1. Jika User menyapa (Halo/P/Assalamualaikum) -> Berikan salam pembuka dan tawarkan bantuan.
2. Jika User bertanya -> Jawab berdasarkan DATA JSON yang dilampirkan.
3. Greeting: Halo 👋! Saya Meki, Chatbot SMA Negeri 1 Baji Ajalah. Saya siap membantu Anda dengan informasi seputar Penerimaan Peserta Didik Baru dan berikan point-point yang bisa anda jelaskan agar user tidak bingung untuk bertanya.

ATURAN FORMAT & GAYA BAHASA:
1. Gunakan Bahasa Indonesia formal, ramah, dan solutif.
2. Gunakan Emoji yang relevan.
3. **FORMAT WHATSAPP:**
   - Gunakan tanda bintang (*) untuk menebalkan poin penting.
   - Gunakan strip (-) untuk daftar/list.
   - **WAJIB:** Berikan jarak antar paragraf (Enter 2x) agar tulisan tidak menumpuk.

BATASAN (STRICT):
- JANGAN MENGARANG / HALUSINASI. Jawaban harus 100% bersumber dari DATA JSON.
- Jika data tidak ditemukan, JANGAN menebak. Jawablah persis dengan kalimat ini:
  "🤖 Mohon maaf, informasi tersebut belum tersedia dalam sistem kami. Silakan hubungi Tata Usaha (Pak Cholam) di 0855-1234-4321 untuk informasi lebih lanjut."
`;

// --- 5. SETUP CLIENT ---
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

client.on('qr', (qr) => qrcode.generate(qr, { small: true }));

client.on('ready', () => {
    console.log('[INFO] Bot Siap Melayani!');
});

// --- 6. LOGIKA PESAN (LEBIH RINGAN) ---
client.on('message', async msg => {
    if (msg.body === 'status@broadcast') return;

    const startTime = Date.now();
    console.log(`[USER] ${msg.from}: ${msg.body}`);

    try {
        const chat = await msg.getChat();
        await chat.sendStateTyping();

        // ❌ Kita TIDAK membaca file di sini lagi.
        // ✅ Kita pakai SCHOOL_DATA_CONTEXT yang sudah dimuat di atas.

        // Gabungkan Prompt
        const prompt = `
        ${SYSTEM_INSTRUCTION}

        === DATA SEKOLAH (SUMBER KEBENARAN) ===
        ${SCHOOL_DATA_CONTEXT}
        =======================================

        PERTANYAAN USER: "${msg.body}"
        JAWABAN:`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        await msg.reply(text);

        const endTime = Date.now();
        logResearchData(msg.body, text, endTime - startTime);
        console.log(`[BOT] Terkirim (${endTime - startTime}ms)`);

    } catch (error) {
        console.error('[ERROR]', error);
    }
});

client.initialize();