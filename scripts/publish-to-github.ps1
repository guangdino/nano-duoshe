# nano-duoshe — first push to GitHub
# -----------------------------------
# This script does everything needed to publish the local repo at
#   D:\1Source\DuosheAgent
# to
#   https://github.com/guangdino/nano-duoshe
#
# It is SAFE TO RE-RUN. Each step is idempotent:
#   - git init only runs if .git is missing
#   - remote 'origin' is added or updated to the canonical URL
#   - commit is created only if there are pending changes
#   - push uses -u to set upstream once, after that just `git push`
#
# Usage (from PowerShell on the host machine):
#   Right-click setup-dev.ps1 sibling: scripts\publish-to-github.ps1 → "Run with PowerShell"
#   Or:   powershell -ExecutionPolicy Bypass -File "D:\1Source\DuosheAgent\scripts\publish-to-github.ps1"
#
# Flags:
#   -DryRun       Show what would happen without pushing
#   -SkipPush     Stage + commit but do not push
#   -CommitMsg    Override the default commit message

param(
    [switch]$DryRun,
    [switch]$SkipPush,
    [string]$CommitMsg
)

# --- Config ------------------------------------------------------------------

$ProjectRoot  = "D:\1Source\DuosheAgent"
$RepoUrl      = "https://github.com/guangdino/nano-duoshe.git"
$Branch       = "main"
$GhUser       = "guangdino"

# --- Helpers -----------------------------------------------------------------

function Write-Step($msg) {
    Write-Host ""
    Write-Host "==> $msg" -ForegroundColor Cyan
}

function Write-Ok($msg) {
    Write-Host "    [OK] $msg" -ForegroundColor Green
}

function Write-Info($msg) {
    Write-Host "    [..] $msg" -ForegroundColor DarkGray
}

function Write-Warn($msg) {
    Write-Host "    [WARN] $msg" -ForegroundColor Yellow
}

function Write-Err($msg) {
    Write-Host "    [ERROR] $msg" -ForegroundColor Red
}

function Fail($msg) {
    Write-Err $msg
    Write-Host ""
    Write-Host "Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

function Invoke-Git {
    param(
        [Parameter(Mandatory)][string[]]$GitArgs,
        [switch]$AllowFail
    )
    $output = & git @GitArgs 2>&1
    $code = $LASTEXITCODE
    foreach ($line in $output) {
        Write-Host "    $line" -ForegroundColor DarkGray
    }
    if ($code -ne 0 -and -not $AllowFail) {
        Fail "git $($GitArgs -join ' ') failed (exit $code)"
    }
    return @{ ExitCode = $code; Output = ($output -join "`n") }
}

# --- Preflight ---------------------------------------------------------------

Write-Step "Preflight"

$gitCmd = Get-Command git -ErrorAction SilentlyContinue
if ($null -eq $gitCmd) {
    Fail "git not found in PATH. Install Git for Windows from https://git-scm.com/download/win then re-run."
}
$gitVersion = & git --version
Write-Ok $gitVersion

if (-not (Test-Path -LiteralPath $ProjectRoot)) {
    Fail "Project path not found: $ProjectRoot"
}
if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot "package.json"))) {
    Fail "package.json not found in $ProjectRoot. This does not look like the nano-duoshe repo."
}
Write-Ok "Project found at $ProjectRoot"

# --- Git identity ------------------------------------------------------------

Write-Step "Checking git identity"

$gitName  = (& git config --global user.name) 2>$null
$gitEmail = (& git config --global user.email) 2>$null

if ([string]::IsNullOrWhiteSpace($gitName) -or [string]::IsNullOrWhiteSpace($gitEmail)) {
    Write-Warn "git global user.name or user.email is not set."
    Write-Host ""
    Write-Host "    Set them now (use the email tied to your GitHub account 'guangdino'):"
    Write-Host "      git config --global user.name  `"Your Name`""
    Write-Host "      git config --global user.email `"you@example.com`""
    Write-Host ""
    Fail "Re-run this script after configuring git identity."
}
Write-Ok "user.name  = $gitName"
Write-Ok "user.email = $gitEmail"

# --- Init repo if needed ----------------------------------------------------

Push-Location -LiteralPath $ProjectRoot
try {
    Write-Step "Ensuring git repo at $ProjectRoot"

    if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot ".git"))) {
        Write-Info "no .git directory found — running 'git init'"
        if (-not $DryRun) {
            Invoke-Git -GitArgs @("init", "-b", $Branch) | Out-Null
        }
        Write-Ok "initialized empty repo on branch '$Branch'"
    } else {
        Write-Ok ".git directory already present"
        $currentBranch = (& git rev-parse --abbrev-ref HEAD 2>$null)
        if ($currentBranch -and $currentBranch -ne "HEAD") {
            Write-Info "current branch: $currentBranch"
            if ($currentBranch -ne $Branch -and -not $DryRun) {
                Write-Info "renaming branch to '$Branch'"
                Invoke-Git -GitArgs @("branch", "-M", $Branch) -AllowFail | Out-Null
            }
        }
    }

    # --- Remote ---------------------------------------------------------------

    Write-Step "Ensuring remote 'origin' = $RepoUrl"

    $existingRemote = (& git remote get-url origin 2>$null)
    if ([string]::IsNullOrWhiteSpace($existingRemote)) {
        Write-Info "no 'origin' remote — adding"
        if (-not $DryRun) {
            Invoke-Git -GitArgs @("remote", "add", "origin", $RepoUrl) | Out-Null
        }
        Write-Ok "origin -> $RepoUrl"
    } elseif ($existingRemote.Trim() -ne $RepoUrl) {
        Write-Warn "origin currently points to: $($existingRemote.Trim())"
        Write-Info "updating to: $RepoUrl"
        if (-not $DryRun) {
            Invoke-Git -GitArgs @("remote", "set-url", "origin", $RepoUrl) | Out-Null
        }
        Write-Ok "origin updated"
    } else {
        Write-Ok "origin already correct"
    }

    # --- Stage + commit -------------------------------------------------------

    Write-Step "Staging and committing"

    # Show what is about to be committed (helps catch accidental dist/ inclusion etc.)
    Write-Info "current status:"
    & git status --short

    if ($DryRun) {
        Write-Info "[dry-run] would run: git add -A && git commit"
    } else {
        Invoke-Git -GitArgs @("add", "-A") | Out-Null

        $stagedCount = (& git diff --cached --name-only | Measure-Object -Line).Lines
        if ($stagedCount -eq 0) {
            Write-Info "nothing new to commit"
        } else {
            $message = if ([string]::IsNullOrWhiteSpace($CommitMsg)) {
                "chore: initial publish of nano-duoshe v0.1.0-alpha.0 (M0-M3)"
            } else {
                $CommitMsg
            }
            Invoke-Git -GitArgs @("commit", "-m", $message) -AllowFail | Out-Null
            if ($LASTEXITCODE -ne 0) {
                Write-Warn "commit reported a non-zero exit code (often harmless if nothing changed)"
            } else {
                Write-Ok "committed: $message"
            }
        }
    }

    # --- Push -----------------------------------------------------------------

    if ($SkipPush) {
        Write-Step "Skipping push (--SkipPush)"
        return
    }

    Write-Step "Pushing to GitHub"
    Write-Host "    Remote:  $RepoUrl" -ForegroundColor DarkGray
    Write-Host "    Branch:  $Branch" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "    If this is your first push from this machine to github.com/${GhUser}:" -ForegroundColor DarkGray
    Write-Host "      - Git Credential Manager (bundled with Git for Windows) will pop up a" -ForegroundColor DarkGray
    Write-Host "        browser window. Sign in as 'guangdino' and click 'Authorize'." -ForegroundColor DarkGray
    Write-Host "      - If it asks for a password instead, paste a Personal Access Token" -ForegroundColor DarkGray
    Write-Host "        (create at https://github.com/settings/tokens — scope: 'repo')." -ForegroundColor DarkGray
    Write-Host ""

    if ($DryRun) {
        Write-Info "[dry-run] would run: git push -u origin $Branch"
    } else {
        $push = Invoke-Git -GitArgs @("push", "-u", "origin", $Branch) -AllowFail
        if ($push.ExitCode -ne 0) {
            Write-Host ""
            Write-Err "Push failed. Common causes and fixes:"
            Write-Host "  1. Auth declined: re-run and make sure to sign in as 'guangdino' in the popup."
            Write-Host "  2. Wrong account cached: clear it with:"
            Write-Host "       git credential-manager github logout"
            Write-Host "     (or in Windows: Control Panel → Credential Manager → remove github.com entries)"
            Write-Host "  3. Repo not empty on GitHub: it was created with README/LICENSE — see GIT-SETUP.md."
            Write-Host "  4. SSH instead of HTTPS: see GIT-SETUP.md to switch the remote URL."
            Fail "push failed (exit $($push.ExitCode))"
        }
        Write-Ok "push succeeded"
    }
} finally {
    Pop-Location
}

# --- Done -------------------------------------------------------------------

Write-Host ""
Write-Host "----------------------------------------------------------------" -ForegroundColor Green
Write-Host " nano-duoshe is now live at:" -ForegroundColor Green
Write-Host "   https://github.com/guangdino/nano-duoshe" -ForegroundColor Green
Write-Host "----------------------------------------------------------------" -ForegroundColor Green
Write-Host ""
Write-Host "  Next steps:"
Write-Host "    1. Open the repo in your browser and verify the README renders correctly."
Write-Host "    2. Add a description + topics: mcp, claude-code, codex, ai-coding, memory."
Write-Host "    3. Future pushes are simpler — from $ProjectRoot just run:"
Write-Host "         git add -A"
Write-Host "         git commit -m `"...`""
Write-Host "         git push"
Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
