module.exports = {
  apps: [
    {
      name: 'alma-scheduler',
      script: 'bun',
      args: 'run start',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 80, // Use standard HTTP port
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 80,
      },
      // Auto-restart configuration
      autorestart: true, // cSpell:disable-line
      watch: false,
      max_memory_restart: '1G',
      
      // Logging
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Health monitoring
      min_uptime: '10s',
      max_restarts: 10,
      
      // Process management
      kill_timeout: 5000,
      listen_timeout: 8000,
      
      // Environment variables for production
      env_production: {
        NODE_ENV: 'production',
        PORT: 80,
      }
    }
  ]
};