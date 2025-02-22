import express from "express";
import { exec } from "child_process";

const app = express();
const PORT = process.env.PORT || 3000;

// تشغيل بوت التيلجرام تلقائيًا
exec("node src/services/telegramBot.js", (error, stdout, stderr) => {
  if (error) {
    console.error(`❌ Telegram Bot Error: ${error.message}`);
    return;
  }
  if (stderr) console.error(`⚠️ Telegram Bot Warning: ${stderr}`);
  console.log(`✅ Telegram Bot Running: ${stdout}`);
});

// تشغيل Vite لخدمة الموقع
exec("vite", (error, stdout, stderr) => {
  if (error) {
    console.error(`❌ Vite Server Error: ${error.message}`);
    return;
  }
  if (stderr) console.error(`⚠️ Vite Server Warning: ${stderr}`);
  console.log(`✅ Vite Server Running: ${stdout}`);
});

// رسالة عند فتح الموقع
app.get("/", (req, res) => {
  res.send("✅ Crypto Analytics Platform is running!");
});

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
