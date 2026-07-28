#!/bin/sh
set -e

CONFIG_FILE="/usr/share/nginx/html/assets/env-config.js"

if [ -n "$APP_PASSWORD" ]; then
	HASH=$(printf '%s' "$APP_PASSWORD" | sha256sum | awk '{print $1}')
else
	HASH=""
fi

cat > "$CONFIG_FILE" <<EOF
window.APP_PASSWORD_HASH = "${HASH}";
EOF

exec nginx -g 'daemon off;'
