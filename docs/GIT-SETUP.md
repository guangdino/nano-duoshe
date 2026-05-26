# Git + GitHub setup (one-time, Windows)

This is a fallback guide for when `scripts\publish-to-github.ps1` can't push on its own. If the script succeeded, you don't need this.

The target remote is **`https://github.com/guangdino/nano-duoshe`**, and the GitHub account is **`guangdino`**.

---

## 1. Install Git for Windows (if `git --version` fails)

Download: <https://git-scm.com/download/win>

During install, accept the defaults — Git for Windows ships with **Git Credential Manager (GCM)**, which is what pops up the browser auth window the first time you push.

---

## 2. Configure your identity

The script checks this. If it failed there, run:

```powershell
git config --global user.name  "Your Name"
git config --global user.email "you@example.com"     # must match an email on the guangdino GitHub account
```

If the email does not match any verified email on your GitHub account, your commits will show "Unknown" as the author.

---

## 3. Authenticate (pick ONE of the three)

### Option A — Git Credential Manager (the default, easiest)

Just run the publish script. The first push will pop up a browser:

1. GCM opens `https://github.com/login`.
2. Sign in as **`guangdino`**.
3. Click **Authorize git-credential-manager**.
4. Credentials are saved to Windows Credential Manager — no future popups.

**If GCM remembers the wrong account** (e.g. cached `k197388` from earlier):

```powershell
git credential-manager github logout
```

…or use Windows: **Control Panel → Credential Manager → Windows Credentials**, delete any entry under `git:https://github.com` and try again.

### Option B — Personal Access Token (HTTPS)

If you'd rather skip the browser dance:

1. Go to <https://github.com/settings/tokens?type=beta> (Fine-grained tokens).
2. **Token name:** `nano-duoshe-cli`. **Resource owner:** `guangdino`. **Repository access:** Only select repositories → `guangdino/nano-duoshe`.
3. **Permissions → Repository permissions:** set **Contents** to **Read and write**.
4. Click **Generate token** and copy the `github_pat_...` string.
5. When git asks for a password during push, paste the token (not your GitHub password — those don't work for git anymore).

The token will be cached by GCM after one successful use.

### Option C — SSH (most stable long-term)

If you push from this machine often, SSH avoids token expiry:

```powershell
# 1. Create a key (just press Enter through all prompts)
ssh-keygen -t ed25519 -C "you@example.com"

# 2. Copy the public key to clipboard
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub | Set-Clipboard

# 3. Paste it at  https://github.com/settings/ssh/new

# 4. Switch the remote URL from HTTPS to SSH
cd D:\1Source\DuosheAgent
git remote set-url origin git@github.com:guangdino/nano-duoshe.git

# 5. Verify
ssh -T git@github.com    # should say: "Hi guangdino! You've successfully authenticated"
git push -u origin main
```

---

## 4. Common errors

| Error message | Fix |
|---|---|
| `remote: Repository not found` | The repo doesn't exist or you're signed in as the wrong account. Visit <https://github.com/guangdino/nano-duoshe> while signed in as `guangdino` to confirm it exists. |
| `Permission denied (publickey)` | Using SSH but no key registered — see Option C. |
| `Authentication failed` (HTTPS) | Password/token rejected. For HTTPS you MUST use a Personal Access Token, not your GitHub password. See Option B. |
| `! [rejected] main -> main (fetch first)` | GitHub repo isn't empty (probably has a README it auto-created). Either delete and recreate empty, or run: `git pull --rebase origin main && git push`. |
| `fatal: refusing to merge unrelated histories` | Same cause as above. Add `--allow-unrelated-histories` to the pull, or recreate the GitHub repo as empty. |

---

## 5. Future pushes

After the first successful push, you never run `publish-to-github.ps1` again. Just:

```powershell
cd D:\1Source\DuosheAgent
git add -A
git commit -m "your message"
git push
```

---

## 6. Optional: install GitHub CLI

If you'd rather skip GCM/SSH altogether and use the official `gh` tool:

```powershell
winget install GitHub.cli
gh auth login                   # follow prompts; choose HTTPS + 'Login with a web browser'
gh repo view guangdino/nano-duoshe   # smoke test
```

`gh` handles auth for plain `git push` automatically once you've run `gh auth login`.
