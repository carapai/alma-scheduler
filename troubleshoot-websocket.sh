#!/bin/bash

echo "=== WebSocket Troubleshooting Script ==="
echo

echo "1. Checking if required Apache modules are enabled:"
echo "=================================================="
apache2ctl -M | grep -E "(proxy|proxy_http|proxy_wstunnel|rewrite|headers)" | sort
echo

echo "2. Testing if Bun server is running on 192.168.0.3:3003:"
echo "========================================================"
curl -s -o /dev/null -w "%{http_code}" http://192.168.0.3:3003/ || echo "Connection failed"
echo

echo "3. Testing WebSocket endpoint directly (should return 400 for non-WebSocket request):"
echo "================================================================================="
curl -s -o /dev/null -w "%{http_code}" http://192.168.0.3:3003/ws || echo "Connection failed"
echo

echo "4. Testing WebSocket upgrade through Apache:"
echo "==========================================="
curl -s -o /dev/null -w "%{http_code}" \
  -H "Upgrade: websocket" \
  -H "Connection: Upgrade" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  -H "Sec-WebSocket-Version: 13" \
  https://alma.services.dhis2.hispuganda.org/ws || echo "Connection failed"
echo

echo "5. Checking Apache error logs for WebSocket errors:"
echo "=================================================="
tail -10 /var/log/apache2/alma-scheduler-error.log | grep -i websocket || echo "No WebSocket errors found"
echo

echo "6. Checking if port 3003 is listening:"
echo "====================================="
netstat -tlnp | grep :3003 || echo "Port 3003 not listening"
echo

echo "7. Testing PM2 process status:"
echo "============================="
pm2 list | grep alma || echo "No alma process found"
echo

echo "=== Additional Commands to Run ==="
echo "If modules are missing, run:"
echo "sudo a2enmod proxy"
echo "sudo a2enmod proxy_http" 
echo "sudo a2enmod proxy_wstunnel"
echo "sudo a2enmod rewrite"
echo "sudo a2enmod headers"
echo "sudo systemctl reload apache2"
echo

echo "If Bun server is not running:"
echo "cd /path/to/your/project"
echo "pm2 start 'bun run start' --name alma"
echo

echo "To check real-time logs:"
echo "pm2 logs alma"
echo "sudo tail -f /var/log/apache2/alma-scheduler-error.log"