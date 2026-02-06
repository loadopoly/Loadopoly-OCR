# Fork Management Guide

This guide explains how to manage your fork of the Loadopoly-OCR repository, including synchronization with upstream, troubleshooting, and reset procedures.

## Table of Contents

- [Overview](#overview)
- [Automated Solutions](#automated-solutions)
  - [GitHub Actions Workflows](#github-actions-workflows)
  - [Manual Scripts](#manual-scripts)
- [Common Scenarios](#common-scenarios)
- [Troubleshooting](#troubleshooting)
- [Advanced Topics](#advanced-topics)

---

## Overview

When you fork the Loadopoly-OCR repository, you create an independent copy. Over time, your fork may become out of sync with the original (upstream) repository as new features, bug fixes, and improvements are added.

This guide provides multiple ways to keep your fork synchronized:

1. **Automated GitHub Actions workflows** (runs in the cloud)
2. **Manual scripts** (runs on your local machine)
3. **Manual Git commands** (for advanced users)

---

## Automated Solutions

### GitHub Actions Workflows

#### 1. Fork Sync Workflow (`fork-sync.yml`)

Automatically synchronizes your fork with upstream weekly, or on-demand.

**Features:**
- ✅ Runs automatically every Sunday at midnight UTC
- ✅ Can be triggered manually from GitHub Actions tab
- ✅ Detects merge conflicts before attempting merge
- ✅ Creates GitHub issue if conflicts are detected
- ✅ Safe - won't force push or lose data

**How to use:**

1. Navigate to your fork on GitHub
2. Click **Actions** tab
3. Select **Fork Sync with Upstream** workflow
4. Click **Run workflow** button
5. Wait for completion (check the status)

**When it runs automatically:**
- Every Sunday at midnight UTC
- After pushing to the main branch (for testing)

**What it does:**
1. Fetches latest changes from `loadopoly/Loadopoly-OCR`
2. Checks for merge conflicts
3. If no conflicts: merges and pushes automatically
4. If conflicts detected: creates an issue with resolution instructions

#### 2. Fork Reset Workflow (`fork-reset.yml`)

Force resets your fork to match upstream exactly. **⚠️ WARNING: This discards all local changes!**

**Features:**
- ✅ Requires explicit confirmation (`RESET`)
- ✅ Creates automatic backup branch before reset
- ✅ Force pushes reset state to your fork
- ✅ Creates GitHub issue with recovery instructions

**How to use:**

1. Navigate to your fork on GitHub
2. Click **Actions** tab
3. Select **Fork Reset (Force Sync)** workflow
4. Click **Run workflow** button
5. Type `RESET` in the confirmation field (case-sensitive)
6. Optionally specify a branch (default: `main`)
7. Click **Run workflow**

**When to use:**
- Your fork has complex merge conflicts
- You want to start fresh with upstream code
- You accidentally committed sensitive data
- Your fork is significantly diverged and manual merge is too complex

**What it does:**
1. Creates backup branch (e.g., `backup-20260206-143022`)
2. Resets your branch to match `upstream/main` exactly
3. Force pushes the reset to your fork
4. Creates issue with recovery instructions

---

### Manual Scripts

Three bash scripts are provided in the `scripts/` directory for local fork management.

#### 1. Health Check Script

**Purpose:** Diagnose fork status and identify issues.

```bash
bash scripts/health-check.sh [branch]
```

**What it checks:**
- ✅ Repository configuration (origin/upstream remotes)
- ✅ Current branch and working directory status
- ✅ Sync status with upstream (commits ahead/behind)
- ✅ Uncommitted changes, untracked files, stashes
- ✅ Dependencies status (node_modules, .env files)
- ✅ Recent commit history

**Output example:**
```
🔍 Fork Health Check
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Repository Information
📁 Location: /home/user/Loadopoly-OCR
🌿 Current Branch: main
🔗 Origin: https://github.com/yourname/Loadopoly-OCR.git
🔗 Upstream: https://github.com/loadopoly/Loadopoly-OCR.git

📋 Working Directory Status
✅ Working directory is clean

🔄 Synchronization Status
⚠️  Fork is 15 commit(s) BEHIND upstream/main
```

**When to use:**
- Before syncing or resetting
- To check if your fork needs updates
- To diagnose issues with dependencies
- As part of regular maintenance

#### 2. Sync Fork Script

**Purpose:** Safely merge upstream changes into your fork while preserving local changes.

```bash
bash scripts/sync-fork.sh [branch]
```

**Features:**
- ✅ Automatically stashes uncommitted changes
- ✅ Checks for merge conflicts before merging
- ✅ Prompts before pushing to origin
- ✅ Restores stashed changes after merge
- ✅ Provides clear instructions if conflicts detected

**Example workflow:**
```bash
# Check fork status first
bash scripts/health-check.sh

# Sync with upstream
bash scripts/sync-fork.sh main
# Output: Prompts if you want to push (y/N)

# If conflicts are detected, you'll see:
⚠️ Merge conflicts detected!

You have two options:
1. Manually resolve conflicts (recommended)
2. Force reset to upstream (discards local changes)
```

**When to use:**
- Your fork is behind upstream
- You want to preserve your local changes
- You're confident there won't be major conflicts

#### 3. Reset Fork Script

**Purpose:** Completely reset your fork to match upstream. **⚠️ Destructive operation!**

```bash
bash scripts/reset-fork.sh [branch]
```

**Safety features:**
- ⚠️ Requires typing `RESET` (uppercase) to confirm
- ✅ Creates backup branch before reset
- ✅ Pushes backup to origin (if possible)
- ✅ Prompts before force pushing
- ✅ Provides recovery instructions

**Example workflow:**
```bash
bash scripts/reset-fork.sh main

# You'll see:
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

**When to use:**
- Merge conflicts are too complex to resolve manually
- You want to discard all local changes
- You need to start fresh with upstream code
- Your fork has significant divergence

**After running:**
- Your local branch matches upstream exactly
- Backup branch preserves your old state
- You can cherry-pick specific commits from backup if needed

---

## Common Scenarios

### Scenario 1: Fork is Out of Date (No Local Changes)

**Situation:** You haven't made any custom changes, just want latest upstream code.

**Solution:**
```bash
# Check status
bash scripts/health-check.sh

# If behind upstream, sync
bash scripts/sync-fork.sh main
```

### Scenario 2: Fork is Out of Date (With Local Changes)

**Situation:** You have local changes you want to keep, but need upstream updates.

**Solution:**
```bash
# Commit your changes first
git add .
git commit -m "My local changes"

# Sync with upstream
bash scripts/sync-fork.sh main

# If successful, push
git push origin main
```

### Scenario 3: Merge Conflicts Detected

**Situation:** Sync script detects conflicts between your changes and upstream.

**Solution Option A - Manual Resolution (Recommended):**
```bash
# Start the merge
git merge upstream/main

# Git will show conflicts, edit files marked with <<<<<<< HEAD
# After resolving conflicts:
git add .
git commit -m "Resolve merge conflicts with upstream"
git push origin main
```

**Solution Option B - Reset (Discards Local Changes):**
```bash
bash scripts/reset-fork.sh main
```

### Scenario 4: Fork Has Diverged Significantly

**Situation:** Your fork has many commits ahead and behind upstream, making merge complex.

**Solution:**
```bash
# Option 1: Rebase (advanced - requires force push)
git fetch upstream
git rebase upstream/main
git push --force origin main

# Option 2: Reset and cherry-pick important commits
bash scripts/reset-fork.sh main
# Then cherry-pick commits from backup branch
git cherry-pick <commit-hash>
```

### Scenario 5: Accidentally Committed Sensitive Data

**Situation:** You committed API keys, passwords, or other sensitive data.

**Solution:**
```bash
# Immediately reset fork
bash scripts/reset-fork.sh main

# Change compromised credentials
# Then sync with upstream
bash scripts/sync-fork.sh main
```

### Scenario 6: Regular Maintenance

**Situation:** You want to keep your fork up to date as a regular practice.

**Solution:**
```bash
# Weekly/monthly: Run health check
bash scripts/health-check.sh

# If behind upstream, sync
bash scripts/sync-fork.sh main
```

Or use the automated GitHub Actions workflow (runs weekly automatically).

---

## Troubleshooting

### Issue: "Not in a git repository"

**Error:**
```
❌ Error: Not in a git repository
```

**Solution:**
```bash
cd /path/to/Loadopoly-OCR
bash scripts/health-check.sh
```

### Issue: "Upstream branch does not exist"

**Error:**
```
❌ Error: Upstream branch 'main' does not exist
```

**Solution:**
Check if upstream remote is configured:
```bash
git remote -v

# If upstream is missing:
git remote add upstream https://github.com/loadopoly/Loadopoly-OCR.git
git fetch upstream
```

### Issue: "Permission denied" on scripts

**Error:**
```
bash: scripts/sync-fork.sh: Permission denied
```

**Solution:**
```bash
chmod +x scripts/*.sh
bash scripts/sync-fork.sh
```

### Issue: Stash conflicts after merge

**Error:**
```
⚠️ Conflict while restoring stash
```

**Solution:**
```bash
# Check stash list
git stash list

# Apply stash and resolve conflicts
git stash pop
# Edit conflicting files
git add .
git stash drop  # Remove stash after resolving
```

### Issue: Force push rejected

**Error:**
```
! [rejected] main -> main (non-fast-forward)
```

**Solution:**
```bash
# Make sure you really want to force push
git push --force-with-lease origin main
```

### Issue: Detached HEAD state

**Error:**
```
You are in 'detached HEAD' state
```

**Solution:**
```bash
git checkout main
bash scripts/sync-fork.sh
```

### Issue: node_modules or dependencies out of date

**Error:**
```
Module not found or Build errors
```

**Solution:**
```bash
# Remove old dependencies
rm -rf node_modules package-lock.json

# Reinstall
npm install

# Or if using sync script, it will warn you
bash scripts/health-check.sh  # Shows dependency status
```

---

## Advanced Topics

### Using Git Worktrees for Testing

If you want to test upstream changes without affecting your current work:

```bash
# Create a worktree for testing
git worktree add ../Loadopoly-OCR-test upstream/main

# Test changes in the worktree
cd ../Loadopoly-OCR-test
npm install
npm run dev

# If satisfied, merge to your fork
cd ../Loadopoly-OCR
git merge upstream/main
```

### Cherry-Picking Specific Upstream Commits

If you only want specific upstream changes:

```bash
# Fetch upstream
git fetch upstream

# View upstream commits
git log upstream/main --oneline

# Cherry-pick specific commits
git cherry-pick <commit-hash>
git push origin main
```

### Maintaining Multiple Branches

If you have feature branches in your fork:

```bash
# Update main first
git checkout main
bash scripts/sync-fork.sh main

# Rebase feature branch on updated main
git checkout feature-branch
git rebase main
git push --force-with-lease origin feature-branch
```

### Setting Up Automatic Sync (Local Cron)

To run health checks automatically on your local machine:

```bash
# Edit crontab
crontab -e

# Add weekly health check (Sundays at noon)
0 12 * * 0 cd /path/to/Loadopoly-OCR && bash scripts/health-check.sh >> /tmp/fork-health.log 2>&1
```

### Creating Custom Reset Points

Before making experimental changes:

```bash
# Create a safety branch
git checkout -b experimental-backup
git push origin experimental-backup

# Switch back and experiment
git checkout main
# Make experimental changes

# If you need to revert:
git reset --hard experimental-backup
git push --force origin main
```

### Updating Fork Remotely via API

For advanced automation using GitHub API:

```bash
# Using GitHub CLI (gh)
gh workflow run fork-sync.yml

# Check workflow status
gh run list --workflow=fork-sync.yml

# View logs
gh run view <run-id> --log
```

---

## Best Practices

1. **Run health check before syncing**
   ```bash
   bash scripts/health-check.sh
   ```

2. **Always commit or stash changes before syncing**
   ```bash
   git add .
   git commit -m "WIP: before sync"
   # or
   git stash
   ```

3. **Use sync for routine updates, reset only when necessary**
   - Sync preserves your work
   - Reset is destructive but cleaner

4. **Keep your fork updated regularly**
   - Weekly or monthly syncs prevent large divergence
   - Use automated GitHub Actions workflow

5. **Test after syncing**
   ```bash
   npm install  # Update dependencies
   npm run build  # Ensure build works
   npm run dev  # Test application
   ```

6. **Document your custom changes**
   - Keep a CHANGELOG-FORK.md of your modifications
   - Makes future merges easier

7. **Use feature branches for significant changes**
   ```bash
   git checkout -b my-feature
   # Make changes
   git push origin my-feature
   # Keep main clean for easy syncing
   ```

---

## Related Documentation

- [GitHub Forking Guide](https://docs.github.com/en/get-started/quickstart/fork-a-repo)
- [Git Branching and Merging](https://git-scm.com/book/en/v2/Git-Branching-Basic-Branching-and-Merging)
- [Loadopoly-OCR Contributing Guide](../README.md#contributing)

---

## Support

If you encounter issues not covered in this guide:

1. **Check existing GitHub issues:** [Loadopoly-OCR Issues](https://github.com/loadopoly/Loadopoly-OCR/issues)
2. **Run health check and share output:** `bash scripts/health-check.sh`
3. **Create a new issue** with details about your problem

---

**Last Updated:** 2026-02-06  
**Version:** 1.0.0
