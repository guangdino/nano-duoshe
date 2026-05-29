# nano-duoshe — bump version, tag, push.
# -------------------------------------------------------------------
# After this script finishes, the GitHub Release workflow takes over:
# it builds, runs tests, and publishes to npm.
#
# Usage (from PowerShell on the host machine):
#   scripts\release.ps1 patch         # 0.1.0 -> 0.1.1
#   scripts\release.ps1 minor         # 0.1.0 -> 0.2.0
#   scripts\release.ps1 major         # 0.1.0 -> 1.0.0
#   scripts\release.ps1 prerelease    # 0.1.0 -> 0.1.1-0  (published to dist-tag 'next')
#   scripts\release.ps1 0.2.0-beta.1  # explicit version
#
# Flags:
#   -DryRun       Print actions, don't tag or push
#   -SkipChecks   Skip lint/typecheck/test (use only for hotfixes)

param(
    [Parameter(Mandatory, Position = 0)]
    [string]$Bump,
    [switch]$DryRun,
    [switch]$SkipChecks
)

$ErrorActionPreference = "Stop"

function Write-Step($msg) { Write-Host ""; Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg) { Write-Host "    [OK] $msg" -ForegroundColor Green }
function Write-Info($msg) { Write-Host "    [..] $msg" -ForegroundColor DarkGray }
function Write-WarnLine($msg) { Write-Host "    [WARN] $msg" -ForegroundColor Yellow }
function Fail($msg) { Write-Host "    [ERROR] $msg" -ForegroundColor Red; exit 1 }

# --- Preflight ---------------------------------------------------------------

Write-Step "Preflight"

$branch = (& git rev-parse --abbrev-ref HEAD).Trim()
if ($branch -ne "main") {
    Write-WarnLine "current branch is '$branch', not 'main' — releases should be cut from main"
    if (-not $DryRun) {
        $confirm = Read-Host "    Continue anyway? (y/N)"
        if ($confirm -ne "y") { Fail "aborted" }
    }
}
Write-Ok "branch: $branch"

$dirty = (& git status --porcelain)
if (-not [string]::IsNullOrWhiteSpace($dirty)) {
    Write-Host "    Working tree is dirty:" -ForegroundColor Yellow
    & git status --short
    Fail "commit or stash changes before releasing"
}
Write-Ok "working tree clean"

Write-Info "fetching latest from origin"
& git fetch origin --tags | Out-Null

$localHead = (& git rev-parse HEAD).Trim()
$remoteHead = (& git rev-parse "origin/$branch" 2>$null)
if ($LASTEXITCODE -eq 0 -and $remoteHead -and $localHead -ne $remoteHead.Trim()) {
    Fail "local $branch is not in sync with origin/$branch — pull or push first"
}
Write-Ok "in sync with origin/$branch"

# --- Quality gates -----------------------------------------------------------

if (-not $SkipChecks) {
    Write-Step "Running quality gates"
    Write-Info "npm ci"
    if (-not $DryRun) { & npm ci; if ($LASTEXITCODE -ne 0) { Fail "npm ci failed" } }

    Write-Info "lint + typecheck + test"
    if (-not $DryRun) {
        & npm run lint;      if ($LASTEXITCODE -ne 0) { Fail "lint failed" }
        & npm run typecheck; if ($LASTEXITCODE -ne 0) { Fail "typecheck failed" }
        & npm test;          if ($LASTEXITCODE -ne 0) { Fail "tests failed" }
    }
    Write-Ok "all checks passed"
} else {
    Write-WarnLine "skipping quality gates (--SkipChecks)"
}

# --- Bump version -----------------------------------------------------------

Write-Step "Bumping version ($Bump)"

$oldVersion = (node -p "require('./package.json').version").Trim()
Write-Info "current: $oldVersion"

if ($DryRun) {
    Write-Info "[dry-run] would run: npm version $Bump --no-git-tag-version"
    Write-Info "[dry-run] would commit + tag + push"
    return
}

# npm version handles both keywords (patch/minor/major/prerelease) and explicit semver.
& npm version $Bump --no-git-tag-version --allow-same-version
if ($LASTEXITCODE -ne 0) { Fail "npm version failed" }

$newVersion = (node -p "require('./package.json').version").Trim()
if ($newVersion -eq $oldVersion) { Fail "version unchanged after bump" }
Write-Ok "$oldVersion -> $newVersion"

# --- Commit + tag + push ----------------------------------------------------

Write-Step "Committing and tagging"
& git add package.json package-lock.json
& git commit -m "chore(release): v$newVersion"
if ($LASTEXITCODE -ne 0) { Fail "commit failed" }

& git tag -a "v$newVersion" -m "v$newVersion"
if ($LASTEXITCODE -ne 0) { Fail "tag failed" }
Write-Ok "created tag v$newVersion"

Write-Step "Pushing to origin"
& git push origin $branch
if ($LASTEXITCODE -ne 0) { Fail "push branch failed" }
& git push origin "v$newVersion"
if ($LASTEXITCODE -ne 0) { Fail "push tag failed" }
Write-Ok "pushed branch + tag"

Write-Host ""
Write-Host "----------------------------------------------------------------" -ForegroundColor Green
Write-Host " Released v$newVersion" -ForegroundColor Green
Write-Host "----------------------------------------------------------------" -ForegroundColor Green
Write-Host ""
Write-Host "  GitHub Actions will now:"
Write-Host "    1. Build + test + publish to npm"
Write-Host "    2. Create a GitHub Release with auto-generated notes"
Write-Host ""
Write-Host "  Watch:  https://github.com/guangdino/nano-duoshe/actions"
Write-Host "  npm:    https://www.npmjs.com/package/nano-duoshe"
Write-Host ""
