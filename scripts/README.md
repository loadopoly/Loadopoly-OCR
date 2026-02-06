# Scripts Directory

Utility scripts for fork management and repository maintenance.

## 📋 Available Scripts

### 🔍 health-check.sh

**Purpose:** Comprehensive fork health diagnostics

**Usage:**
```bash
bash scripts/health-check.sh [branch]
```

**What it checks:**
- Repository configuration (remotes, branches)
- Working directory status (uncommitted changes, stashes)
- Synchronization status with upstream (commits ahead/behind)
- Dependencies status (node_modules, .env files)
- Recent commit history

**When to run:**
- Before syncing or resetting
- As part of regular maintenance
- When troubleshooting issues

**Output:** Detailed report with color-coded status indicators

---

### 🔄 sync-fork.sh

**Purpose:** Safely synchronize fork with upstream repository

**Usage:**
```bash
bash scripts/sync-fork.sh [branch]
```

**Features:**
- ✅ Automatically stashes uncommitted changes
- ✅ Checks for merge conflicts before merging
- ✅ Prompts before pushing to origin
- ✅ Restores stashed changes after merge
- ✅ Provides clear error messages and recovery instructions

**Safety:** Non-destructive - preserves your local changes

**When to use:**
- Fork is behind upstream
- Want to get latest updates
- Confident there won't be major conflicts

**Example output:**
```
🔄 Checking out branch: main
✅ Updated upstream remote
📥 Fetching upstream changes...
🔄 Merging upstream/main into main...
✅ Successfully merged upstream changes
Push changes to origin/main? (y/N):
```

---

### ⚠️ reset-fork.sh

**Purpose:** Force reset fork to match upstream exactly

**Usage:**
```bash
bash scripts/reset-fork.sh [branch]
```

**Features:**
- ⚠️ Requires explicit confirmation (type "RESET")
- ✅ Creates backup branch before reset
- ✅ Pushes backup to origin (if possible)
- ✅ Prompts before force pushing
- ✅ Provides recovery instructions

**Safety:** Destructive - discards all local changes!

**When to use:**
- Merge conflicts are too complex
- Want to discard all local changes
- Fork has significantly diverged
- Need to start fresh with upstream

**Backup:** Automatically creates `backup-YYYYMMDD-HHMMSS` branch

**Example output:**
```
⚠️  FORK RESET SCRIPT ⚠️
WARNING: This script will:
  1. Discard ALL local changes
  2. Reset your fork to match upstream exactly
  3. Force push to your fork (rewriting history)

Type 'RESET' (uppercase) to confirm: RESET
💾 Creating backup branch: backup-20260206-143022
✅ Backup pushed to origin/backup-20260206-143022
🔄 Resetting to upstream/main...
✅ Reset complete
```

---

## 🚀 Quick Start

```bash
# 1. Make scripts executable (first time only)
chmod +x scripts/*.sh

# 2. Check your fork's health
bash scripts/health-check.sh

# 3. Sync with upstream (safe)
bash scripts/sync-fork.sh

# 4. Reset if needed (destructive)
bash scripts/reset-fork.sh
```

## 📖 Documentation

For comprehensive documentation, see:
- [Fork Management Guide](../docs/technical/FORK_MANAGEMENT.md)
- [Quick Reference](../docs/technical/FORK_MANAGEMENT_QUICKREF.md)

## 🔧 Requirements

- **Git:** Version 2.0 or higher
- **Bash:** Version 4.0 or higher
- **Upstream remote:** Must be configured or will be added automatically

## 🛠️ Configuration

Scripts use these default values:

| Variable | Default Value |
|----------|---------------|
| `UPSTREAM_REPO` | `https://github.com/loadopoly/Loadopoly-OCR.git` |
| `BRANCH` | `main` (or specify as argument) |

To use a different branch:
```bash
bash scripts/sync-fork.sh develop
bash scripts/reset-fork.sh feature-branch
```

## ⚠️ Important Notes

### Before Running Scripts

1. **Commit or stash changes:**
   ```bash
   git add .
   git commit -m "Save changes before sync"
   # or
   git stash
   ```

2. **Check upstream configuration:**
   ```bash
   git remote -v
   ```

3. **Run health check first:**
   ```bash
   bash scripts/health-check.sh
   ```

### After Running Scripts

1. **Test your application:**
   ```bash
   npm install
   npm run build
   npm run dev
   ```

2. **Update dependencies if needed:**
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

## 🆘 Troubleshooting

### Permission Denied

```bash
chmod +x scripts/*.sh
```

### Upstream Not Configured

```bash
git remote add upstream https://github.com/loadopoly/Loadopoly-OCR.git
git fetch upstream
```

### Merge Conflicts

**Option 1 - Manual resolution:**
```bash
git merge upstream/main
# Edit files with conflicts
git add .
git commit
```

**Option 2 - Reset (discards changes):**
```bash
bash scripts/reset-fork.sh
```

### Script Hangs or Freezes

Press `Ctrl+C` to cancel, then:
```bash
# Check git status
git status

# Clean up if needed
git merge --abort
git reset --hard
```

## 🔒 Safety Features

All scripts include:
- ✅ Input validation and error checking
- ✅ Color-coded output for clarity
- ✅ Confirmation prompts for destructive operations
- ✅ Automatic backups before dangerous operations
- ✅ Clear recovery instructions
- ✅ Stash management for uncommitted changes

## 📝 Script Workflow

### Sync Workflow
```
health-check → stash changes → fetch upstream → check conflicts
    ↓
merge upstream → prompt push → restore stash → done
```

### Reset Workflow
```
health-check → create backup → push backup → fetch upstream
    ↓
reset hard → clean files → prompt force push → done
```

## 🔗 Related Resources

- [GitHub Forking Documentation](https://docs.github.com/en/get-started/quickstart/fork-a-repo)
- [Git Branching Guide](https://git-scm.com/book/en/v2/Git-Branching-Basic-Branching-and-Merging)
- [Contributing Guidelines](../README.md#contributing)

---

**Need Help?** 
- Create an issue using the [Fork Sync Issue Template](../.github/ISSUE_TEMPLATE/fork-sync-issue.md)
- See [Fork Management Guide](../docs/technical/FORK_MANAGEMENT.md) for detailed instructions
