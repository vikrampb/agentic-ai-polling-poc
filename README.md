# Agentic AI — Automated Test Framework (Polling Edition)

An end-to-end autonomous testing pipeline. Claude reads Jira stories, writes Playwright test assertions, and the framework handles everything else — story discovery, CI execution, results storage, Jira updates, regression suite management, and automatic bug ticket creation.

---

## Quick start

```bash
npm run sync-and-poll   # Retag + poll Jira + run full pipeline (recommended)
npm run poll            # Poll only — skips retag sync
npm run retag           # Sync @regression tags with Jira labels only
npm run db:init         # Seed the SQLite database (first-time setup)
```

---

## How It Works — Step by Step

| Step | What happens |
|------|-------------|
| **1** | Jira poller queries for `status = "In Review"` stories every 30s |
| **2** | New stories added to `data/suite-manifest.json` |
| **3** | Existing stories revalidated — removed from suite if no longer "In Review" |
| **4** | Claude generates tests: AC mode (numbered AC points) or Description mode |
| **5** | Regression label detected → every test tagged `{ tag: ['@regression'] }` |
| **6** | Spec files committed to `agent/auto-tests` branch |
| **7** | GitHub Actions CI triggered — Playwright tests run |
| **8** | HTML report committed to `results-history/` (last 10 kept) |
| **9** | Comment + HTML attachment posted to each Jira ticket |
| **10** | Story transitioned to Done on pass. Jira Bug tickets auto-created on failure |

---

## Test Generation — Two Modes

**AC Mode** (story has numbered Acceptance Criteria):
- TypeScript parses each numbered AC point — count determined before Claude is called
- Claude called once per AC point — writes 3-5 assertion lines only
- TypeScript wraps each in exactly one `test()` block
- Result: exactly N tests for N AC points — guaranteed

**Description Mode** (no numbered AC):
- Claude reads the full story description
- Infers Happy Path, Boundary Conditions and Negative Test scenarios
- Generates 2-3 tests per describe block (6-9 tests total)
- Plain business language for test names

---

## Three Ways to Run the Pipeline

### 1. Local polling — demo mode
```bash
npm run sync-and-poll
```
Runs retag sync first, then polls Jira every 30 seconds. Best for live demos.

### 2. GitHub Actions — CI workflow (`ci.yml`)
Triggered automatically when the agent pushes new tests, nightly at midnight UTC, or on demand from the GitHub Actions UI.

### 3. GitHub Actions — Poll workflow (`poll.yml`)
Runs the full polling pipeline on GitHub's cloud on a configurable schedule. Uncomment the `cron:` line in `poll.yml` for production use.

---

## Regression Suite

### How @regression tags get added

**Automatic** — add the **Regression** label to a Jira story before it moves to "In Review". The poller detects it and Claude tags every generated test with `{ tag: ['@regression'] }`.

**Retroactive** — add the Regression label to any story in any status, then the next regression workflow run picks it up automatically via the built-in retag step.

### npm run retag — bidirectional sync

| Scenario | Action |
|---|---|
| Story has Regression label + spec has `@regression` | Skip (correct) |
| Story has Regression label + spec missing `@regression` | Add tags |
| Story has no Regression label + spec has `@regression` | Remove tags |
| Story has no Regression label + spec has no `@regression` | Skip (correct) |
| Story has Regression label + no spec file | Warn — run `npm run sync-and-poll` first |

### Running the regression workflow

From GitHub UI:
```
https://github.com/vikrampb/agentic-ai-polling-poc/actions/workflows/regression.yml
```
Click **Run workflow** → branch: `main` → **Run workflow**

On a schedule — uncomment one line in `regression.yml`:
```yaml
# schedule:
#   - cron: '0 * * * *'    # Every hour
#   - cron: '0 0 * * *'    # Nightly
#   - cron: '0 0 * * 0'    # Weekly
```

### What the regression workflow does automatically
1. Runs `npm run retag` — syncs Jira Regression labels with spec files
2. Overlays freshly tagged specs from agent branch
3. Runs `npx playwright test --grep @regression`
4. Saves HTML report to `regression-history/` on agent branch (last 10 kept)

### Key rules for spec file preservation
- Spec files with `@regression` tags are **never deleted** by the poll cleanup
- Spec files for stories in **Done** status are **never deleted** by the poll cleanup
- Spec files for stories with the **Regression label** are **never deleted** by the poll cleanup
- Only truly orphaned specs (story no longer exists in Jira) are deleted

---

## Bug Auto-Creation

When CI fails, the framework automatically:
1. Parses `results.json` for failed tests
2. Creates a Jira Bug ticket per failed test with error message, stack trace and CI run link
3. Links the bug to the parent story
4. Checks for duplicates — won't re-create the same bug on repeated failures

---

## SQLite Database — 10 Users

| Name | export_status | team_name |
|------|--------------|-----------|
| Captain America | US_PERSON | PBE |
| Iron Man | US_PERSON | DPS |
| Spider-Man | US_PERSON | PBE |
| Black Widow | US_PERSON | DPS |
| Hawkeye | US_PERSON | null |
| War Machine | US_PERSON | DPS |
| Green Goblin | NON_US_PERSON | PBE |
| Doctor Doom | NON_US_PERSON | DPS |
| Red Skull | NON_US_PERSON | null |
| Loki | NON_US_PERSON | null |

---

## Mock Server Endpoints

| Endpoint | Response |
|----------|----------|
| `GET /api/users` | All users with password and team_name |
| `GET /api/login?username=u&password=p` | `{ success, message, exportStatus }` |
| `GET /health` | `{ status: "ok" }` |

**Exact server messages:**
- US_PERSON login success: `"Login successful. Welcome!"`
- NON_US_PERSON blocked: `"Only US Persons are allowed to watch this demo."`
- Invalid credentials: `"Invalid UserID/Password combination. Please verify."`
- Missing credentials: `"Missing credentials."`

---

## Viewing Results

```bash
# Normal run history
git fetch origin agent/auto-tests
git show origin/agent/auto-tests:results-history/index.html > /tmp/results.html
open /tmp/results.html

# Regression run history
git show origin/agent/auto-tests:regression-history/index.html > /tmp/regression.html
open /tmp/regression.html
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | From console.anthropic.com/keys |
| `JIRA_HOST` | — | e.g. `mycompany.atlassian.net` |
| `JIRA_EMAIL` | — | Your Atlassian login email |
| `JIRA_API_TOKEN` | — | From id.atlassian.com/manage-profile/security/api-tokens |
| `JIRA_PROJECT_KEY` | `AQA` | Jira project to poll |
| `JIRA_READY_STATUS` | `In Review` | Status that triggers test generation |
| `JIRA_POLL_INTERVAL_MS` | `30000` | Poll interval in ms (30s demo / 3600000 for 1hr) |
| `MAX_SUITE_SIZE` | `0` | Max stories in suite (0 = unlimited) |
| `MAX_HISTORY_RUNS` | `10` | HTML reports to keep |
| `GITHUB_TOKEN` | — | Fine-grained PAT |
| `GITHUB_OWNER` | — | Your GitHub username |
| `GITHUB_REPO` | `agentic-ai-polling-poc` | Repo name |
| `GITHUB_BRANCH` | `agent/auto-tests` | Agent branch |
| `DB_PATH` | `./data/users.db` | SQLite database path |
| `RUN_MODE` | `interactive` | Set to `poll` for polling mode |

---

## GitHub Actions Secrets Required

| Secret | Value |
|---|---|
| `JIRA_HOST` | e.g. `mycompany.atlassian.net` |
| `JIRA_EMAIL` | Your Atlassian email |
| `JIRA_API_TOKEN` | Your Atlassian API token |
| `JIRA_ISSUE_KEY` | Fallback issue key e.g. `AQA-1` |
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `GH_PAT` | GitHub fine-grained PAT |
| `GH_OWNER` | Your GitHub username |
| `GH_REPO` | `agentic-ai-polling-poc` |

---

## Three GitHub Actions Workflows

| File | Trigger | Purpose |
|---|---|---|
| `ci.yml` | Push to agent branch, nightly, on-demand | Full test suite — all spec files on agent branch |
| `regression.yml` | On-demand + configurable schedule | Auto-syncs Jira labels → runs only `@regression` tests |
| `poll.yml` | Configurable schedule | Cloud polling — replaces `npm run sync-and-poll` for production |

---

## Pre-Demo Checklist

Run all checks from the `main` branch:

```bash
cd /Users/vikrampb/Projects/agentic-ai-polling-poc
git checkout main

# 1. Only build_regression_index.py on agent branch
git fetch origin agent/auto-tests
git ls-tree origin/agent/auto-tests --name-only -r

# 2. No spec files
git ls-tree origin/agent/auto-tests --name-only -r | grep spec

# 3. No history files
git ls-tree origin/agent/auto-tests --name-only -r | grep -E "results-history|regression-history"

# 4. Script intact on agent branch
git show origin/agent/auto-tests:scripts/build_regression_index.py | head -3

# 5. Regression workflow has retag and correct branch
grep -E "retag|GITHUB_BRANCH" .github/workflows/regression.yml | head -5

# 6. Local data clean
ls data/

# 7. Database has 10 users
sqlite3 data/users.db "SELECT COUNT(*) FROM users;"
```

**Expected results:** Check 1 → only `scripts/build_regression_index.py` · Check 2 → no output · Check 3 → no output · Check 4 → first 3 lines of Python script · Check 5 → shows `retag.ts` and `agent/auto-tests` · Check 6 → only `users.db` · Check 7 → `10`

---

## Clean Slate Steps

```bash
cd /Users/vikrampb/Projects/agentic-ai-polling-poc
git checkout agent/auto-tests
git pull origin agent/auto-tests
git ls-files | grep -v "^scripts/build_regression_index\.py$" | xargs git rm -f 2>/dev/null || true
git commit -m "chore: clean slate for fresh demo run" --allow-empty
git push origin agent/auto-tests
git checkout main
rm -f data/suite-manifest.json
rm -rf local-reports/
npm run db:init
```

Then reset Jira: move all stories to **To Do**, set Regression labels as needed, close any auto-generated bug tickets.

---

## Project Structure

```
agentic-ai-polling-poc/
├── .env.example
├── .github/workflows/
│   ├── ci.yml              # Full test suite — nightly + on-demand
│   ├── regression.yml      # Regression suite — auto-syncs Jira labels
│   └── poll.yml            # Cloud polling — runs pipeline on a schedule
├── scripts/
│   ├── mockServer.ts        # Express API (/api/users, /api/login, /health)
│   └── build_regression_index.py  # Builds regression-history/index.html
└── src/
    ├── agent/
    │   ├── index.ts         # Orchestrator — polling + pipeline
    │   ├── jiraPoller.ts    # JQL polling + suite manifest + revalidation
    │   ├── resultsHistory.ts # Run history management
    │   ├── testGenerator.ts  # Claude test generation (AC mode + description mode)
    │   ├── retag.ts         # Bidirectional @regression sync with Jira labels
    │   └── report.ts        # HTML dashboard + Jira ADF comment builder
    ├── db/
    │   └── seed.ts          # 10-user SQLite seeder
    ├── jira/
    │   ├── client.ts        # Atlassian REST API v3
    │   └── createBugs.ts    # Auto-creates Jira Bug tickets for failed tests
    └── github/
        └── client.ts        # Octokit wrapper
```

---

## Security Notes

- Passwords in DB are plain-text **for POC only**
- `GET /api/users` returns passwords **for POC only**
- Never commit `.env` — it is in `.gitignore`
- If `.env` is accidentally committed to any branch, rotate all exposed keys immediately
- GitHub fine-grained PAT should be scoped to this repo only
