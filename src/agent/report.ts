/**
 * src/agent/report.ts
 * ─────────────────────────────────────────────────────────────
 * Downloads the Playwright results.json artifact from GitHub Actions,
 * parses it into a structured summary, renders a self-contained
 * HTML dashboard, saves it locally, and opens it in the browser.
 *
 * Also exports formatJiraTable() which converts the summary into
 * Atlassian Document Format (ADF) table rows for Jira comments.
 */
import * as fs   from 'fs';
import * as path from 'path';
import * as os   from 'os';
import { Octokit } from 'octokit';
import * as dotenv from 'dotenv';
dotenv.config();

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const owner   = process.env.GITHUB_OWNER!;
const repo    = process.env.GITHUB_REPO!;

// ── Types ─────────────────────────────────────────────────────────────────────
export interface TestResult {
  suiteName:  string;   // describe block
  testTitle:  string;   // test name
  status:     'passed' | 'failed' | 'skipped' | 'flaky';
  durationMs: number;
  errorMessage?: string;
}

export interface RunSummary {
  runId:       number;
  runUrl:      string;
  conclusion:  string;
  startedAt:   string;
  totalTests:  number;
  passed:      number;
  failed:      number;
  skipped:     number;
  durationMs:  number;
  tests:       TestResult[];
}

// ── Download artifact ─────────────────────────────────────────────────────────
async function downloadArtifact(runId: number): Promise<string | null> {
  try {
    // Fetch results.json from the agent branch via the Contents API
    // (the CI workflow commits it there after each run — no artifact auth needed)
    const agentBranch = process.env.GITHUB_BRANCH ?? 'agent/auto-tests';
    console.log(`   📥  Fetching results.json from branch "${agentBranch}"…`);

    // Wait a few seconds for the CI commit to propagate
    await new Promise((r) => setTimeout(r, 5_000));

    const { data } = await octokit.rest.repos.getContent({
      owner, repo,
      path: 'playwright-report/results.json',
      ref:  agentBranch,
    });

    if (Array.isArray(data) || !('content' in data)) {
      console.log('   ⚠️   results.json not found on agent branch');
      return null;
    }

    const json    = Buffer.from(data.content, 'base64').toString('utf-8');
    const tmpPath = path.join(os.tmpdir(), `pw-results-${runId}.json`);
    fs.writeFileSync(tmpPath, json, 'utf-8');
    console.log('   ✓   results.json fetched successfully');
    return tmpPath;
  } catch (err) {
    console.log('   ⚠️   Could not fetch results.json:', (err as Error).message);
    return null;
  }
}


// ── Parse Playwright JSON report ──────────────────────────────────────────────
function parsePlaywrightJson(jsonPath: string, runId: number, runUrl: string, conclusion: string): RunSummary {
  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

  const tests: TestResult[] = [];
  let totalMs = 0;

  function walk(suite: Record<string, unknown>) {
    const suiteName = String(suite['title'] ?? '');
    const specs = (suite['specs'] as Array<Record<string, unknown>>) ?? [];
    const suites = (suite['suites'] as Array<Record<string, unknown>>) ?? [];

    for (const spec of specs) {
      const testTitle = String(spec['title'] ?? '');
      for (const test of (spec['tests'] as Array<Record<string, unknown>>) ?? []) {
        const results = (test['results'] as Array<Record<string, unknown>>) ?? [];
        const lastResult = results[results.length - 1] ?? {};
        const status = String(lastResult['status'] ?? 'skipped') as TestResult['status'];
        const durationMs = Number(lastResult['duration'] ?? 0);
        totalMs += durationMs;
        const errorMessage = (lastResult['error'] as Record<string, unknown> | undefined)
          ? String((lastResult['error'] as Record<string, unknown>)['message'] ?? '')
          : undefined;

        tests.push({ suiteName, testTitle, status, durationMs, errorMessage });
      }
    }

    for (const child of suites) walk(child);
  }

  for (const suite of (raw['suites'] as Array<Record<string, unknown>>) ?? []) {
    walk(suite);
  }

  const passed  = tests.filter((t) => t.status === 'passed').length;
  const failed  = tests.filter((t) => t.status === 'failed').length;
  const skipped = tests.filter((t) => t.status === 'skipped').length;

  return {
    runId,
    runUrl,
    conclusion,
    startedAt:  new Date().toUTCString(),
    totalTests: tests.length,
    passed, failed, skipped,
    durationMs: totalMs,
    tests,
  };
}

// ── HTML dashboard ────────────────────────────────────────────────────────────
function buildHtmlDashboard(summary: RunSummary): string {
  const passRate = summary.totalTests > 0
    ? Math.round((summary.passed / summary.totalTests) * 100)
    : 0;

  const statusColor = summary.conclusion === 'success' ? '#02C39A' : '#E24B4A';
  const statusLabel = summary.conclusion === 'success' ? '✅ PASSED' : '❌ FAILED';

  const rows = summary.tests.map((t) => {
    const icon  = t.status === 'passed' ? '✅' : t.status === 'failed' ? '❌' : '⏭';
    const color = t.status === 'passed' ? '#02C39A' : t.status === 'failed' ? '#E24B4A' : '#888';
    const dur   = t.durationMs < 1000
      ? `${t.durationMs}ms`
      : `${(t.durationMs / 1000).toFixed(1)}s`;
    const err   = t.errorMessage
      ? `<div class="err">${t.errorMessage.replace(/</g, '&lt;').substring(0, 200)}</div>`
      : '';
    return `
      <tr>
        <td class="suite">${t.suiteName.replace(/</g, '&lt;')}</td>
        <td>${t.testTitle.replace(/</g, '&lt;')}</td>
        <td style="color:${color};font-weight:600">${icon} ${t.status}</td>
        <td class="dur">${dur}</td>
      </tr>
      ${err ? `<tr><td colspan="4">${err}</td></tr>` : ''}`;
  }).join('');

  const barWidth = passRate;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Playwright Test Report — Run #${summary.runId}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
       background:#0f172a;color:#e2e8f0;min-height:100vh;padding:2rem}
  h1{font-size:1.6rem;font-weight:600;color:#f8fafc;margin-bottom:0.25rem}
  .sub{font-size:0.85rem;color:#64748b;margin-bottom:2rem}
  a{color:#4FC3F7;text-decoration:none}
  a:hover{text-decoration:underline}

  /* stat cards */
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:1rem;margin-bottom:2rem}
  .card{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:1.2rem 1rem;text-align:center}
  .card .num{font-size:2rem;font-weight:700;line-height:1}
  .card .lbl{font-size:0.75rem;color:#94a3b8;margin-top:0.4rem;text-transform:uppercase;letter-spacing:.05em}
  .card.overall .num{color:${statusColor}}
  .card.pass    .num{color:#02C39A}
  .card.fail    .num{color:#E24B4A}
  .card.skip    .num{color:#64748b}
  .card.dur     .num{font-size:1.4rem;color:#4FC3F7}

  /* progress bar */
  .bar-wrap{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:1.2rem;margin-bottom:2rem}
  .bar-label{display:flex;justify-content:space-between;font-size:0.8rem;color:#94a3b8;margin-bottom:0.6rem}
  .bar-track{background:#334155;border-radius:999px;height:12px;overflow:hidden}
  .bar-fill{height:100%;border-radius:999px;background:linear-gradient(90deg,#02C39A,#4FC3F7);
            width:${barWidth}%;transition:width 0.6s ease}

  /* table */
  .tbl-wrap{background:#1e293b;border:1px solid #334155;border-radius:12px;overflow:hidden}
  .tbl-head{padding:1rem 1.2rem;border-bottom:1px solid #334155;
            font-size:0.85rem;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em}
  table{width:100%;border-collapse:collapse}
  th{padding:0.7rem 1rem;text-align:left;font-size:0.75rem;font-weight:600;
     color:#64748b;background:#162032;text-transform:uppercase;letter-spacing:.05em}
  td{padding:0.65rem 1rem;font-size:0.85rem;border-top:1px solid #1e293b;vertical-align:top}
  tr:hover td{background:#162032}
  .suite{color:#94a3b8;font-size:0.8rem}
  .dur{color:#64748b;font-size:0.8rem;white-space:nowrap}
  .err{background:#2d1515;color:#fca5a5;font-family:monospace;font-size:0.75rem;
       padding:0.5rem 0.75rem;border-radius:6px;margin:0.25rem 0 0.5rem;
       border-left:3px solid #E24B4A;white-space:pre-wrap;word-break:break-all}

  /* run link */
  .run-link{margin-bottom:1.5rem;font-size:0.85rem}
  .badge{display:inline-block;padding:0.2rem 0.7rem;border-radius:999px;
         font-size:0.75rem;font-weight:600;background:${statusColor}22;color:${statusColor};
         border:1px solid ${statusColor}55;margin-right:0.5rem}
</style>
</head>
<body>

<h1>Playwright Test Report</h1>
<p class="sub">Agentic AI POC &nbsp;·&nbsp; Run #${summary.runId} &nbsp;·&nbsp; ${summary.startedAt}</p>

<div class="run-link">
  <span class="badge">${statusLabel}</span>
  <a href="${summary.runUrl}" target="_blank">View full GitHub Actions run ↗</a>
</div>

<div class="cards">
  <div class="card overall">
    <div class="num">${statusLabel}</div>
    <div class="lbl">Overall</div>
  </div>
  <div class="card pass">
    <div class="num">${summary.passed}</div>
    <div class="lbl">Passed</div>
  </div>
  <div class="card fail">
    <div class="num">${summary.failed}</div>
    <div class="lbl">Failed</div>
  </div>
  <div class="card skip">
    <div class="num">${summary.skipped}</div>
    <div class="lbl">Skipped</div>
  </div>
  <div class="card dur">
    <div class="num">${(summary.durationMs / 1000).toFixed(1)}s</div>
    <div class="lbl">Total time</div>
  </div>
  <div class="card">
    <div class="num" style="color:#f8fafc">${passRate}%</div>
    <div class="lbl">Pass rate</div>
  </div>
</div>

<div class="bar-wrap">
  <div class="bar-label">
    <span>Pass rate</span>
    <span>${summary.passed} / ${summary.totalTests} tests passed</span>
  </div>
  <div class="bar-track"><div class="bar-fill"></div></div>
</div>

<div class="tbl-wrap">
  <div class="tbl-head">Test results — ${summary.totalTests} tests</div>
  <table>
    <thead>
      <tr>
        <th style="width:28%">Suite</th>
        <th>Test</th>
        <th style="width:11%">Status</th>
        <th style="width:8%">Duration</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</div>

</body>
</html>`;
}

// ── Jira ADF table rows ───────────────────────────────────────────────────────
export function buildJiraAdfBody(summary: RunSummary, issueKey: string, allKeys: string[]): object {
  const passRate = summary.totalTests > 0
    ? Math.round((summary.passed / summary.totalTests) * 100)
    : 0;
  const icon      = summary.conclusion === 'success' ? '✅' : '❌';
  const ciResult  = summary.conclusion === 'success' ? 'PASS' : 'FAIL';
  const duration  = (summary.durationMs / 1000).toFixed(1);

  // Header paragraph — only the five requested fields
  const headerText =
    `Story     : ${issueKey}\n` +
    `CI Result : ${icon} ${ciResult}\n` +
    `Pass Rate : ${passRate}% (${summary.passed} of ${summary.totalTests} tests passed)\n` +
    `Duration  : ${duration}s`;

  // Build ADF table rows: suite | test name | status | duration
  const tableRows = summary.tests.map((t) => {
    const statusIcon = t.status === 'passed' ? '✅ passed' : t.status === 'failed' ? '❌ failed' : '⏭ skipped';
    const dur = t.durationMs < 1000 ? `${t.durationMs}ms` : `${(t.durationMs / 1000).toFixed(1)}s`;
    return {
      type: 'tableRow',
      content: [
        { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: t.suiteName }] }] },
        { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: t.testTitle }] }] },
        { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: statusIcon }] }] },
        { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: dur }] }] },
      ],
    };
  });

  const headerRow = {
    type: 'tableRow',
    content: [
      { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Suite' }] }] },
      { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Test' }] }] },
      { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Status' }] }] },
      { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Duration' }] }] },
    ],
  };

  return {
    type: 'doc',
    version: 1,
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: headerText }],
      },
      {
        type: 'table',
        attrs: { isNumberColumnEnabled: false, layout: 'default' },
        content: [headerRow, ...tableRows],
      },
    ],
  };
}

// ── Save HTML (does NOT open — caller handles opening) ───────────────────────
function saveHtml(html: string, runId: number, prefix: string): string {
  const reportsDir = path.join(process.cwd(), 'local-reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  const outPath = path.join(reportsDir, `${prefix}-${runId}.html`);
  fs.writeFileSync(outPath, html, 'utf-8');
  return outPath;
}

/** Open two HTML files in a NEW browser session with each on its own tab.
 *  Uses spawn/detach so the browser process never blocks the agent. */
/** Open one or two HTML files in a brand-new browser window.
 *  Always forces --new-window so it never reuses an existing session.
 *  file2 is optional — pass only file1 when no report is available. */
export function openInNewBrowserSession(file1: string, file2?: string): void {
  const { spawn } = require('child_process');

  const spawnDetached = (cmd: string, args: string[]) => {
    const proc = spawn(cmd, args, { detached: true, stdio: 'ignore', shell: false });
    proc.unref();
  };

  const chromePaths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ];

  const urls = file2
    ? [`file://${file1}`, `file://${file2}`]
    : [`file://${file1}`];

  // Try Chromium-based browsers first — only they support --new-window with multiple URLs
  for (const chromePath of chromePaths) {
    if (fs.existsSync(chromePath)) {
      try {
        spawnDetached(chromePath, ['--new-window', ...urls]);
        console.log(`   🌐  Opened new browser window: ${urls.length} tab(s)`);
        return;
      } catch { continue; }
    }
  }

  // Fallback: use macOS 'open -n' which forces a new app instance
  try {
    spawnDetached('open', ['-n', '-a', 'Safari', file1]);
    if (file2) {
      setTimeout(() => spawnDetached('open', ['-a', 'Safari', file2]), 1000);
    }
    console.log(`   🌐  Opened in new Safari window`);
  } catch {
    console.log(`   📄  Reports saved to: ${urls.join(', ')}`);
  }
}

// ── Public entry point ────────────────────────────────────────────────────────
export async function buildAndShowReport(
  runId: number,
  runUrl: string,
  conclusion: string,
  preloadedJsonPath?: string,
): Promise<{ summary: RunSummary; reportPath: string } | null> {
  console.log('\n📊  Building test results dashboard…');

  const jsonPath = preloadedJsonPath ?? await downloadArtifact(runId);
  if (!jsonPath) {
    console.log('   ⚠️   No results.json available — dashboard skipped');
    return null;
  }

  const summary    = parsePlaywrightJson(jsonPath, runId, runUrl, conclusion);
  const html       = buildHtmlDashboard(summary);
  const reportPath = saveHtml(html, runId, 'report');

  console.log(`   ✓  ${summary.totalTests} tests — ${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped`);
  console.log(`   💾  Dashboard saved: ${reportPath}`);
  return { summary, reportPath };
}
