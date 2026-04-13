#!/usr/bin/env bash
# ============================================================
#  GeoGraph OCR — Vercel Environment Variables Setup Script
#
#  Usage (two ways):
#
#  Way 1 — inline:
#    VERCEL_TOKEN=xxx \
#    TWITTER_API_KEY=xxx \
#    TWITTER_API_SECRET=xxx \
#    TWITTER_ACCESS_TOKEN=xxx \
#    TWITTER_ACCESS_TOKEN_SECRET=xxx \
#    REDDIT_CLIENT_ID=xxx \
#    REDDIT_CLIENT_SECRET=xxx \
#    REDDIT_USERNAME=xxx \
#    REDDIT_PASSWORD=xxx \
#    ./scripts/setup-vercel-env.sh
#
#  Way 2 — fill in the variables below, then run:
#    chmod +x scripts/setup-vercel-env.sh
#    ./scripts/setup-vercel-env.sh
# ============================================================
set -euo pipefail

# ── Fill these in (or pass as env vars — shell vars above take precedence) ────
: "${VERCEL_TOKEN:=""}"                # https://vercel.com/account/tokens
: "${TWITTER_API_KEY:=""}"             # Keys and Tokens tab (OAuth 1.0a — NOT OAuth 2.0 Client ID)
: "${TWITTER_API_SECRET:=""}"
: "${TWITTER_ACCESS_TOKEN:=""}"        # Generate with Read+Write permission
: "${TWITTER_ACCESS_TOKEN_SECRET:=""}"
: "${REDDIT_CLIENT_ID:=""}"            # 14-char code under app name (script type app)
: "${REDDIT_CLIENT_SECRET:=""}"
: "${REDDIT_USERNAME:=""}"             # No u/
: "${REDDIT_PASSWORD:=""}"
: "${REDDIT_USER_AGENT:="GeoGraphOCR/1.0 by u/${REDDIT_USERNAME:-yourhandle}"}"
# ────────────────────────────────────────────────────────────

# Pre-generated — do not change
SOCIAL_LAUNCH_SECRET="e57d5e0baa21aa520101e66b28cc73ac7beebe121d3de458b88cb84dfbffd044"

# ── Validate ─────────────────────────────────────────────────
if [[ -z "$VERCEL_TOKEN" ]]; then
  echo "ERROR: Set VERCEL_TOKEN above (https://vercel.com/account/tokens)"
  exit 1
fi

missing=()
[[ -z "$TWITTER_API_KEY" ]] && missing+=("TWITTER_API_KEY")
[[ -z "$TWITTER_API_SECRET" ]] && missing+=("TWITTER_API_SECRET")
[[ -z "$TWITTER_ACCESS_TOKEN" ]] && missing+=("TWITTER_ACCESS_TOKEN")
[[ -z "$TWITTER_ACCESS_TOKEN_SECRET" ]] && missing+=("TWITTER_ACCESS_TOKEN_SECRET")
[[ -z "$REDDIT_CLIENT_ID" ]] && missing+=("REDDIT_CLIENT_ID")
[[ -z "$REDDIT_CLIENT_SECRET" ]] && missing+=("REDDIT_CLIENT_SECRET")
[[ -z "$REDDIT_USERNAME" ]] && missing+=("REDDIT_USERNAME")
[[ -z "$REDDIT_PASSWORD" ]] && missing+=("REDDIT_PASSWORD")
if [[ ${#missing[@]} -gt 0 ]]; then
  echo "ERROR: Missing values: ${missing[*]}"
  exit 1
fi

# ── Discover Vercel project ID ────────────────────────────────
echo "🔍 Finding Vercel project..."
PROJECTS=$(curl -sf "https://api.vercel.com/v9/projects" \
  -H "Authorization: Bearer ${VERCEL_TOKEN}" \
  -H "Content-Type: application/json")

PROJECT_ID=$(echo "$PROJECTS" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for p in data.get('projects', []):
    # Match by repo name or known domain URL pattern
    name = p.get('name','')
    if 'geograph' in name.lower():
        print(p['id'])
        break
" 2>/dev/null)

if [[ -z "$PROJECT_ID" ]]; then
  echo "Could not auto-detect project. Listing all projects:"
  echo "$PROJECTS" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for p in data.get('projects', []):
    print(f\"  {p['id']}  {p['name']}\")
"
  echo ""
  printf "Enter your Vercel project ID from the list above: "
  read -r PROJECT_ID
fi

echo "✅ Project ID: $PROJECT_ID"

# ── Set environment variables ─────────────────────────────────
declare -A VARS=(
  [SOCIAL_LAUNCH_SECRET]="$SOCIAL_LAUNCH_SECRET"
  [TWITTER_API_KEY]="$TWITTER_API_KEY"
  [TWITTER_API_SECRET]="$TWITTER_API_SECRET"
  [TWITTER_ACCESS_TOKEN]="$TWITTER_ACCESS_TOKEN"
  [TWITTER_ACCESS_TOKEN_SECRET]="$TWITTER_ACCESS_TOKEN_SECRET"
  [REDDIT_CLIENT_ID]="$REDDIT_CLIENT_ID"
  [REDDIT_CLIENT_SECRET]="$REDDIT_CLIENT_SECRET"
  [REDDIT_USERNAME]="$REDDIT_USERNAME"
  [REDDIT_PASSWORD]="$REDDIT_PASSWORD"
  [REDDIT_USER_AGENT]="$REDDIT_USER_AGENT"
)

echo ""
echo "📦 Setting environment variables..."

SUCCESS=0
FAIL=0

for KEY in "${!VARS[@]}"; do
  VALUE="${VARS[$KEY]}"
  # First remove any existing value (ignore errors)
  curl -sf -X DELETE \
    "https://api.vercel.com/v10/projects/${PROJECT_ID}/env?key=${KEY}&target=production" \
    -H "Authorization: Bearer ${VERCEL_TOKEN}" > /dev/null 2>&1 || true

  RESP=$(curl -sf -X POST \
    "https://api.vercel.com/v10/projects/${PROJECT_ID}/env" \
    -H "Authorization: Bearer ${VERCEL_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{
      \"key\": \"${KEY}\",
      \"value\": $(python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "${VALUE}"),
      \"target\": [\"production\", \"preview\"],
      \"type\": \"encrypted\"
    }" 2>&1)

  if echo "$RESP" | grep -q '"id"'; then
    echo "  ✅ $KEY"
    ((SUCCESS++)) || true
  else
    echo "  ❌ $KEY — $RESP"
    ((FAIL++)) || true
  fi
done

echo ""
echo "Result: $SUCCESS set, $FAIL failed"

# ── Trigger redeploy ──────────────────────────────────────────
if [[ $FAIL -eq 0 ]]; then
  echo ""
  echo "🚀 Triggering production redeploy..."
  DEPLOY_RESP=$(curl -sf -X POST \
    "https://api.vercel.com/v13/deployments" \
    -H "Authorization: Bearer ${VERCEL_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{
      \"name\": \"geographocrnode\",
      \"target\": \"production\",
      \"gitSource\": {
        \"type\": \"github\",
        \"repoId\": $(curl -sf "https://api.github.com/repos/loadopoly/Loadopoly-OCR" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])"),
        \"ref\": \"main\"
      }
    }" 2>&1)

  DEPLOY_URL=$(echo "$DEPLOY_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('url',''))" 2>/dev/null)
  if [[ -n "$DEPLOY_URL" ]]; then
    echo "  ✅ Deploying: https://${DEPLOY_URL}"
  else
    echo "  ℹ️  Couldn't trigger redeploy automatically."
    echo "  → Go to Vercel Dashboard → Deployments → Redeploy latest"
  fi
fi

echo ""
echo "──────────────────────────────────────────────────────────"
echo "Once redeploy completes, trigger the social launch with:"
echo ""
echo "  curl -X POST https://geographocrnode.vercel.app/api/social/launch \\"
echo "    -H \"Authorization: Bearer ${SOCIAL_LAUNCH_SECRET}\""
echo "──────────────────────────────────────────────────────────"
