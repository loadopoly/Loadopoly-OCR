#!/bin/bash
# health-check.sh - Diagnose fork health and synchronization status
# Usage: bash scripts/health-check.sh [branch]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
UPSTREAM_REPO="https://github.com/loadopoly/Loadopoly-OCR.git"
BRANCH="${1:-main}"

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}🔍 Fork Health Check${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${RED}❌ Error: Not in a git repository${NC}"
    exit 1
fi

echo -e "${BLUE}📊 Repository Information${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Repository location
REPO_PATH=$(git rev-parse --show-toplevel)
echo -e "📁 Location: ${CYAN}$REPO_PATH${NC}"

# Current branch
CURRENT_BRANCH=$(git branch --show-current)
echo -e "🌿 Current Branch: ${CYAN}$CURRENT_BRANCH${NC}"

# Origin remote
if git remote | grep -q "^origin$"; then
    ORIGIN_URL=$(git remote get-url origin)
    echo -e "🔗 Origin: ${CYAN}$ORIGIN_URL${NC}"
else
    echo -e "${RED}⚠️  No origin remote configured${NC}"
fi

# Upstream remote
if git remote | grep -q "^upstream$"; then
    UPSTREAM_URL=$(git remote get-url upstream)
    echo -e "🔗 Upstream: ${CYAN}$UPSTREAM_URL${NC}"
else
    echo -e "${YELLOW}⚠️  No upstream remote configured${NC}"
    echo -e "${YELLOW}   Run: git remote add upstream $UPSTREAM_REPO${NC}"
fi

echo ""
echo -e "${BLUE}📋 Working Directory Status${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Check for uncommitted changes
if git diff-index --quiet HEAD --; then
    echo -e "${GREEN}✅ Working directory is clean${NC}"
else
    echo -e "${YELLOW}⚠️  You have uncommitted changes:${NC}"
    git status --short | head -10
    CHANGES_COUNT=$(git status --short | wc -l)
    if [ "$CHANGES_COUNT" -gt 10 ]; then
        echo -e "${YELLOW}   ... and $((CHANGES_COUNT - 10)) more files${NC}"
    fi
fi

# Check for untracked files
UNTRACKED_COUNT=$(git ls-files --others --exclude-standard | wc -l)
if [ "$UNTRACKED_COUNT" -gt 0 ]; then
    echo -e "${YELLOW}⚠️  $UNTRACKED_COUNT untracked files${NC}"
fi

# Check for stashed changes
STASH_COUNT=$(git stash list | wc -l)
if [ "$STASH_COUNT" -gt 0 ]; then
    echo -e "${YELLOW}ℹ️  $STASH_COUNT stashed changes${NC}"
fi

echo ""
echo -e "${BLUE}🔄 Synchronization Status${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Fetch upstream if it exists
if git remote | grep -q "^upstream$"; then
    echo -e "${CYAN}Fetching upstream...${NC}"
    git fetch upstream --quiet
    
    # Check if branch exists
    if ! git show-ref --verify --quiet "refs/heads/$BRANCH"; then
        echo -e "${RED}❌ Branch '$BRANCH' does not exist locally${NC}"
        exit 1
    fi
    
    # Check if upstream branch exists
    if ! git ls-remote --heads upstream "$BRANCH" | grep -q "$BRANCH"; then
        echo -e "${RED}❌ Upstream branch '$BRANCH' does not exist${NC}"
        exit 1
    fi
    
    # Get commit information
    LOCAL_COMMIT=$(git rev-parse "$BRANCH")
    UPSTREAM_COMMIT=$(git rev-parse "upstream/$BRANCH")
    
    echo -e "Local commit:    ${CYAN}${LOCAL_COMMIT:0:12}${NC}"
    echo -e "Upstream commit: ${CYAN}${UPSTREAM_COMMIT:0:12}${NC}"
    echo ""
    
    # Check if up to date
    if [ "$LOCAL_COMMIT" = "$UPSTREAM_COMMIT" ]; then
        echo -e "${GREEN}✅ Fork is UP TO DATE with upstream/$BRANCH${NC}"
    else
        # Check how far behind/ahead
        BEHIND=$(git rev-list --count HEAD..upstream/$BRANCH)
        AHEAD=$(git rev-list --count upstream/$BRANCH..HEAD)
        
        if [ "$BEHIND" -gt 0 ]; then
            echo -e "${YELLOW}⚠️  Fork is $BEHIND commit(s) BEHIND upstream/$BRANCH${NC}"
        fi
        
        if [ "$AHEAD" -gt 0 ]; then
            echo -e "${YELLOW}ℹ️  Fork is $AHEAD commit(s) AHEAD of upstream/$BRANCH${NC}"
        fi
        
        # Check for divergence
        MERGE_BASE=$(git merge-base HEAD "upstream/$BRANCH" 2>/dev/null || echo "")
        if [ -n "$MERGE_BASE" ] && [ "$AHEAD" -gt 0 ] && [ "$BEHIND" -gt 0 ]; then
            echo -e "${YELLOW}⚠️  Fork has DIVERGED from upstream${NC}"
        fi
    fi
else
    echo -e "${YELLOW}⚠️  Upstream not configured - cannot check sync status${NC}"
fi

echo ""
echo -e "${BLUE}🔍 Recent Commits${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
git log --oneline --graph --decorate -10

echo ""
echo -e "${BLUE}📦 Dependencies & Build${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Check for package.json
if [ -f "package.json" ]; then
    echo -e "${GREEN}✅ package.json found${NC}"
    
    # Check if node_modules exists
    if [ -d "node_modules" ]; then
        echo -e "${GREEN}✅ node_modules directory exists${NC}"
    else
        echo -e "${YELLOW}⚠️  node_modules not found - run 'npm install'${NC}"
    fi
    
    # Check for lock file
    if [ -f "package-lock.json" ]; then
        echo -e "${GREEN}✅ package-lock.json found${NC}"
    else
        echo -e "${YELLOW}⚠️  package-lock.json not found${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  package.json not found${NC}"
fi

# Check for .env files
if [ -f ".env.local" ] || [ -f ".env" ]; then
    echo -e "${GREEN}✅ Environment configuration found${NC}"
else
    if [ -f ".env.example" ]; then
        echo -e "${YELLOW}⚠️  No .env file found - copy .env.example to .env.local${NC}"
    else
        echo -e "${YELLOW}⚠️  No environment configuration found${NC}"
    fi
fi

echo ""
echo -e "${BLUE}💡 Recommendations${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if git remote | grep -q "^upstream$"; then
    if [ "$LOCAL_COMMIT" != "$UPSTREAM_COMMIT" ]; then
        echo -e "${YELLOW}📌 Your fork is out of sync. Options:${NC}"
        echo ""
        echo -e "${CYAN}1. Sync with upstream (preserves local changes):${NC}"
        echo "   bash scripts/sync-fork.sh $BRANCH"
        echo ""
        echo -e "${CYAN}2. Reset to upstream (discards local changes):${NC}"
        echo "   bash scripts/reset-fork.sh $BRANCH"
        echo ""
    else
        echo -e "${GREEN}✅ Your fork is healthy and up to date!${NC}"
    fi
else
    echo -e "${YELLOW}📌 Setup upstream remote:${NC}"
    echo "   git remote add upstream $UPSTREAM_REPO"
    echo "   git fetch upstream"
fi

if ! git diff-index --quiet HEAD --; then
    echo -e "${YELLOW}📌 Commit or stash your changes before syncing:${NC}"
    echo "   git add ."
    echo "   git commit -m 'Your message'"
    echo "   or"
    echo "   git stash"
fi

if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📌 Install dependencies:${NC}"
    echo "   npm install"
fi

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}✅ Health check complete!${NC}"
echo -e "${CYAN}========================================${NC}"
