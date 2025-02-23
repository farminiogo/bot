import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// وظيفة لتشغيل بوت التليجرام مع إعادة التشغيل عند التوقف
function startBot() {
    console.log('🚀 Starting Telegram bot...');
    
    const botProcess = spawn('node', ['--max-old-space-size=4096', 'src/services/telegramBot.js'], {
        cwd: __dirname,
        stdio: ['ignore', 'pipe', 'pipe']
    });
    
    botProcess.stdout.on('data', (data) => {
        console.log(`BOT LOG: ${data}`);
    });
    
    botProcess.stderr.on('data', (data) => {
        console.error(`BOT ERROR: ${data}`);
    });
    
    botProcess.on('exit', (code, signal) => {
        console.error(`Bot process exited with code: ${code}, signal: ${signal}`);
        console.log('🔄 Restarting bot in 5 seconds...');
        setTimeout(startBot, 5000);
    });
}

// تشغيل البوت للمرة الأولى
startBot();

// إبقاء العملية نشطة
process.stdin.resume();

// التعامل مع الإنهاء السليم للعملية
process.on('SIGINT', () => {
    console.log('🛑 Shutting down gracefully...');
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    console.error('💥 Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
});
