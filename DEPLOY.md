# Deployment Guide

Target: **Hetzner CX22** (2 vCPU, 4 GB RAM, Ubuntu 22.04 — €5.29/mo)
DigitalOcean/Vultr Basic $12 droplet works equally well.

---

## 1. Provision the Server

1. Create account at [hetzner.com/cloud](https://www.hetzner.com/cloud)
2. New Project → Add Server
   - Location: closest to you
   - Image: **Ubuntu 22.04**
   - Type: **CX22** (4 GB RAM — Next.js build needs headroom)
   - SSH Key: paste your public key (`~/.ssh/id_rsa.pub` or `~/.ssh/id_ed25519.pub`)
3. Note the server's IP address.

---

## 2. Initial Server Setup

```bash
# Connect
ssh root@YOUR_SERVER_IP

# Update packages
apt update && apt upgrade -y

# Create a non-root user (replace 'deploy' with whatever you like)
adduser deploy
usermod -aG sudo deploy

# Copy your SSH key to the new user
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy

# From now on, use the deploy user
su - deploy
```

---

## 3. Install Node.js, pnpm, PM2

```bash
# Node 20 via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node -v  # should be v20.x

# pnpm
npm install -g pnpm

# PM2 — keeps Node processes alive across reboots
npm install -g pm2
```

---

## 4. Install PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib

# Start and enable
sudo systemctl enable --now postgresql

# Create database and user
sudo -u postgres psql <<'SQL'
CREATE USER kalshi WITH PASSWORD 'choose_a_strong_password';
CREATE DATABASE kalshi_agents OWNER kalshi;
GRANT ALL PRIVILEGES ON DATABASE kalshi_agents TO kalshi;
SQL
```

Test the connection:

```bash
psql postgresql://kalshi:choose_a_strong_password@localhost/kalshi_agents -c '\l'
```

---

## 5. Install nginx

```bash
sudo apt install -y nginx
sudo systemctl enable --now nginx
```

---

## 6. Clone the Repo

```bash
cd ~
git clone https://github.com/azaletdinov-a11y/kalshi-agents.git
cd kalshi-agents

# Install all workspace dependencies
pnpm install
```

---

## 7. Create Environment Files

### Backend — `apps/backend/.env`

```bash
cat > apps/backend/.env <<'EOF'
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://kalshi:choose_a_strong_password@localhost/kalshi_agents

# Claude (required — pipeline won't work without this)
ANTHROPIC_API_KEY=sk-ant-...

# Research sources (optional but strongly recommended)
TAVILY_API_KEY=tvly-...
NEWS_API_KEY=...
FRED_API_KEY=...

# Kalshi API (only needed for real bets and portfolio balance; not required for dry-run)
KALSHI_KEY_ID=your-key-id
# Paste the private key as one line with literal \n between lines:
# KALSHI_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----

# Email alerts for whale events (optional)
RESEND_API_KEY=re_...
ALERT_EMAIL=you@example.com

# Optional overrides (defaults shown)
# PIPELINE_SCHEDULE=0 */2 * * *   # every 2 hours
# BANKROLL=100
# MAX_BET=5
# MIN_EDGE=0.05
# KELLY_FRACTION=0.25
EOF
```

> **KALSHI_PRIVATE_KEY format**: the PEM file has newlines — they must become literal `\n` in the .env.
> Run this to generate the correct one-line value:
> ```bash
> awk 'NF {printf "%s\\n", $0}' ~/kalshi-agents/kalshi.pem
> ```
> Paste the output as the value (without quotes).

### Frontend — `apps/frontend/.env.local`

```bash
cat > apps/frontend/.env.local <<'EOF'
# Server-side fetch (Next.js server components → backend)
API_URL=http://localhost:3001

# If you expose the frontend publicly and need client-side fetches too:
# NEXT_PUBLIC_API_URL=https://your-domain.com/api-backend
EOF
```

---

## 8. Build

```bash
cd ~/kalshi-agents

# Build backend (TypeScript → dist/)
pnpm build:backend

# Build frontend (Next.js → .next/)
pnpm build:frontend
```

The first run of the backend applies all DB migrations automatically on startup.

---

## 9. Start with PM2

Create the process config:

```bash
cat > ~/kalshi-agents/ecosystem.config.js <<'EOF'
module.exports = {
  apps: [
    {
      name: 'kalshi-backend',
      cwd: '/home/deploy/kalshi-agents/apps/backend',
      script: 'node',
      args: 'dist/index.js',
      env: { NODE_ENV: 'production' },
      restart_delay: 5000,
      max_restarts: 10,
    },
    {
      name: 'kalshi-frontend',
      cwd: '/home/deploy/kalshi-agents/apps/frontend',
      script: 'node',
      args: 'node_modules/.bin/next start -p 3000',
      env: { NODE_ENV: 'production' },
      restart_delay: 5000,
      max_restarts: 10,
    },
  ],
};
EOF
```

Start and persist:

```bash
cd ~/kalshi-agents
pm2 start ecosystem.config.js

# Save process list so PM2 restarts everything after a reboot
pm2 save

# Register PM2 as a systemd service (run the command it prints)
pm2 startup
# → it will print something like: sudo env PATH=... pm2 startup systemd -u deploy --hp /home/deploy
# Run that command.
```

Check status:

```bash
pm2 status
pm2 logs kalshi-backend --lines 50
```

---

## 10. Configure nginx

Replace `YOUR_SERVER_IP` with your actual IP (or a domain if you have one).

```bash
sudo tee /etc/nginx/sites-available/kalshi <<'EOF'
server {
    listen 80;
    server_name YOUR_SERVER_IP;

    # Frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API — proxied at /api-backend so the frontend can hit it from the browser if needed
    location /api-backend/ {
        rewrite ^/api-backend/(.*) /$1 break;
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/kalshi /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

Open your browser at `http://YOUR_SERVER_IP` — you should see the dashboard.

---

## 11. Verify the Backend

```bash
# Health check
curl http://localhost:3001/health
# → {"ok":true}

# Check migrations ran (pipeline/stats should return valid JSON)
curl http://localhost:3001/api/pipeline/stats
```

---

## 12. Configure Dry-Run Mode

Connect to the DB and flip the settings:

```bash
psql postgresql://kalshi:choose_a_strong_password@localhost/kalshi_agents
```

```sql
-- Enable auto-bettor in dry-run mode
UPDATE settings SET value='true'  WHERE key='auto_bet_enabled';
UPDATE settings SET value='true'  WHERE key='auto_bet_dry_run';

-- Starting bankroll for the simulation
INSERT INTO settings (key, value)
  VALUES ('starting_bankroll', '100')
  ON CONFLICT (key) DO UPDATE SET value='100';

-- Confirm
SELECT key, value FROM settings ORDER BY key;
\q
```

---

## 13. Trigger the First Pipeline Run

Either wait for the cron (runs at the top of every even hour) or kick it manually:

```bash
curl -X POST http://localhost:3001/api/pipeline/run
```

Watch it work:

```bash
pm2 logs kalshi-backend --lines 100
```

You should see `[Pipeline]`, `[Researcher]`, `[Estimator]`, `[RiskManager]` log lines.

---

## 14. Keeping it Updated

When you push new code:

```bash
cd ~/kalshi-agents
git pull
pnpm install          # pick up any new deps
pnpm build:backend
pnpm build:frontend
pm2 restart all
```

---

## Optional: Add a Domain + HTTPS

If you point a DNS A record at your server's IP:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
# Follow prompts — it auto-edits nginx config and sets up auto-renewal
```

---

## Reference: What Runs When

| Process | Schedule | What it does |
|---|---|---|
| Pipeline | Every 2h (configurable) | Scans markets, researches, estimates, stores recommendations, auto-bets |
| Resolver | Every hour at :15 | Marks settled recommendations + bets as won/lost, calculates P&L |
| Whale Hunter | Every 30 min | Snapshots market volume/OI, detects spikes, persists events |

All three are started by the backend on boot — no separate workers needed.

---

## Rough Monthly Cost

| Item | Cost |
|---|---|
| Hetzner CX22 | ~€5/mo |
| Anthropic API (Claude Sonnet, ~2h pipeline × 30 days × ~30 markets) | ~$15–25/mo |
| Tavily API | Free tier (1k searches/mo) or $9/mo |
| NewsAPI | Free tier (100 req/day) sufficient |
| FRED API | Free |
| **Total** | **~$25–40/mo** |
