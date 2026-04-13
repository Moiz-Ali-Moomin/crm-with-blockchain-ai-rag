#!/usr/bin/env bash
# server-setup.sh — Run ONCE on a fresh Hetzner VPS to configure it for
# production deployments. Idempotent: safe to re-run.
#
# Usage: bash server-setup.sh <deploy_user> <your_ssh_public_key>

set -euo pipefail

DEPLOY_USER="${1:?Provide deploy username}"
SSH_PUBKEY="${2:?Provide SSH public key}"
DEPLOY_PATH="/opt/crm-with-blockchain-rag"

echo "═══════════════════════════════════════════════════════════"
echo " Server setup for CRM production deployment"
echo "═══════════════════════════════════════════════════════════"

# ── System updates ─────────────────────────────────────────────────────────
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \
  ufw fail2ban curl wget git unzip \
  docker.io docker-compose-plugin \
  logrotate

# ── Docker daemon hardening ────────────────────────────────────────────────
cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "3"
  },
  "no-new-privileges": true,
  "live-restore": true,
  "userland-proxy": false
}
EOF
systemctl restart docker

# ── Firewall (UFW) ─────────────────────────────────────────────────────────
# WHY: Default-deny inbound. Only SSH (non-standard port), HTTP, HTTPS allowed.
# Prometheus/Grafana are NOT exposed publicly — access via SSH tunnel only.
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 2222/tcp comment 'SSH (non-standard)'
ufw allow 80/tcp  comment 'HTTP → redirects to HTTPS'
ufw allow 443/tcp comment 'HTTPS'
ufw --force enable

# ── Fail2ban ──────────────────────────────────────────────────────────────
# WHY: Automatically bans IPs with repeated SSH failures. Essential for any
# internet-facing server.
cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 5
backend  = systemd

[sshd]
enabled  = true
port     = 2222
EOF
systemctl enable --now fail2ban

# ── SSH hardening ─────────────────────────────────────────────────────────
cat > /etc/ssh/sshd_config.d/99-hardening.conf <<'EOF'
Port 2222
PermitRootLogin no
PasswordAuthentication no
ChallengeResponseAuthentication no
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
AllowTcpForwarding yes    # needed for SSH tunnel to Grafana
X11Forwarding no
EOF
systemctl reload sshd

# ── Deploy user ────────────────────────────────────────────────────────────
if ! id "$DEPLOY_USER" &>/dev/null; then
  useradd -m -s /bin/bash "$DEPLOY_USER"
fi
usermod -aG docker "$DEPLOY_USER"
mkdir -p "/home/$DEPLOY_USER/.ssh"
echo "$SSH_PUBKEY" >> "/home/$DEPLOY_USER/.ssh/authorized_keys"
chmod 700 "/home/$DEPLOY_USER/.ssh"
chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"
chown -R "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"

# ── Deploy directory ───────────────────────────────────────────────────────
mkdir -p "$DEPLOY_PATH"
chown "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_PATH"

# ── Secrets file (fill this in before first deploy) ───────────────────────
# WHY: a single 600-permission file is safer than a .env checked into git.
# Only the deploy user (and root) can read it.
if [ ! -f "$DEPLOY_PATH/.secrets" ]; then
  cat > "$DEPLOY_PATH/.secrets" <<'SECRETS'
# Fill in production values — never commit this file
POSTGRES_USER=crm
POSTGRES_PASSWORD=CHANGE_ME
POSTGRES_DB=crm_prod
REDIS_PASSWORD=CHANGE_ME
MONGO_USER=crm
MONGO_PASSWORD=CHANGE_ME
NEXT_PUBLIC_API_URL=https://bestpurchasestore.com
NEXT_PUBLIC_APP_URL=https://bestpurchasestore.com
GRAFANA_PASSWORD=CHANGE_ME
JWT_SECRET=CHANGE_ME
SECRETS
  chmod 600 "$DEPLOY_PATH/.secrets"
  chown "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_PATH/.secrets"
  echo "⚠️  Edit $DEPLOY_PATH/.secrets before deploying!"
fi

# ── Initial active slot ───────────────────────────────────────────────────
echo "blue" > "$DEPLOY_PATH/.active_slot"
chown "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_PATH/.active_slot"

# ── Sysctl tuning for production ──────────────────────────────────────────
cat >> /etc/sysctl.d/99-crm-prod.conf <<'EOF'
# Connection backlog
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
# TIME_WAIT recycling
net.ipv4.tcp_tw_reuse = 1
# File descriptor limit
fs.file-max = 1000000
EOF
sysctl -p /etc/sysctl.d/99-crm-prod.conf

echo ""
echo "═══════════════════════════════════════════════════════════"
echo " ✅ Server setup complete"
echo " Next steps:"
echo "   1. Edit $DEPLOY_PATH/.secrets with real credentials"
echo "   2. Clone your repo into $DEPLOY_PATH"
echo "   3. Add GitHub secrets (see docs/deployment.md)"
echo "   4. Push to main to trigger your first deploy"
echo "═══════════════════════════════════════════════════════════"
