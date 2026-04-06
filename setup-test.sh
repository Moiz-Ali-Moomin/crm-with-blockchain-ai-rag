#!/bin/bash
set -e

PROJECT=/opt/nexus-crm

# ── 1. Install Node.js 20 ────────────────────────────────────────────────────
echo ">>> Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# ── 2. Write crm-backend/.env ────────────────────────────────────────────────
echo ">>> Writing backend .env..."
cat > $PROJECT/crm-backend/.env << 'EOF'
NODE_ENV=production
PORT=3001
APP_URL=http://localhost:3000
API_URL=http://localhost:3001
CORS_ORIGINS=http://localhost:3000

DATABASE_URL=postgresql://crm_user:crm_password@localhost:5432/crm_db?schema=public
REDIS_URL=redis://localhost:6379

JWT_SECRET=change_me_jwt_secret_32chars_minimum_x
JWT_REFRESH_SECRET=change_me_refresh_secret_32chars_minx

SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
MONGO_URI=
OPENAI_API_KEY=
LOG_LEVEL=debug
EOF

# ── 3. Write crm-frontend/.env.local ────────────────────────────────────────
echo ">>> Writing frontend .env.local..."
SERVER_IP=$(curl -s ifconfig.me)
cat > $PROJECT/crm-frontend/.env.local << EOF
NEXT_PUBLIC_API_URL=http://${SERVER_IP}:3001/api/v1
NEXT_PUBLIC_APP_URL=http://${SERVER_IP}:3000
EOF

# ── 4. Build & start backend ─────────────────────────────────────────────────
echo ">>> Installing backend deps..."
cd $PROJECT/crm-backend
npm install

echo ">>> Running Prisma migrations..."
npx prisma migrate deploy

echo ">>> Building backend..."
npm run build

echo ">>> Starting backend..."
nohup npm run start:prod > /tmp/crm-api.log 2>&1 &
echo "Backend PID: $!"

# ── 5. Build & start frontend ────────────────────────────────────────────────
echo ">>> Installing frontend deps..."
cd $PROJECT/crm-frontend
npm install

echo ">>> Building frontend..."
npm run build

echo ">>> Starting frontend..."
nohup npm start > /tmp/crm-web.log 2>&1 &
echo "Frontend PID: $!"

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo "Done! Visit: http://${SERVER_IP}:3000"
echo "  API:        http://${SERVER_IP}:3001/api/v1"
echo ""
echo "  Logs: tail -f /tmp/crm-api.log"
echo "        tail -f /tmp/crm-web.log"
