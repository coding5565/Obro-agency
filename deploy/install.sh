#!/usr/bin/env bash
# OBRO' Panel — serverga o'rnatish (Ubuntu/Debian). Qayta ishga tushirsa ham xavfsiz (idempotent).
#
# Boshqa loyihalarga tegmaslik qoidalari:
#   - hamma fayl /opt/obro-panel ichida, egasi alohida "obro" tizim foydalanuvchisi;
#   - PostgreSQL'da faqat o'zining "obro_panel" roli va bazasi yaratiladi;
#   - gunicorn faqat 127.0.0.1:$API_PORT da (tashqariga ochilmaydi);
#   - nginx'ga faqat yangi /etc/nginx/sites-available/obro-panel fayli qo'shiladi,
#     reload'dan oldin "nginx -t" bilan tekshiriladi; boshqa saytlar fayllari o'zgarmaydi.
#
# Ishlatish (root):  PUBLIC_PORT=8088 API_PORT=8710 bash install.sh
set -euo pipefail

PUBLIC_PORT="${PUBLIC_PORT:-8090}"
API_PORT="${API_PORT:-8710}"
SERVER_NAME="${SERVER_NAME:-_}"
REPO="${REPO:-https://github.com/coding5565/Obro-agency.git}"
ROOT=/opt/obro-panel
APP=$ROOT/app
VENV=$ROOT/venv
ENV_FILE=$ROOT/.env
PY="${PYTHON:-python3}"

log() { printf '\n== %s\n' "$*"; }

log "Paketlar (faqat yetishmaganlari o'rnatiladi)"
need=()
for pkg in git nginx postgresql python3-venv; do
  dpkg -s "$pkg" >/dev/null 2>&1 || need+=("$pkg")
done
if [ ${#need[@]} -gt 0 ]; then
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${need[@]}"
fi
systemctl enable --now postgresql >/dev/null 2>&1 || true

log "Tizim foydalanuvchisi va papkalar"
id obro >/dev/null 2>&1 || useradd --system --home "$ROOT" --shell /usr/sbin/nologin obro
mkdir -p "$ROOT"/{media,static,frontend}

log "Kod"
if [ -n "${CODE_TARBALL:-}" ]; then
  # Kompyuterdan yuklangan arxiv (git archive). Eski kod o'rniga to'liq yangisi qo'yiladi.
  rm -rf "$APP.new" && mkdir -p "$APP.new"
  tar -xzf "$CODE_TARBALL" -C "$APP.new"
  rm -rf "$APP" && mv "$APP.new" "$APP"
elif [ -d "$APP/.git" ]; then
  git -C "$APP" fetch -q origin main && git -C "$APP" reset -q --hard origin/main
else
  git clone -q "$REPO" "$APP"
fi
if [ -n "${FRONTEND_TARBALL:-}" ]; then
  rm -rf "$ROOT/frontend" && mkdir -p "$ROOT/frontend"
  tar -xzf "$FRONTEND_TARBALL" -C "$ROOT/frontend"
fi

log "Python muhiti"
[ -d "$VENV" ] || "$PY" -m venv "$VENV"
"$VENV/bin/pip" install -q --upgrade pip
"$VENV/bin/pip" install -q -r "$APP/backend/requirements.txt"

log "Baza (faqat obro_panel)"
if [ ! -f "$ENV_FILE" ]; then
  DB_PASS="$(openssl rand -hex 24)"
  SECRET="$(openssl rand -hex 48)"
  BOT_SECRET="$(openssl rand -hex 32)"
  PUBLIC_IP="${PUBLIC_IP:-$(hostname -I | awk '{print $1}')}"
  cat > "$ENV_FILE" <<EOF
DJANGO_SETTINGS_MODULE=config.settings.prod
DJANGO_SECRET_KEY=$SECRET
DATABASE_URL=postgresql://obro_panel:$DB_PASS@127.0.0.1:${PG_PORT:-5432}/obro_panel
DJANGO_ALLOWED_HOSTS=$PUBLIC_IP,localhost,127.0.0.1
HTTPS_ENABLED=0
FRONTEND_URL=http://$PUBLIC_IP:$PUBLIC_PORT
STATIC_ROOT=$ROOT/static
MEDIA_ROOT=$ROOT/media
TELEGRAM_BOT_API_SECRET=$BOT_SECRET
TELEGRAM_BOT_USERNAME=
EOF
  sudo -u postgres psql -v ON_ERROR_STOP=1 -q <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'obro_panel') THEN
    CREATE ROLE obro_panel LOGIN PASSWORD '$DB_PASS';
  ELSE
    ALTER ROLE obro_panel WITH LOGIN PASSWORD '$DB_PASS';
  END IF;
END \$\$;
SQL
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='obro_panel'" | grep -q 1 \
    || sudo -u postgres createdb -O obro_panel obro_panel
fi
chmod 600 "$ENV_FILE"
ln -sf "$ENV_FILE" "$APP/backend/.env"
# manage.py ham prod sozlamalari bilan ishlashi uchun
export DJANGO_SETTINGS_MODULE=config.settings.prod
set -a; . "$ENV_FILE"; set +a

log "Migratsiya va statik fayllar"
cd "$APP/backend"
"$VENV/bin/python" manage.py migrate --noinput -v 0
"$VENV/bin/python" manage.py collectstatic --noinput -v 0
"$VENV/bin/python" manage.py seed_obro -v 0
chown -R obro:obro "$ROOT"
chmod 600 "$ENV_FILE"

log "gunicorn xizmati (127.0.0.1:$API_PORT)"
cat > /etc/systemd/system/obro-panel-api.service <<EOF
[Unit]
Description=OBRO' Panel API (gunicorn)
After=network.target postgresql.service

[Service]
User=obro
Group=obro
WorkingDirectory=$APP/backend
EnvironmentFile=$ENV_FILE
ExecStart=$VENV/bin/gunicorn config.wsgi:application --bind 127.0.0.1:$API_PORT --workers 3 --timeout 120
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now obro-panel-api >/dev/null
systemctl restart obro-panel-api

log "nginx (port $PUBLIC_PORT, faqat yangi fayl)"
cat > /etc/nginx/sites-available/obro-panel <<EOF
server {
    listen $PUBLIC_PORT;
    listen [::]:$PUBLIC_PORT;
    server_name $SERVER_NAME;
    client_max_body_size 300m;

    root $ROOT/frontend;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:$API_PORT;
        proxy_set_header Host \$http_host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300;
    }
    location /admin/ {
        proxy_pass http://127.0.0.1:$API_PORT;
        proxy_set_header Host \$http_host;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    location /static/ { alias $ROOT/static/; expires 7d; }
    location /assets/ { expires 30d; add_header Cache-Control "public, immutable"; try_files \$uri =404; }
    location / { try_files \$uri /index.html; }
}
EOF
ln -sf /etc/nginx/sites-available/obro-panel /etc/nginx/sites-enabled/obro-panel
nginx -t
systemctl reload nginx

if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  log "ufw: $PUBLIC_PORT/tcp ochildi"
  ufw allow "$PUBLIC_PORT/tcp" >/dev/null
fi

log "Tayyor: http://<server-ip>:$PUBLIC_PORT"
