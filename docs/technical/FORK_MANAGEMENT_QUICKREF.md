# Fork Management Quick Reference

Quick commands for managing your Loadopoly-OCR fork.

## 🚀 Quick Start

```bash
# 1. Check fork health
bash scripts/health-check.sh

# 2. Sync with upstream (safe, preserves changes)
bash scripts/sync-fork.sh

# 3. Reset to upstream (⚠️ discards changes)
bash scripts/reset-fork.sh
```

## 📋 Scripts Overview

| Script | Purpose | Safety | When to Use |
|--------|---------|--------|-------------|
| `health-check.sh` | Diagnose fork status | ✅ Read-only | Before any operation |
| `sync-fork.sh` | Merge upstream changes | ✅ Safe | Regular updates |
| `reset-fork.sh` | Force reset to upstream | ⚠️ Destructive | Complex conflicts |

## 🤖 GitHub Actions

### Fork Sync (Automated)
- **Trigger:** Manual or weekly (Sundays)
- **Safe:** Yes, creates issue if conflicts
- **Location:** Actions → Fork Sync with Upstream

### Fork Reset (Manual Only)
- **Trigger:** Manual with `RESET` confirmation
- **Safe:** Creates backup, but destructive
- **Location:** Actions → Fork Reset (Force Sync)

## 🆘 Common Issues

### Fork is Behind Upstream
```bash
bash scripts/sync-fork.sh
```

### Merge Conflicts
**Option 1 - Resolve Manually:**
```bash
git merge upstream/main
# Edit files, resolve conflicts
git add . && git commit
```

**Option 2 - Reset:**
```bash
bash scripts/reset-fork.sh
```

### Upstream Not Configured
```bash
git remote add upstream https://github.com/loadopoly/Loadopoly-OCR.git
git fetch upstream
```

### Uncommitted Changes
```bash
git add . && git commit -m "Save changes"
# or
git stash
```

### Script Permission Denied
```bash
chmod +x scripts/*.sh
```

## 📊 Check Fork Status

```bash
# Full health report
bash scripts/health-check.sh

# Quick Git status
git fetch upstream
git log --oneline HEAD..upstream/main  # Commits you're missing
git log --oneline upstream/main..HEAD  # Your extra commits
```

## 🔄 Sync Workflow

```bash
# 1. Check current status
bash scripts/health-check.sh

# 2. Commit or stash local changes
git add . && git commit -m "WIP"

# 3. Sync
bash scripts/sync-fork.sh

# 4. Test
npm install && npm run build

# 5. Push
git push origin main
```

## ⚠️ Reset Workflow (Destructive)

```bash
# 1. Ensure you really want to discard changes
bash scripts/health-check.sh

# 2. Reset (creates backup automatically)
bash scripts/reset-fork.sh

# 3. Confirm with "RESET"

# 4. Force push (script prompts)

# 5. Update local clone
git fetch origin
git reset --hard origin/main
```

## 🔍 Recovery

### Restore from Backup Branch
```bash
# List backup branches
git branch -a | grep backup

# Cherry-pick commits
git cherry-pick <commit-hash>

# Or merge entire backup
git merge backup-20260206-143022
```

### Restore from GitHub
```bash
# View branches on GitHub
gh repo view --web

# Restore from specific commit
git reset --hard <commit-hash>
git push --force origin main
```

## 📖 Full Documentation

See [FORK_MANAGEMENT.md](./FORK_MANAGEMENT.md) for complete guide.

## 🔗 Useful Commands

```bash
# View remotes
git remote -v

# View branches
git branch -a

# View recent commits
git log --oneline -10

# View uncommitted changes
git status

# View difference with upstream
git diff upstream/main

# Fetch without merging
git fetch upstream
```

---

**💡 Tip:** Run `bash scripts/health-check.sh` weekly to stay informed about fork status.
