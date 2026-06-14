#!/bin/bash
# Bootstrap script — runs as root via cloud-init on first boot.
# Injected template vars: ${repo_url}, ${repo_branch}, ${caddy_host}
set -euo pipefail
exec > /var/log/benchmark-init.log 2>&1
echo "=== BenchMark bootstrap: $(date) ==="

apt-get update -qq
apt-get install -y -qq curl git ca-certificates gnupg

# Docker
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -qq
apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
systemctl enable --now docker

# Clone and start
git clone --branch "${repo_branch}" --depth 1 "${repo_url}" /root/BenchMark
cd /root/BenchMark
echo "CADDY_HOST=${caddy_host}" > .env
docker compose up --build -d

echo "=== Done: $(date) — platform at http://$(curl -s ifconfig.me) ==="
