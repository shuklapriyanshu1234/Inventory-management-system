import { createApp } from './app';
import { config } from './config';
import prisma from './db';

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`====================================================`);
  console.log(`XYZ Retail Corporation Inventory Management System`);
  console.log(`Server running at: http://localhost:${config.port}`);
  console.log(`API Documentation: http://localhost:${config.port}/api/docs`);
  console.log(`Health Check:      http://localhost:${config.port}/health`);
  console.log(`====================================================`);
});

// Graceful shutdown
const handleShutdown = async (signal: string) => {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    console.log('HTTP server closed.');
    await prisma.$disconnect();
    console.log('Database disconnected.');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Forced shutdown after 10s timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
