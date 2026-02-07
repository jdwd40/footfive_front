#!/bin/bash
# Run this on your VPS to fix the port 80 conflict

echo "🔍 Checking what's using port 80..."

# Check what's listening on port 80
sudo lsof -i :80 || sudo netstat -tulpn | grep :80 || sudo ss -tulpn | grep :80

echo ""
echo "📋 Checking nginx status..."
sudo systemctl status nginx

echo ""
echo "🔧 To fix this, you can:"
echo "1. Stop the conflicting service"
echo "2. Or check if there are multiple nginx processes"
echo ""
echo "Common fixes:"
echo "  sudo systemctl stop apache2  # if Apache is running"
echo "  sudo systemctl stop nginx    # stop nginx"
echo "  sudo pkill -f nginx          # kill all nginx processes"
echo "  sudo systemctl start nginx   # restart nginx"
echo ""
echo "Then retry: sudo certbot --nginx -d jwd1.xyz -d www.jwd1.xyz"





