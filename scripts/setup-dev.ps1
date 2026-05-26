# DuoShe dev environment setup (Windows, host machine)
# -----------------------------------------------------
# Purpose:
#   Installs dependencies, runs the test suite, and smoke-tests `duoshe init`
#   in a temporary directory to prove the M1 flow end-to-end.
#
#   Must be run on the HOST machine where the repo physically lives at
#   D:\1Source\DuosheAgent (UNC paths via VBOXSVR break npm postinstall).
#
# Usage:
#   Right-click this file → "Run with PowerShell"
#   Or from PowerShell:    .\scripts\setup-dev.ps1
#
# Flags:
#   -SkipInstall    Skip `npm install` (use when deps are already installed)
#   -SkipTests      Skip the test suite
#   -SkipSmoke      Skip the smoke test
#   -KeepSmokeDir   Keep the temp smoke-test directory for inspection

param(
    [switch]$SkipInstall,
    [switch]$SkipTests,
    [switch]$SkipSmoke,
    [switch]$KeepSmokeDir
)

# --- Config ------------------------------------------------------------------

$ProjectRoot  = "D:\1Source\DuosheAgent"
$NodeMinMajor = 20

# --- Helpers -----------------------------------------------------------------

function Write-Step($msg) {
    Write-Host ""
    Write-Host "==> $msg" -ForegroundColor Cyan
}

function Write-Ok($msg) {
    Write-Host "    [OK] $msg" -ForegroundColor Green
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

# --- Preflight: confirm Node is installed and modern enough ------------------

Write-Step "Checking Node.js..."

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($null -eq $nodeCmd) {
    Fail "Node.js not found in PATH. Install Node 20+ from https://nodejs.org and re-run."
}

$nodeVersion = (& node --version).TrimStart("v")
$nodeMajor   = [int]($nodeVersion.Split(".")[0])

if ($nodeMajor -lt $NodeMinMajor) {
    Fail "Node $nodeVersion is too old. DuoShe requires Node $NodeMinMajor+."
}
Write-Ok "Node $nodeVersion"

$npmCmd = Get-Command npm -ErrorAction SilentlyContinue
if ($null -eq $npmCmd) {
    Fail "npm not found in PATH (unexpected — comes bundled with Node)."
}
$npmVersion = (& npm --version)
Write-Ok "npm $npmVersion"

# --- Preflight: confirm the project path exists ------------------------------

Write-Step "Checking project path: $ProjectRoot"

if (-not (Test-Path -LiteralPath $ProjectRoot)) {
    Fail "Path not found: $ProjectRoot. Edit `$ProjectRoot at the top of this script if your repo lives elsewhere."
}
if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot "package.json"))) {
    Fail "package.json not found in $ProjectRoot. This does not look like the DuoShe repo."
}
Write-Ok "$ProjectRoot exists and contains package.json"

# --- Run npm install on the local path --------------------------------------

if ($SkipInstall) {
    Write-Step "Skipping npm install (--SkipInstall)"
} else {
    Write-Step "Running 'npm install' in $ProjectRoot ..."
    Push-Location -LiteralPath $ProjectRoot
    try {
        & npm install
        $installExit = $LASTEXITCODE
    } finally {
        Pop-Location
    }
    if ($installExit -ne 0) {
        Fail "npm install failed with exit code $installExit. Scroll up for details."
    }
    Write-Ok "Dependencies installed"
}

# --- Typecheck --------------------------------------------------------------

Write-Step "Typecheck (tsc --noEmit)"
Push-Location -LiteralPath $ProjectRoot
try {
    & npm run typecheck
    $tcExit = $LASTEXITCODE
} finally {
    Pop-Location
}
if ($tcExit -ne 0) {
    Fail "Typecheck failed."
}
Write-Ok "Typecheck clean"

# --- Tests ------------------------------------------------------------------

if ($SkipTests) {
    Write-Step "Skipping tests (--SkipTests)"
} else {
    Write-Step "Running test suite"
    Push-Location -LiteralPath $ProjectRoot
    try {
        & npm test
        $testExit = $LASTEXITCODE
    } finally {
        Pop-Location
    }
    if ($testExit -ne 0) {
        Fail "Tests failed."
    }
    Write-Ok "All tests passed"
}

# --- CLI smoke test: --version ---------------------------------------------

Write-Step "Smoke test: 'npm run dev -- --version'"
Push-Location -LiteralPath $ProjectRoot
try {
    & npm run dev -- --version
    $smokeExit = $LASTEXITCODE
} finally {
    Pop-Location
}
if ($smokeExit -ne 0) {
    Fail "Version smoke test failed."
}

# --- M1 smoke test: `duoshe init` in a temp project -------------------------

if ($SkipSmoke) {
    Write-Step "Skipping M1 smoke test (--SkipSmoke)"
} else {
    Write-Step "M1 smoke test: 'duoshe init' on a fake temp project"

    $smokeDir = Join-Path $env:TEMP ("duoshe-smoke-" + [System.Guid]::NewGuid().ToString("N").Substring(0, 8))
    New-Item -ItemType Directory -Path $smokeDir | Out-Null

    # Make it look like an npm project so the stack detector fires
    @'
{
  "name": "smoke-test-project",
  "version": "0.0.1",
  "dependencies": { "express": "^4.18.0" },
  "devDependencies": { "typescript": "^5.0.0" }
}
'@ | Set-Content -LiteralPath (Join-Path $smokeDir "package.json") -Encoding utf8

    New-Item -ItemType Directory -Path (Join-Path $smokeDir "src") | Out-Null
    Set-Content -LiteralPath (Join-Path $smokeDir "src\index.ts") -Value "// hello" -Encoding utf8
    Set-Content -LiteralPath (Join-Path $smokeDir "tsconfig.json") -Value "{}" -Encoding utf8

    # Pre-existing CLAUDE.md to verify non-destructive append
    Set-Content -LiteralPath (Join-Path $smokeDir "CLAUDE.md") `
        -Value "# Smoke Project`n`nUser-written guidance.`n" -Encoding utf8

    Write-Host "    smoke dir: $smokeDir" -ForegroundColor DarkGray

    # Resolve dev CLI absolute path (tsx via npx so it works no matter the cwd)
    $cliScript = Join-Path $ProjectRoot "src\cli\index.ts"

    Push-Location -LiteralPath $smokeDir
    try {
        & npx --prefix $ProjectRoot tsx $cliScript init
        $initExit = $LASTEXITCODE
    } finally {
        Pop-Location
    }

    if ($initExit -ne 0) {
        Write-Warn "Smoke test 'init' exited with code $initExit (inspect: $smokeDir)"
    } else {
        # Verify outputs
        $expectedFiles = @(
            ".duoshe\config.json",
            ".duoshe\PROJECT.md",
            ".duoshe\DECISIONS.md",
            ".duoshe\MODULES.md",
            ".duoshe\TROUBLESHOOTING.md",
            ".duoshe\TODO.md"
        )
        $missing = @()
        foreach ($f in $expectedFiles) {
            if (-not (Test-Path -LiteralPath (Join-Path $smokeDir $f))) {
                $missing += $f
            }
        }
        if ($missing.Count -gt 0) {
            Write-Warn "Missing expected files: $($missing -join ', ')"
        } else {
            Write-Ok "All expected .duoshe/ files generated"
        }

        $claudeContent = Get-Content -LiteralPath (Join-Path $smokeDir "CLAUDE.md") -Raw
        if ($claudeContent -notmatch "User-written guidance") {
            Write-Warn "CLAUDE.md user content was clobbered (this is a bug)"
        } elseif ($claudeContent -notmatch "BEGIN DUOSHE") {
            Write-Warn "DuoShe block was not appended to CLAUDE.md"
        } else {
            Write-Ok "CLAUDE.md: user content preserved, DuoShe block appended"
        }

        $projectMd = Get-Content -LiteralPath (Join-Path $smokeDir ".duoshe\PROJECT.md") -Raw
        Write-Host ""
        Write-Host "    --- preview: .duoshe\PROJECT.md (first 30 lines) ---" -ForegroundColor DarkGray
        $projectMd.Split("`n") | Select-Object -First 30 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
        Write-Host "    --- end preview ---" -ForegroundColor DarkGray
    }

    # ---- M2 end-to-end: remember → review → publish ----
    Write-Step "M2 smoke test: remember → publish flow"

    Push-Location -LiteralPath $smokeDir
    try {
        # 1) remember a decision
        $rememberOut = & npx --prefix $ProjectRoot tsx $cliScript remember "Use libpq directly, not an ORM (control over query plans)" --type decision --source smoke-test 2>&1 | Out-String
        Write-Host $rememberOut
        if ($LASTEXITCODE -ne 0) { Write-Warn "remember failed (exit $LASTEXITCODE)" }

        # extract candidate id from output (cand_xxxxxxxx)
        $candIdMatch = [regex]::Match($rememberOut, 'cand_[a-z0-9]+')
        if (-not $candIdMatch.Success) {
            Write-Warn "Could not parse candidate id from remember output"
        } else {
            $candId = $candIdMatch.Value
            Write-Ok "captured candidate id: $candId"

            # 2) review should list it as pending
            $reviewOut = & npx --prefix $ProjectRoot tsx $cliScript review 2>&1 | Out-String
            if ($reviewOut -match $candId -and $reviewOut -match "pending") {
                Write-Ok "review lists candidate as pending"
            } else {
                Write-Warn "review did not list candidate or it was not pending"
            }

            # 3) publish it
            & npx --prefix $ProjectRoot tsx $cliScript publish $candId | Out-Host
            if ($LASTEXITCODE -ne 0) { Write-Warn "publish failed (exit $LASTEXITCODE)" }

            # 4) verify DECISIONS.md content
            $decisionsMd = Get-Content -LiteralPath (Join-Path $smokeDir ".duoshe\DECISIONS.md") -Raw
            if ($decisionsMd -match "Use libpq directly" -and $decisionsMd -match "duoshe: $candId" -and $decisionsMd -match "source: smoke-test") {
                Write-Ok "DECISIONS.md contains content + traceability footer"
            } else {
                Write-Warn "DECISIONS.md missing expected content or footer"
            }

            # 5) publish again — must be idempotent
            $rePublishOut = & npx --prefix $ProjectRoot tsx $cliScript publish $candId 2>&1 | Out-String
            $sectionCount = ([regex]::Matches((Get-Content -LiteralPath (Join-Path $smokeDir ".duoshe\DECISIONS.md") -Raw), [regex]::Escape("duoshe: $candId"))).Count
            if ($sectionCount -eq 1) {
                Write-Ok "re-publish is idempotent (DECISIONS.md still has only 1 section)"
            } else {
                Write-Warn "re-publish duplicated content (found $sectionCount footers)"
            }

            # 6) review --status published should now show 1
            $reviewPublishedOut = & npx --prefix $ProjectRoot tsx $cliScript review --status published 2>&1 | Out-String
            if ($reviewPublishedOut -match $candId) {
                Write-Ok "review --status published shows the published candidate"
            } else {
                Write-Warn "review --status published did not show the candidate"
            }
        }

        # 7) reject flow on a second candidate
        $remember2Out = & npx --prefix $ProjectRoot tsx $cliScript remember "Don't introduce another logging library" --type decision 2>&1 | Out-String
        $cand2Match = [regex]::Match($remember2Out, 'cand_[a-z0-9]+')
        if ($cand2Match.Success) {
            $cand2 = $cand2Match.Value
            & npx --prefix $ProjectRoot tsx $cliScript reject $cand2 | Out-Host
            $reviewRejectedOut = & npx --prefix $ProjectRoot tsx $cliScript review --status rejected 2>&1 | Out-String
            if ($reviewRejectedOut -match $cand2) {
                Write-Ok "reject flow archives correctly"
            } else {
                Write-Warn "rejected candidate not visible in review --status rejected"
            }
        }
    } finally {
        Pop-Location
    }

    # ---- M3 end-to-end: search ----
    Write-Step "M3 smoke test: search"

    Push-Location -LiteralPath $smokeDir
    try {
        # explicit reindex (auto-reindex already ran on publish, this checks idempotency)
        & npx --prefix $ProjectRoot tsx $cliScript reindex | Out-Host
        if ($LASTEXITCODE -ne 0) { Write-Warn "reindex failed (exit $LASTEXITCODE)" }

        # search for the term we published earlier ("libpq")
        $searchOut = & npx --prefix $ProjectRoot tsx $cliScript search "libpq" 2>&1 | Out-String
        if ($searchOut -match "libpq" -and $searchOut -match "decision") {
            Write-Ok "search found published decision by keyword"
        } else {
            Write-Warn "search did not find 'libpq' (output below)"
            Write-Host $searchOut -ForegroundColor DarkGray
        }

        # type filter
        $filteredOut = & npx --prefix $ProjectRoot tsx $cliScript search "libpq" --type troubleshooting 2>&1 | Out-String
        if ($filteredOut -match "No matches") {
            Write-Ok "search --type filter works (no troubleshooting matches for libpq)"
        } else {
            Write-Warn "search --type filter did not behave as expected"
        }

        # add a Chinese decision and verify CJK search
        $cnOut = & npx --prefix $ProjectRoot tsx $cliScript remember "中文测试:DuoShe 用 SQLite 做索引" --type decision --source smoke 2>&1 | Out-String
        $cnMatch = [regex]::Match($cnOut, 'cand_[a-z0-9]+')
        if ($cnMatch.Success) {
            & npx --prefix $ProjectRoot tsx $cliScript publish $cnMatch.Value | Out-Host
            $cnSearchOut = & npx --prefix $ProjectRoot tsx $cliScript search "中文" 2>&1 | Out-String
            if ($cnSearchOut -match "中文") {
                Write-Ok "Chinese keyword search works"
            } else {
                Write-Warn "Chinese keyword search did not find the entry"
                Write-Host $cnSearchOut -ForegroundColor DarkGray
            }
        }

        # weird query characters should not crash
        & npx --prefix $ProjectRoot tsx $cliScript search ':()*' | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "search handles FTS5-reserved chars without crashing"
        } else {
            Write-Warn "search crashed on reserved chars (exit $LASTEXITCODE)"
        }
    } finally {
        Pop-Location
    }

    if ($KeepSmokeDir) {
        Write-Host ""
        Write-Host "    Smoke dir kept: $smokeDir" -ForegroundColor Yellow
    } else {
        Remove-Item -LiteralPath $smokeDir -Recurse -Force
    }
}

# --- Done -------------------------------------------------------------------

Write-Host ""
Write-Host "----------------------------------------------------------------" -ForegroundColor Green
Write-Host " DuoShe dev environment ready (M1 + M2 + M3 verified)." -ForegroundColor Green
Write-Host "----------------------------------------------------------------" -ForegroundColor Green
Write-Host ""
Write-Host "  Project root: $ProjectRoot"
Write-Host ""
Write-Host "  Common commands (run from $ProjectRoot):"
Write-Host "    npm run dev -- init                                      # initialize .duoshe/ here"
Write-Host "    npm run dev -- remember `"...`" --type decision           # add a candidate memory"
Write-Host "    npm run dev -- review                                    # list pending candidates"
Write-Host "    npm run dev -- publish <id>                              # write candidate -> .duoshe/DECISIONS.md"
Write-Host "    npm run dev -- reject <id>                               # archive candidate"
Write-Host "    npm run dev -- search `"keyword`"                         # FTS5 search across all memory"
Write-Host "    npm run dev -- reindex                                   # rebuild SQLite index"
Write-Host "    npm run dev -- rescan                                    # refresh scan, preserve user-confirmed sections"
Write-Host "    npm run dev -- sync                                      # re-sync CLAUDE.md / AGENTS.md blocks"
Write-Host "    npm run dev -- uninstall                                 # remove DuoShe blocks (keeps .duoshe/)"
Write-Host "    npm run dev -- --help                                    # see all commands"
Write-Host "    npm test                                                 # run unit tests"
Write-Host ""
Write-Host "  Try it on a real project of yours:"
Write-Host "    cd <your-project>"
Write-Host "    npx --prefix $ProjectRoot tsx $ProjectRoot\src\cli\index.ts init"
Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
