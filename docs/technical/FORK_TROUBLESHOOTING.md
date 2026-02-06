# Fork Management Troubleshooting Guide

Comprehensive troubleshooting solutions for common fork management issues.

## Table of Contents

- [Script Issues](#script-issues)
- [Git Issues](#git-issues)
- [Merge Conflicts](#merge-conflicts)
- [GitHub Actions Issues](#github-actions-issues)
- [Environment Issues](#environment-issues)
- [Recovery Procedures](#recovery-procedures)

---

## Script Issues

### Issue: Permission Denied

**Symptoms:**
```bash
bash: ./scripts/sync-fork.sh: Permission denied
```

**Causes:**
- Scripts don't have execute permissions

**Solutions:**

1. **Add execute permissions:**
   ```bash
   chmod +x scripts/*.sh
   ```

2. **Run with bash explicitly:**
   ```bash
   bash scripts/sync-fork.sh
   ```

3. **Verify permissions:**
   ```bash
   ls -la scripts/
   # Should show -rwxr-xr-x for .sh files
   ```

---

### Issue: Script Not Found

**Symptoms:**
```bash
bash: scripts/sync-fork.sh: No such file or directory
```

**Causes:**
- Wrong directory
- Scripts not downloaded
- Fork is out of date

**Solutions:**

1. **Check current directory:**
   ```bash
   pwd
   # Should be: /path/to/Loadopoly-OCR
   ```

2. **Navigate to repository root:**
   ```bash
   cd /path/to/Loadopoly-OCR
   ```

3. **Verify scripts exist:**
   ```bash
   ls -la scripts/
   ```

4. **Update fork to get scripts:**
   ```bash
   git fetch origin
   git merge origin/main
   ```

---

### Issue: Upstream Not Configured

**Symptoms:**
```bash
⚠️  No upstream remote configured
```

**Causes:**
- Upstream remote not added yet

**Solutions:**

1. **Add upstream remote:**
   ```bash
   git remote add upstream https://github.com/loadopoly/Loadopoly-OCR.git
   ```

2. **Verify remotes:**
   ```bash
   git remote -v
   # Should show both origin and upstream
   ```

3. **Fetch upstream:**
   ```bash
   git fetch upstream
   ```

---

## Git Issues

### Issue: Detached HEAD State

**Symptoms:**
```bash
You are in 'detached HEAD' state
```

**Causes:**
- Checked out a specific commit
- Reset went wrong

**Solutions:**

1. **Return to main branch:**
   ```bash
   git checkout main
   ```

2. **If you made changes you want to keep:**
   ```bash
   git branch temp-branch
   git checkout main
   git merge temp-branch
   ```

3. **If you want to discard changes:**
   ```bash
   git checkout main
   ```

---

### Issue: Merge Already in Progress

**Symptoms:**
```bash
fatal: You have not concluded your merge
```

**Causes:**
- Previous merge wasn't completed
- Script was interrupted

**Solutions:**

1. **Complete the merge:**
   ```bash
   # If conflicts are resolved
   git add .
   git commit
   ```

2. **Abort the merge:**
   ```bash
   git merge --abort
   git status  # Verify clean state
   ```

3. **Reset to clean state:**
   ```bash
   git reset --hard HEAD
   git status  # Verify clean state
   ```

---

### Issue: Uncommitted Changes Blocking Merge

**Symptoms:**
```bash
error: Your local changes to the following files would be overwritten by merge
```

**Causes:**
- You have uncommitted changes
- Changes conflict with upstream

**Solutions:**

1. **Commit your changes:**
   ```bash
   git add .
   git commit -m "Save local changes"
   bash scripts/sync-fork.sh
   ```

2. **Stash your changes:**
   ```bash
   git stash
   bash scripts/sync-fork.sh
   git stash pop  # Restore after sync
   ```

3. **Discard your changes (⚠️ careful!):**
   ```bash
   git checkout -- .
   git clean -fd
   bash scripts/sync-fork.sh
   ```

---

### Issue: Force Push Rejected

**Symptoms:**
```bash
! [rejected] main -> main (non-fast-forward)
```

**Causes:**
- Remote has changes you don't have locally
- Someone else pushed to your fork

**Solutions:**

1. **Fetch and merge first:**
   ```bash
   git fetch origin
   git merge origin/main
   git push origin main
   ```

2. **Force push with lease (safer):**
   ```bash
   git push --force-with-lease origin main
   ```

3. **Force push (⚠️ overwrites remote):**
   ```bash
   git push --force origin main
   ```

---

## Merge Conflicts

### Issue: Merge Conflicts Detected

**Symptoms:**
```bash
⚠️ Merge conflicts detected!
CONFLICT (content): Merge conflict in file.ts
```

**Causes:**
- Same lines changed in both fork and upstream
- Files moved/deleted in conflicting ways

**Solutions:**

#### Solution 1: Manual Resolution (Preserves Your Changes)

```bash
# Start merge
git merge upstream/main

# Git will show conflicting files
# Edit each file to resolve conflicts:
# Look for:
# <<<<<<< HEAD
# Your changes
# =======
# Upstream changes
# >>>>>>> upstream/main

# For each file:
1. Open file in editor
2. Choose which changes to keep
3. Remove conflict markers (<<<, ===, >>>)
4. Save file

# After resolving all conflicts:
git add .
git commit -m "Resolve merge conflicts with upstream"
git push origin main
```

**Example conflict resolution:**
```javascript
// Before (conflicted):
<<<<<<< HEAD
const apiKey = process.env.MY_API_KEY;
=======
const apiKey = process.env.VITE_API_KEY;
>>>>>>> upstream/main

// After (resolved - choose one or combine):
const apiKey = process.env.VITE_API_KEY || process.env.MY_API_KEY;
```

#### Solution 2: Use Their Version (Accept Upstream)

```bash
# For specific file
git checkout --theirs path/to/file.ts
git add path/to/file.ts

# For all conflicts (accept all upstream changes)
git checkout --theirs .
git add .
git commit -m "Accept all upstream changes"
```

#### Solution 3: Use Your Version (Keep Your Changes)

```bash
# For specific file
git checkout --ours path/to/file.ts
git add path/to/file.ts

# For all conflicts (keep all your changes)
git checkout --ours .
git add .
git commit -m "Keep all local changes"
```

#### Solution 4: Reset Fork (⚠️ Discards All Changes)

```bash
bash scripts/reset-fork.sh
```

---

### Issue: Binary File Conflicts

**Symptoms:**
```bash
warning: Cannot merge binary files
```

**Causes:**
- Images, PDFs, or other binary files changed in both versions

**Solutions:**

1. **Keep your version:**
   ```bash
   git checkout --ours path/to/file.png
   git add path/to/file.png
   ```

2. **Keep upstream version:**
   ```bash
   git checkout --theirs path/to/file.png
   git add path/to/file.png
   ```

3. **Keep both (rename one):**
   ```bash
   git checkout --ours path/to/file.png
   mv path/to/file.png path/to/file-local.png
   git checkout --theirs path/to/file.png
   mv path/to/file.png path/to/file-upstream.png
   git add path/to/
   ```

---

## GitHub Actions Issues

### Issue: Workflow Not Running

**Symptoms:**
- Workflow doesn't appear in Actions tab
- No automated runs happening

**Causes:**
- Workflows disabled in fork
- Insufficient permissions

**Solutions:**

1. **Enable workflows in fork:**
   - Go to your fork on GitHub
   - Click "Actions" tab
   - Click "I understand my workflows, go ahead and enable them"

2. **Verify workflow file:**
   ```bash
   cat .github/workflows/fork-sync.yml
   # Should show valid YAML
   ```

3. **Trigger manually:**
   - Actions tab → Fork Sync with Upstream → Run workflow

---

### Issue: Workflow Fails with Permission Error

**Symptoms:**
```bash
remote: Permission to user/repo.git denied
```

**Causes:**
- GITHUB_TOKEN doesn't have write permissions

**Solutions:**

1. **Check repository settings:**
   - Settings → Actions → General
   - Workflow permissions → Read and write permissions
   - Enable "Allow GitHub Actions to create and approve pull requests"

2. **Verify token permissions:**
   - The default GITHUB_TOKEN should work
   - If using personal token, ensure it has `repo` scope

---

### Issue: Fork Sync Creates Issue But Should Merge

**Symptoms:**
- Workflow always creates conflict issue
- Says conflicts exist when they don't

**Causes:**
- git merge-tree command not available (old Git version)

**Solutions:**

1. **Update Git:**
   ```bash
   git --version  # Should be 2.30+
   ```

2. **Trigger workflow manually:**
   - It may work on GitHub's runners even if local Git is old

3. **Use local scripts instead:**
   ```bash
   bash scripts/sync-fork.sh
   ```

---

## Environment Issues

### Issue: Node Modules Missing

**Symptoms:**
```bash
⚠️  node_modules not found
Error: Cannot find module 'xxx'
```

**Causes:**
- Dependencies not installed
- Dependencies out of date after sync

**Solutions:**

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Clean install:**
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

3. **After every sync:**
   ```bash
   bash scripts/sync-fork.sh
   npm install  # Always reinstall after sync
   ```

---

### Issue: Environment Variables Missing

**Symptoms:**
```bash
⚠️  No .env file found
Error: VITE_SUPABASE_URL is not defined
```

**Causes:**
- .env file not created
- .env file not copied after reset

**Solutions:**

1. **Copy template:**
   ```bash
   cp .env.example .env.local
   ```

2. **Edit with your values:**
   ```bash
   nano .env.local
   # or use your preferred editor
   ```

3. **Verify file exists:**
   ```bash
   ls -la .env*
   ```

---

### Issue: Build Fails After Sync

**Symptoms:**
```bash
npm run build
# Errors about missing types, incompatible versions, etc.
```

**Causes:**
- Upstream changed dependencies
- Conflicting package versions

**Solutions:**

1. **Clean and reinstall:**
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   npm run build
   ```

2. **Clear build cache:**
   ```bash
   rm -rf dist .vite
   npm run build
   ```

3. **Check for breaking changes:**
   ```bash
   git log upstream/main --oneline -- package.json
   # Review what changed
   ```

---

## Recovery Procedures

### Procedure: Recover from Failed Merge

**When to use:** Merge went wrong, repository is in bad state

**Steps:**

1. **Abort current operation:**
   ```bash
   git merge --abort 2>/dev/null || true
   git rebase --abort 2>/dev/null || true
   git cherry-pick --abort 2>/dev/null || true
   ```

2. **Check status:**
   ```bash
   git status
   ```

3. **If still messy, reset:**
   ```bash
   git reset --hard HEAD
   git clean -fd
   ```

4. **Verify clean state:**
   ```bash
   git status
   # Should show: nothing to commit, working tree clean
   ```

5. **Try sync again:**
   ```bash
   bash scripts/sync-fork.sh
   ```

---

### Procedure: Recover Lost Commits

**When to use:** Accidentally reset or deleted commits

**Steps:**

1. **Find lost commits:**
   ```bash
   git reflog
   # Shows all recent HEAD positions
   ```

2. **Identify the commit:**
   ```bash
   # Look for commit before the mistake
   # Example output:
   # abc1234 HEAD@{0}: reset: moving to HEAD~1
   # def5678 HEAD@{1}: commit: My important work
   ```

3. **Recover the commit:**
   ```bash
   git cherry-pick def5678
   # or
   git reset --hard def5678
   ```

4. **Verify recovery:**
   ```bash
   git log --oneline
   ```

---

### Procedure: Recover from Backup Branch

**When to use:** Fork reset went wrong, need old version

**Steps:**

1. **List backup branches:**
   ```bash
   git branch -a | grep backup
   ```

2. **Check out backup:**
   ```bash
   git checkout backup-20260206-143022
   ```

3. **Create new branch from backup:**
   ```bash
   git checkout -b recovery-branch
   ```

4. **Cherry-pick specific commits:**
   ```bash
   git log --oneline  # Find commits you want
   git checkout main
   git cherry-pick <commit-hash>
   ```

5. **Or merge entire backup:**
   ```bash
   git checkout main
   git merge recovery-branch
   ```

---

### Procedure: Complete Fork Rebuild

**When to use:** Everything is broken, start completely fresh

**Steps:**

1. **Backup important files:**
   ```bash
   cp .env.local ~/backup-env
   cp -r src/my-custom-code ~/backup-code
   ```

2. **Delete local repository:**
   ```bash
   cd ..
   rm -rf Loadopoly-OCR
   ```

3. **Fresh clone:**
   ```bash
   git clone https://github.com/yourname/Loadopoly-OCR.git
   cd Loadopoly-OCR
   ```

4. **Setup upstream:**
   ```bash
   git remote add upstream https://github.com/loadopoly/Loadopoly-OCR.git
   git fetch upstream
   ```

5. **Reset to upstream:**
   ```bash
   git reset --hard upstream/main
   git push --force origin main
   ```

6. **Restore your files:**
   ```bash
   cp ~/backup-env .env.local
   # Manually copy custom code
   ```

7. **Install dependencies:**
   ```bash
   npm install
   ```

---

## Diagnostic Commands

Quick commands to diagnose issues:

```bash
# Check repository status
git status

# View remotes
git remote -v

# View branches
git branch -a

# Check commits ahead/behind
git fetch upstream
git log --oneline HEAD..upstream/main  # Behind
git log --oneline upstream/main..HEAD  # Ahead

# View recent history
git log --oneline --graph -10

# Check for conflicts
git merge-tree $(git merge-base HEAD upstream/main) HEAD upstream/main

# View reflog (recovery)
git reflog -10

# Check uncommitted changes
git diff
git diff --staged

# List stashes
git stash list
```

---

## Getting Help

If none of these solutions work:

1. **Run full diagnostic:**
   ```bash
   bash scripts/health-check.sh > ~/fork-diagnostic.txt
   ```

2. **Create issue:**
   - Go to: https://github.com/loadopoly/Loadopoly-OCR/issues/new
   - Use: Fork Synchronization Issue template
   - Attach: `fork-diagnostic.txt`

3. **Provide details:**
   - What you were trying to do
   - Commands you ran
   - Full error messages
   - Output from health-check.sh

---

**Last Updated:** 2026-02-06  
**Version:** 1.0.0
