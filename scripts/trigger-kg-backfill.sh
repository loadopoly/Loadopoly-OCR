#!/bin/bash
# =============================================================================
# Trigger Knowledge Graph Backfill Manually
# =============================================================================
# This script manually triggers the kg-backfill Edge Function to process
# a batch of existing assets and extract entities/relationships.
#
# Usage:
#   export SUPABASE_URL="https://<YOUR_PROJECT_REF>.supabase.co"
#   export SUPABASE_ANON_KEY="<YOUR_ANON_KEY>"
#   ./scripts/trigger-kg-backfill.sh
# =============================================================================

if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_ANON_KEY" ]; then
  echo "Error: SUPABASE_URL and SUPABASE_ANON_KEY environment variables must be set."
  echo "Example:"
  echo "  export SUPABASE_URL=\"https://kuofzhrrpgimtomgact.supabase.co\""
  echo "  export SUPABASE_ANON_KEY=\"eyJhbGciOi...\""
  echo "  ./scripts/trigger-kg-backfill.sh"
  exit 1
fi

echo "Triggering Knowledge Graph Backfill..."
echo "Target: ${SUPABASE_URL}/functions/v1/kg-backfill"

curl -i --request POST "${SUPABASE_URL}/functions/v1/kg-backfill" \
  --header "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  --header "Content-Type: application/json" \
  --data '{"batchSize": 50, "onlyUnprocessed": true}'

echo -e "\n\nDone."
