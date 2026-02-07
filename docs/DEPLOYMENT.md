# FootFive Deployment Guide

This guide explains how to deploy FootFive to your VPS at jwd1.xyz.

## Quick Setup

### Step 1: Set up your VPS

SSH into your VPS and run these commands:

```bash
ssh jd@77.68.4.18
```

Then run this one-liner to set everything up:

```bash
# Create web directory
sudo mkdir -p /var/www/jwd1.xyz
sudo chown -R $USER:$USER /var/www/jwd1.xyz

# Install nginx
sudo apt update && sudo apt install -y nginx

# Configure nginx for jwd1.xyz (static frontend + API reverse proxy)
sudo tee /etc/nginx/sites-available/jwd1.xyz > /dev/null << 'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name jwd1.xyz www.jwd1.xyz;

    root /var/www/jwd1.xyz;
    index index.html;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied expired no-cache no-store private auth;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml application/javascript;

    # Reverse proxy for API requests to backend on port 9001
    location /api/ {
        proxy_pass http://127.0.0.1:9001/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 10s;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }

    # SSE endpoint - disable buffering for streaming
    location /api/live/events {
        proxy_pass http://127.0.0.1:9001/api/live/events;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 24h;
        chunked_transfer_encoding off;
        add_header Cache-Control "no-cache";
        add_header X-Accel-Buffering "no";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
EOF

# Enable site and restart nginx
sudo ln -sf /etc/nginx/sites-available/jwd1.xyz /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx

# Create placeholder page
echo '<h1>FootFive - Ready for deployment!</h1>' > /var/www/jwd1.xyz/index.html

echo "✅ VPS setup complete!"
```

### Step 2: (Optional) Enable HTTPS with Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d jwd1.xyz -d www.jwd1.xyz
```

### Step 3: Add GitHub Secrets

Go to your GitHub repository:
1. Navigate to **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret** and add these three secrets:

| Secret Name | Value |
|-------------|-------|
| `VPS_HOST` | `77.68.4.18` |
| `VPS_USER` | `jd` |
| `VPS_PASSWORD` | `K!ller1921` |

### Step 4: Push to Deploy!

```bash
git add .
git commit -m "Add CI/CD deployment"
git push origin main
```

Your app will automatically build and deploy to https://jwd1.xyz on every push!

---

## How It Works

The GitHub Actions workflow (`.github/workflows/deploy.yml`):

1. **Triggers** on push to `main` or `master` branch
2. **Builds** the React app using `npm run build`
3. **Deploys** the `dist/` folder to `/var/www/jwd1.xyz` on your VPS
4. **Reloads** nginx to serve the new files

## File Structure

```
.github/
  workflows/
    deploy.yml          # GitHub Actions workflow
deploy/
  nginx-jwd1.xyz.conf   # nginx configuration (reference)
  setup-vps.sh          # VPS setup script (alternative)
```

## Troubleshooting

### Deployment fails with SSH error
- Verify SSH credentials in GitHub Secrets
- Make sure the VPS is accessible on port 22
- Check that the `jd` user has sudo permissions for nginx

### 404 errors on routes
- The nginx config handles SPA routing with `try_files $uri $uri/ /index.html`
- Make sure nginx is properly configured

### Permission denied on /var/www
- Run: `sudo chown -R jd:jd /var/www/jwd1.xyz`

### View deployment logs
- Go to GitHub → Actions tab to see deployment logs



