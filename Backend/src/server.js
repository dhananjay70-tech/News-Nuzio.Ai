import { config } from './config/env.js';
import { connectDatabase } from './config/database.js';
import app from './app.js';

const PORT = config.PORT || 5000;

async function startServer() {
  try {
    // Connect to database
    await connectDatabase();
    console.log('✅ Database connected successfully');

    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📝 Environment: ${config.NODE_ENV}`);
      console.log(`🌐 Frontend URL: ${config.FRONTEND_URL}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
