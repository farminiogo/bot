import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Start Telegram bot with increased memory limit
exec('node --max-old-space-size=4096 src/services/telegramBot.js', 
  { 
    maxBuffer: 1024 * 1024 * 10,
    cwd: __dirname
  }, 
  (err, stdout, stderr) => {
    if (err) {
      console.error('Bot Execution Error:', err);
      return;
    }
    if (stderr) {
      console.error('Bot STDERR:', stderr);
    }
    console.log(stdout);
  }
);

// Keep the process alive
process.stdin.resume();

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down...');
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});