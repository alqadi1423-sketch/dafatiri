#!/usr/bin/env bash
# يجهّز ما في Cloudflare مرة واحدة ويعيد استخدامه بعدها: قاعدة البيانات ومشروع الموقع.
# يكتب wrangler.toml للنشر. يحتاج: CLOUDFLARE_API_TOKEN و CLOUDFLARE_ACCOUNT_ID.
set -euo pipefail

NAME=dafatiri
API="https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID"

cf() { # cf METHOD PATH [JSON]
  local out
  if [ -n "${3:-}" ]; then
    out=$(curl -sS -X "$1" "$API$2" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H 'Content-Type: application/json' --data "$3")
  else
    out=$(curl -sS -X "$1" "$API$2" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN")
  fi
  if [ "$(echo "$out" | jq -r '.success')" != "true" ]; then
    echo "فشل الطلب $1 $2:" >&2
    echo "$out" | jq -r '.errors[]? | "  \(.code): \(.message)"' >&2
    return 1
  fi
  echo "$out"
}

# 1) قاعدة البيانات
DB_ID=$(cf GET "/d1/database?name=$NAME" | jq -r --arg n "$NAME" '.result[] | select(.name == $n) | .uuid' | head -1)
if [ -z "$DB_ID" ]; then
  DB_ID=$(cf POST /d1/database "{\"name\":\"$NAME\"}" | jq -r '.result.uuid')
  echo "أُنشئت قاعدة البيانات"
fi

# 2) مشروع الموقع
if ! PROJ=$(cf GET "/pages/projects/$NAME" 2>/dev/null); then
  PROJ=$(cf POST /pages/projects "{\"name\":\"$NAME\",\"production_branch\":\"main\"}")
  echo "أُنشئ مشروع الموقع"
fi
HOST=$(echo "$PROJ" | jq -r '.result.subdomain')
[ -n "$HOST" ] && [ "$HOST" != "null" ] || { echo "لم يُعرف رابط الموقع"; exit 1; }

# 4) ملف النشر
cat > wrangler.toml <<EOF
name = "$NAME"
pages_build_output_dir = "public"
compatibility_date = "2026-11-01"

[[d1_databases]]
binding = "DB"
database_name = "$NAME"
database_id = "$DB_ID"
migrations_dir = "migrations"
EOF

echo "SITE_URL=https://$HOST" >> "${GITHUB_ENV:-/dev/null}"
echo "تم التجهيز: https://$HOST"
