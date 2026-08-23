import dotenv from 'dotenv';
import { createApp } from './app.js';
import { pool } from './config/db.js';

dotenv.config();

const app = createApp();
const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log('====================================================');
  console.log(`🚗 Car Wash ERP & POS Server running on port ${PORT}`);
  console.log(`🔗 Local URL: http://localhost:${PORT}`);
  console.log(`📊 Dashboard API: http://localhost:${PORT}/api/dashboard/stats`);
  console.log('====================================================');
});

// Graceful shutdown
const shutdown = async () => {
  console.log('\n🛑 Shutting down server gracefully...');
  server.close(async () => {
    console.log('🔌 Closing PostgreSQL pool connections...');
    await pool.end();
    console.log('👋 Goodbye!');
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
