#!/bin/bash
# sync-fork.sh - Synchronize fork with upstream repository
# Usage: bash scripts/sync-fork.sh [branch]

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

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Fork Synchronization Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${RED}❌ Error: Not in a git repository${NC}"
    exit 1
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

# Save any uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo -e "${YELLOW}⚠️  Uncommitted changes detected. Stashing...${NC}"
    git stash push -m "Auto-stash before fork sync $(date +%Y-%m-%d_%H-%M-%S)"
    STASHED=true
else
    STASHED=false
fi

# Add or update upstream remote
echo -e "${BLUE}🔗 Setting up upstream remote...${NC}"
if git remote | grep -q "^upstream$"; then
    git remote set-url upstream "$UPSTREAM_REPO"
    echo -e "${GREEN}✅ Updated upstream remote${NC}"
else
    git remote add upstream "$UPSTREAM_REPO"
    echo -e "${GREEN}✅ Added upstream remote${NC}"
fi

# Fetch upstream changes
echo -e "${BLUE}📥 Fetching upstream changes...${NC}"
git fetch upstream

# Check if upstream branch exists
if ! git ls-remote --heads upstream "$BRANCH" | grep -q "$BRANCH"; then
    echo -e "${RED}❌ Error: Upstream branch '$BRANCH' does not exist${NC}"
    exit 1
fi

# Check for divergence
LOCAL_COMMIT=$(git rev-parse HEAD)
UPSTREAM_COMMIT=$(git rev-parse "upstream/$BRANCH")

if [ "$LOCAL_COMMIT" = "$UPSTREAM_COMMIT" ]; then
    echo -e "${GREEN}✅ Fork is already up to date with upstream${NC}"
    if [ "$STASHED" = true ]; then
        echo -e "${YELLOW}⚠️  Restoring stashed changes...${NC}"
        git stash pop
    fi
    exit 0
fi

# Check for merge conflicts
echo -e "${BLUE}🔍 Checking for potential merge conflicts...${NC}"
MERGE_BASE=$(git merge-base HEAD "upstream/$BRANCH")
if git merge-tree "$MERGE_BASE" HEAD "upstream/$BRANCH" | grep -q "^<<<<<"; then
    echo -e "${RED}⚠️  Merge conflicts detected!${NC}"
    echo ""
    echo -e "${YELLOW}You have two options:${NC}"
    echo ""
    echo -e "${YELLOW}1. Manually resolve conflicts (recommended if you have custom changes):${NC}"
    echo "   git merge upstream/$BRANCH"
    echo "   # Resolve conflicts in your editor"
    echo "   git add ."
    echo "   git commit"
    echo "   git push origin $BRANCH"
    echo ""
    echo -e "${YELLOW}2. Force reset to upstream (WARNING: discards all local changes):${NC}"
    echo "   bash scripts/reset-fork.sh $BRANCH"
    echo ""
    
    if [ "$STASHED" = true ]; then
        echo -e "${YELLOW}⚠️  Note: Your uncommitted changes are stashed. Use 'git stash pop' to restore them.${NC}"
    fi
    exit 1
fi

# Merge upstream changes
echo -e "${BLUE}🔄 Merging upstream/$BRANCH into $BRANCH...${NC}"
git merge "upstream/$BRANCH" --no-edit

echo -e "${GREEN}✅ Successfully merged upstream changes${NC}"

# Ask before pushing
echo ""
read -p "Push changes to origin/$BRANCH? (y/N): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}📤 Pushing to origin/$BRANCH...${NC}"
    git push origin "$BRANCH"
    echo -e "${GREEN}✅ Successfully pushed to origin${NC}"
else
    echo -e "${YELLOW}⚠️  Changes merged locally but not pushed. Use 'git push origin $BRANCH' to push later.${NC}"
fi

# Restore stashed changes
if [ "$STASHED" = true ]; then
    echo ""
    echo -e "${YELLOW}⚠️  Restoring stashed changes...${NC}"
    if git stash pop; then
        echo -e "${GREEN}✅ Stashed changes restored${NC}"
    else
        echo -e "${RED}⚠️  Conflict while restoring stash. Resolve manually with 'git stash pop'${NC}"
    fi
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ Fork synchronization completed!${NC}"
echo -e "${GREEN}========================================${NC}"
