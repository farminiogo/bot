import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// تحديد مسار المشروع
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// خيارات تشغيل البوت
const BOT_SCRIPT = join(__dirname, 'src/services/telegramBot.js');
const MAX_MEMORY_MB = 4096; // 4GB Memory Limit

// دالة لتشغيل البوت
function startBot() {
  console.log('🚀 تشغيل بوت التيلجرام...');

  // تشغيل البوت مع زيادة حد الذاكرة
  const botProcess = spawn('node', [`--max-old-space-size=${MAX_MEMORY_MB}`, BOT_SCRIPT], {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe'] // تجاهل الإدخال، توجيه الإخراج إلى stdout و stderr
  });

  // معالجة إخراج البوت
  botProcess.stdout.on('data', (data) => {
    console.log(`📢 BOT: ${data.toString()}`);
  });

  botProcess.stderr.on('data', (data) => {
    console.error(`❌ BOT ERROR: ${data.toString()}`);
  });

  // التعامل مع الإغلاق غير المتوقع
  botProcess.on('exit', (code, signal) => {
    console.warn(`⚠️ بوت التيلجرام أغلق ${code !== null ? `برمز خروج: ${code}` : `بإشارة: ${signal}`}`);
    
    // إعادة التشغيل التلقائي بعد 5 ثوانٍ في حالة الفشل
    if (code !== 0) {
      console.log('🔄 إعادة تشغيل البوت خلال 5 ثوانٍ...');
      setTimeout(startBot, 5000);
    }
  });

  return botProcess;
}

// تشغيل البوت
let botInstance = startBot();

// إبقاء العملية تعمل
process.stdin.resume();

// التعامل مع إشارات الإغلاق بشكل آمن
process.on('SIGINT', () => {
  console.log('🛑 إيقاف البوت...');
  botInstance.kill('SIGINT');
  process.exit(0);
});

// التعامل مع الأخطاء غير المتوقعة
process.on('uncaughtException', (err) => {
  console.error('❌ خطأ غير متوقع:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ رفض غير معالج في:', promise, 'السبب:', reason);
});
