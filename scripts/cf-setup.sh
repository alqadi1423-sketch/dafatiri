#!/usr/bin/env bash
# يجهّز كل ما في Cloudflare مرة واحدة ويعيد استخدامه بعدها: قاعدة البيانات، مشروع الموقع، حماية الدخول.
# يكتب wrangler.toml للنشر. يحتاج: CLOUDFLARE_API_TOKEN، CLOUDFLARE_ACCOUNT_ID، OWNER_EMAIL.
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

# 3) حماية الدخول (Cloudflare Access)
if ! ORG=$(cf GET /access/organizations 2>/dev/null); then
  echo "::error::لم يُفعَّل Zero Trust في حسابك بعد. فعّله مرة واحدة من لوحة Cloudflare ثم أعد التشغيل."
  exit 1
fi
TEAM=$(echo "$ORG" | jq -r '.result.auth_domain')
[ -n "$TEAM" ] && [ "$TEAM" != "null" ] || { echo "::error::لم يُعرف نطاق الفريق في Zero Trust"; exit 1; }

# الدخول برمز يصل للبريد
if [ -z "$(cf GET /access/identity_providers | jq -r '.result[] | select(.type == "onetimepin") | .id' | head -1)" ]; then
  cf POST /access/identity_providers '{"name":"رمز البريد","type":"onetimepin","config":{}}' > /dev/null
  echo "فُعّل الدخول برمز البريد"
fi

# السياسة: كل من يثبت ملكية بريده يمر من البوابة، والموقع نفسه لا يعرض له شيئًا
# إلا إن كان المالك أو ربطتَ بريده بحساب. فتضيف أفراد العائلة من داخل الموقع دون لمس Cloudflare.
POLICY_ID=$(cf GET /access/policies | jq -r '.result[] | select(.name == "dafatiri-allow") | .id' | head -1)
if [ -z "$POLICY_ID" ]; then
  POLICY_ID=$(cf POST /access/policies '{"name":"dafatiri-allow","decision":"allow","include":[{"everyone":{}}],"session_duration":"720h"}' | jq -r '.result.id')
fi

APP=$(cf GET /access/apps | jq -c --arg n "$NAME" '[.result[] | select(.name == $n)][0] // empty')
APP_BODY=$(jq -nc --arg n "$NAME" --arg h "$HOST" --arg p "$POLICY_ID" '{
  name: $n, type: "self_hosted", domain: $h,
  self_hosted_domains: [$h, ("*." + $h)],
  session_duration: "720h", app_launcher_visible: false,
  auto_redirect_to_identity: true,
  policies: [{id: $p, precedence: 1}]
}')
if [ -z "$APP" ]; then
  APP=$(cf POST /access/apps "$APP_BODY" | jq -c '.result')
  echo "فُعّلت حماية الدخول على $HOST"
else
  APP=$(cf PUT "/access/apps/$(echo "$APP" | jq -r '.id')" "$APP_BODY" | jq -c '.result')
fi
AUD=$(echo "$APP" | jq -r '.aud')

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

[vars]
OWNER_EMAIL = "$(echo "$OWNER_EMAIL" | tr '[:upper:]' '[:lower:]' | tr -d '"\\')"
ACCESS_TEAM_DOMAIN = "https://$TEAM"
ACCESS_AUD = "$AUD"
EOF

echo "SITE_URL=https://$HOST" >> "${GITHUB_ENV:-/dev/null}"
echo "تم التجهيز: https://$HOST"
