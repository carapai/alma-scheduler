# Deployment Guide

## PM2 Deployment Options

### Option 1: Run on Standard Port (Recommended)

Stop your current PM2 process and restart with the ecosystem config:

```bash
# Stop current process
pm2 stop alma
pm2 delete alma

# Use ecosystem config (runs on port 80)
pm2 start ecosystem.config.js --env production
```

**Note**: Running on port 80 requires sudo privileges:
```bash
sudo pm2 start ecosystem.config.js --env production
```

### Option 2: Use Reverse Proxy (If you can't run on port 80)

If you can't run on port 80, keep your current setup and configure your web server:

#### For Apache:
```bash
# Keep current PM2 process
pm2 start "bun run start" --name alma

# Enable required Apache modules
sudo a2enmod proxy
sudo a2enmod proxy_http
sudo a2enmod proxy_wstunnel
sudo a2enmod rewrite
sudo a2enmod ssl

# Configure Apache (copy apache.conf.example to your Apache sites)
sudo cp apache.conf.example /etc/apache2/sites-available/alma-scheduler.conf
sudo a2ensite alma-scheduler
sudo apache2ctl configtest
sudo systemctl reload apache2
```

#### For Nginx:
```bash
# Keep current PM2 process
pm2 start "bun run start" --name alma

# Configure nginx (copy nginx.conf.example to your nginx sites)
sudo cp nginx.conf.example /etc/nginx/sites-available/alma-scheduler
sudo ln -s /etc/nginx/sites-available/alma-scheduler /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Option 3: Use Different Port with Environment Variable

```bash
# Stop current process
pm2 stop alma
pm2 delete alma

# Start with custom port
PORT=8080 pm2 start "bun run start" --name alma
```

Then update your domain to point to the custom port or configure reverse proxy.

## Troubleshooting WebSocket Issues

1. **Check if WebSocket endpoint is accessible**:
   ```bash
   curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: test" http://your-domain/ws
   ```

2. **Check server logs**:
   ```bash
   pm2 logs alma
   ```

3. **Check Apache logs** (if using Apache):
   ```bash
   sudo tail -f /var/log/apache2/alma-scheduler-error.log
   sudo tail -f /var/log/apache2/alma-scheduler-access.log
   ```

4. **Verify Apache modules are enabled**:
   ```bash
   apache2ctl -M | grep -E "(proxy|rewrite|ssl)"
   ```

5. **Test Apache configuration**:
   ```bash
   sudo apache2ctl configtest
   ```

6. **Verify port is accessible**:
   ```bash
   netstat -tlnp | grep :80
   # or
   netstat -tlnp | grep :3003
   ```

## Current Issues

The WebSocket connection fails because:
- Your app runs on port 3003
- The domain expects traffic on port 80/443
- WebSocket upgrade requests need proper handling

Choose Option 1 for the simplest solution, or Option 2 if you need to keep the current port setup.