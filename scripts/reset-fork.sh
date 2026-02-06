#!/bin/bash
# reset-fork.sh - Reset fork to match upstream repository exactly
# Usage: bash scripts/reset-fork.sh [branch]
# WARNING: This will discard ALL local changes!

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
UPSTREAM_REPO="https://github.com/loadopoly/Loadopoly-OCR.git"
BRANCH="${1:-main}"

echo -e "${RED}========================================${NC}"
echo -e "${RED}⚠️  FORK RESET SCRIPT ⚠️${NC}"
echo -e "${RED}========================================${NC}"
echo ""
echo -e "${RED}WARNING: This script will:${NC}"
echo -e "${RED}  1. Discard ALL local changes${NC}"
echo -e "${RED}  2. Reset your fork to match upstream exactly${NC}"
echo -e "${RED}  3. Force push to your fork (rewriting history)${NC}"
echo ""
echo -e "${YELLOW}A backup will be created before resetting.${NC}"
echo ""

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${RED}❌ Error: Not in a git repository${NC}"
    exit 1
fi

# Confirmation prompt
read -p "Type 'RESET' (uppercase) to confirm: " -r
echo ""
if [ "$REPLY" != "RESET" ]; then
    echo -e "${YELLOW}⚠️  Reset cancelled${NC}"
    exit 0
fi

echo -e "${YELLOW}📋 Configuration:${NC}"
echo "   Repository: $(git remote get-url origin 2>/dev/null || echo 'Not set')"
echo "   Branch: $BRANCH"
echo "   Upstream: $UPSTREAM_REPO"
echo ""

# Ensure we're on the correct branch
echo -e "${BLUE}🔄 Checking out branch: $BRANCH${NC}"
if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
    git checkout "$BRANCH"
else
    echo -e "${RED}❌ Error: Branch '$BRANCH' does not exist${NC}"
    exit 1
fi

# Create backup branch
BACKUP_BRANCH="backup-$(date +%Y%m%d-%H%M%S)"
echo -e "${BLUE}💾 Creating backup branch: $BACKUP_BRANCH${NC}"
git checkout -b "$BACKUP_BRANCH"

# Try to push backup to origin
if git remote | grep -q "^origin$"; then
    echo -e "${BLUE}📤 Pushing backup to origin...${NC}"
    if git push origin "$BACKUP_BRANCH"; then
        echo -e "${GREEN}✅ Backup pushed to origin/$BACKUP_BRANCH${NC}"
    else
        echo -e "${YELLOW}⚠️  Could not push backup (continuing anyway)${NC}"
    fi
fi

# Switch back to main branch
git checkout "$BRANCH"

# Add or update upstream remote
echo -e "${BLUE}🔗 Setting up upstream remote...${NC}"
if git remote | grep -q "^upstream$"; then
    git remote set-url upstream "$UPSTREAM_REPO"
else
    git remote add upstream "$UPSTREAM_REPO"
fi

# Fetch upstream
echo -e "${BLUE}📥 Fetching upstream changes...${NC}"
git fetch upstream

# Check if upstream branch exists
if ! git ls-remote --heads upstream "$BRANCH" | grep -q "$BRANCH"; then
    echo -e "${RED}❌ Error: Upstream branch '$BRANCH' does not exist${NC}"
    exit 1
fi

# Reset to upstream
echo -e "${RED}🔄 Resetting to upstream/$BRANCH...${NC}"
git reset --hard "upstream/$BRANCH"
echo -e "${GREEN}✅ Reset complete${NC}"

# Clean untracked files
echo -e "${BLUE}🧹 Cleaning untracked files...${NC}"
git clean -fd
echo -e "${GREEN}✅ Cleaned untracked files${NC}"

# Ask before force pushing
echo ""
echo -e "${YELLOW}⚠️  Ready to force push to origin/$BRANCH${NC}"
read -p "Continue with force push? (y/N): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}📤 Force pushing to origin/$BRANCH...${NC}"
    git push --force origin "$BRANCH"
    echo -e "${GREEN}✅ Successfully force pushed to origin${NC}"
else
    echo -e "${YELLOW}⚠️  Reset complete locally but not pushed.${NC}"
    echo -e "${YELLOW}   Use 'git push --force origin $BRANCH' to push later.${NC}"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ Fork reset completed!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}📋 Next Steps:${NC}"
echo ""
echo -e "${YELLOW}Your fork has been reset to match upstream exactly.${NC}"
echo ""
echo -e "${YELLOW}Backup branch: $BACKUP_BRANCH${NC}"
echo -e "${YELLOW}To recover specific commits from backup:${NC}"
echo "   git cherry-pick <commit-hash>"
echo ""
echo -e "${YELLOW}To delete backup branch (after verifying everything works):${NC}"
echo "   git branch -D $BACKUP_BRANCH"
echo "   git push origin --delete $BACKUP_BRANCH"
echo ""
