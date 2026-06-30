/**
 * src/agent/resultsHistory.ts
 * ─────────────────────────────────────────────────────────────
 * Manages the results-history/ folder on the agent branch.
 * Keeps the last 10 run HTML reports and cleans up on the 11th.
 *
 * Folder structure on agent/auto-tests branch:
 *   results-history/
 *     run-001-2026-06-29T17-00-00.html
 *     run-002-2026-06-29T18-00-00.html
 *     ...
 *     index.html   ← auto-generated index linking all runs
 */
import { Octokit } from 'octokit';
import * as fs   from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config();

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const owner   = process.env.GITHUB_OWNER!;
const repo    = process.env.GITHUB_REPO!;
const branch  = process.env.GITHUB_BRANCH ?? 'agent/auto-tests';

const MAX_HISTORY = parseInt(process.env.MAX_HISTORY_RUNS ?? '10');

export interface HistoryEntry {
  filename:   string;
  path:       string;
  sha:        string;
  runNumber:  number;
  timestamp:  string;
  conclusion: string;
}

// ── List existing history files on agent branch ───────────────────────────────
export async function listHistoryFiles(): Promise<HistoryEntry[]> {
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner, repo, path: 'results-history', ref: branch,
    });
    if (!Array.isArray(data)) return [];

    return data
      .filter((f) => f.name.endsWith('.html') && f.name !== 'index.html')
      .map((f) => {
        // filename format: run-NNN-TIMESTAMP-CONCLUSION.html
        const match = f.name.match(/^run-(\d+)-(.+)-(passed|failed)\.html$/);
        return {
          filename:   f.name,
          path:       f.path,
          sha:        f.sha,
          runNumber:  match ? parseInt(match[1]) : 0,
          timestamp:  match ? match[2] : '',
          conclusion: match ? match[3] : 'unknown',
        };
      })
      .sort((a, b) => a.runNumber - b.runNumber);
  } catch {
    return [];
  }
}

// ── Delete oldest files if over MAX_HISTORY ───────────────────────────────────
export async function pruneHistory(entries: HistoryEntry[]): Promise<HistoryEntry[]> {
  if (entries.length <= MAX_HISTORY) return entries;

  const toDelete = entries.slice(0, entries.length - MAX_HISTORY);
  console.log(`   🗑️   Pruning ${toDelete.length} old run(s) from results-history/`);

  for (const entry of toDelete) {
    await octokit.rest.repos.deleteFile({
      owner, repo,
      path:    entry.path,
      message: `chore: prune old run ${entry.filename} [skip ci]`,
      sha:     entry.sha,
      branch,
    });
    console.log(`      ✓  Deleted ${entry.filename}`);
  }

  return entries.slice(entries.length - MAX_HISTORY);
}

// ── Commit a new HTML report to results-history/ ──────────────────────────────
export async function commitRunReport(
  html:       string,
  runNumber:  number,
  conclusion: string,
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename  = `run-${String(runNumber).padStart(3, '0')}-${timestamp}-${conclusion}.html`;
  const filePath  = `results-history/${filename}`;

  await octokit.rest.repos.createOrUpdateFileContents({
    owner, repo,
    path:    filePath,
    message: `ci: add run report ${filename} [skip ci]`,
    content: Buffer.from(html).toString('base64'),
    branch,
  });

  console.log(`   📄  Run report committed: ${filename}`);
  return filename;
}

// ── Generate and commit the index.html ───────────────────────────────────────
export async function commitIndex(entries: HistoryEntry[], newFilename?: string): Promise<void> {
  const rows = [...entries]
    .reverse()
    .map((e, i) => {
      const icon  = e.conclusion === 'passed' ? '✅' : '❌';
      const isNew = e.filename === newFilename;
      return `
      <tr${isNew ? ' class="new"' : ''}>
        <td>#${e.runNumber}</td>
        <td>${e.timestamp.replace(/-/g, ':').replace('T', ' ')}</td>
        <td>${icon} ${e.conclusion.toUpperCase()}</td>
        <td><a href="${e.filename}">View Report</a></td>
      </tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Test Run History</title>
<style>
  body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;padding:2rem;max-width:800px;margin:0 auto}
  h1{font-size:1.5rem;margin-bottom:1.5rem;color:#f8fafc}
  table{width:100%;border-collapse:collapse;background:#1e293b;border-radius:8px;overflow:hidden}
  th{padding:.75rem 1rem;text-align:left;background:#162032;font-size:.75rem;text-transform:uppercase;
     letter-spacing:.05em;color:#64748b}
  td{padding:.75rem 1rem;border-top:1px solid #334155;font-size:.875rem}
  tr.new td{background:#1a2f1a}
  a{color:#4FC3F7;text-decoration:none}
  a:hover{text-decoration:underline}
  .badge{font-size:.7rem;padding:2px 8px;border-radius:999px;background:#02C39A22;color:#02C39A;margin-left:.5rem}
</style>
</head>
<body>
<h1>Test Run History <span class="badge">Last ${MAX_HISTORY} runs</span></h1>
<table>
  <thead><tr><th>Run</th><th>Timestamp</th><th>Result</th><th>Report</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
</body>
</html>`;

  // Check for existing index sha
  let sha: string | undefined;
  try {
    const existing = await octokit.rest.repos.getContent({ owner, repo, path: 'results-history/index.html', ref: branch });
    if (!Array.isArray(existing.data) && 'sha' in existing.data) sha = existing.data.sha;
  } catch { /* new file */ }

  await octokit.rest.repos.createOrUpdateFileContents({
    owner, repo,
    path:    'results-history/index.html',
    message: 'ci: update results history index [skip ci]',
    content: Buffer.from(html).toString('base64'),
    branch,
    ...(sha ? { sha } : {}),
  });

  console.log('   📋  History index updated: results-history/index.html');
}


// ══════════════════════════════════════════════════════════════════════════════
// REGRESSION HISTORY
// Stored in results-history/regression-NNN-TIMESTAMP-CONCLUSION.html
// Kept to MAX_HISTORY runs, pruned same as normal runs.
// ══════════════════════════════════════════════════════════════════════════════

export async function listRegressionFiles(): Promise<HistoryEntry[]> {
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner, repo, path: 'regression-history', ref: branch,
    });
    if (!Array.isArray(data)) return [];
    return data
      .filter((f) => f.name.endsWith('.html') && f.name !== 'index.html')
      .map((f) => {
        const match = f.name.match(/^regression-(\d+)-(.+)-(passed|failed)\.html$/);
        return {
          filename:   f.name,
          path:       f.path,
          sha:        f.sha,
          runNumber:  match ? parseInt(match[1]) : 0,
          timestamp:  match ? match[2] : '',
          conclusion: match ? match[3] : 'unknown',
        };
      })
      .sort((a, b) => a.runNumber - b.runNumber);
  } catch {
    return [];
  }
}

export async function pruneRegressionHistory(entries: HistoryEntry[]): Promise<HistoryEntry[]> {
  if (entries.length <= MAX_HISTORY) return entries;
  const toDelete = entries.slice(0, entries.length - MAX_HISTORY);
  console.log(`   Pruning ${toDelete.length} old regression run(s)`);
  for (const entry of toDelete) {
    await octokit.rest.repos.deleteFile({
      owner, repo,
      path:    entry.path,
      message: `chore: prune old regression run ${entry.filename} [skip ci]`,
      sha:     entry.sha,
      branch,
    });
  }
  return entries.slice(entries.length - MAX_HISTORY);
}

export async function commitRegressionReport(
  html:       string,
  runNumber:  number,
  conclusion: string,
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename  = `regression-${String(runNumber).padStart(3, '0')}-${timestamp}-${conclusion}.html`;
  const filePath  = `regression-history/${filename}`;

  await octokit.rest.repos.createOrUpdateFileContents({
    owner, repo,
    path:    filePath,
    message: `ci: add regression report ${filename} [skip ci]`,
    content: Buffer.from(html).toString('base64'),
    branch,
  });

  console.log(`   Regression report committed: ${filename}`);
  return filename;
}

export async function commitRegressionIndex(entries: HistoryEntry[], newFilename?: string): Promise<void> {
  const rows = [...entries]
    .reverse()
    .map((e) => {
      const icon  = e.conclusion === 'passed' ? '\u2705' : '\u274C';
      const isNew = e.filename === newFilename;
      return `
      <tr${isNew ? ' class="new"' : ''}>
        <td>#${e.runNumber}</td>
        <td>${e.timestamp.replace(/-/g, ':').replace('T', ' ')}</td>
        <td>${icon} ${e.conclusion.toUpperCase()}</td>
        <td><a href="${e.filename}">View Report</a></td>
      </tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Regression Run History</title>
<style>
  body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;padding:2rem;max-width:800px;margin:0 auto}
  h1{font-size:1.5rem;margin-bottom:1.5rem;color:#f8fafc}
  table{width:100%;border-collapse:collapse;background:#1e293b;border-radius:8px;overflow:hidden}
  th{padding:.75rem 1rem;text-align:left;background:#162032;font-size:.75rem;text-transform:uppercase;letter-spacing:.05em;color:#64748b}
  td{padding:.75rem 1rem;border-top:1px solid #334155;font-size:.875rem}
  tr.new td{background:#1a2f1a}
  a{color:#4FC3F7;text-decoration:none}
  .badge{font-size:.7rem;padding:2px 8px;border-radius:999px;background:#9333ea22;color:#9333ea;margin-left:.5rem}
</style>
</head>
<body>
<h1>Regression Run History <span class="badge">@regression tests only</span></h1>
<table>
  <thead><tr><th>Run</th><th>Timestamp</th><th>Result</th><th>Report</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
</body>
</html>`;

  let sha: string | undefined;
  try {
    const existing = await octokit.rest.repos.getContent({ owner, repo, path: 'regression-history/index.html', ref: branch });
    if (!Array.isArray(existing.data) && 'sha' in existing.data) sha = existing.data.sha;
  } catch { /* new file */ }

  await octokit.rest.repos.createOrUpdateFileContents({
    owner, repo,
    path:    'regression-history/index.html',
    message: 'ci: update regression history index [skip ci]',
    content: Buffer.from(html).toString('base64'),
    branch,
    ...(sha ? { sha } : {}),
  });

  console.log('   Regression index updated: regression-history/index.html');
}


// ══════════════════════════════════════════════════════════════════════════════
// REGRESSION HISTORY
// Stored in results-history/regression-NNN-TIMESTAMP-CONCLUSION.html
// Kept to MAX_HISTORY runs, pruned same as normal runs.
// ══════════════════════════════════════════════════════════════════════════════

export async function listRegressionFiles(): Promise<HistoryEntry[]> {
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner, repo, path: 'regression-history', ref: branch,
    });
    if (!Array.isArray(data)) return [];
    return data
      .filter((f) => f.name.endsWith('.html') && f.name !== 'index.html')
      .map((f) => {
        const match = f.name.match(/^regression-(\d+)-(.+)-(passed|failed)\.html$/);
        return {
          filename:   f.name,
          path:       f.path,
          sha:        f.sha,
          runNumber:  match ? parseInt(match[1]) : 0,
          timestamp:  match ? match[2] : '',
          conclusion: match ? match[3] : 'unknown',
        };
      })
      .sort((a, b) => a.runNumber - b.runNumber);
  } catch {
    return [];
  }
}

export async function pruneRegressionHistory(entries: HistoryEntry[]): Promise<HistoryEntry[]> {
  if (entries.length <= MAX_HISTORY) return entries;
  const toDelete = entries.slice(0, entries.length - MAX_HISTORY);
  console.log(`   Pruning ${toDelete.length} old regression run(s)`);
  for (const entry of toDelete) {
    await octokit.rest.repos.deleteFile({
      owner, repo,
      path:    entry.path,
      message: `chore: prune old regression run ${entry.filename} [skip ci]`,
      sha:     entry.sha,
      branch,
    });
  }
  return entries.slice(entries.length - MAX_HISTORY);
}

export async function commitRegressionReport(
  html:       string,
  runNumber:  number,
  conclusion: string,
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename  = `regression-${String(runNumber).padStart(3, '0')}-${timestamp}-${conclusion}.html`;
  const filePath  = `regression-history/${filename}`;

  await octokit.rest.repos.createOrUpdateFileContents({
    owner, repo,
    path:    filePath,
    message: `ci: add regression report ${filename} [skip ci]`,
    content: Buffer.from(html).toString('base64'),
    branch,
  });

  console.log(`   Regression report committed: ${filename}`);
  return filename;
}

export async function commitRegressionIndex(entries: HistoryEntry[], newFilename?: string): Promise<void> {
  const rows = [...entries]
    .reverse()
    .map((e) => {
      const icon  = e.conclusion === 'passed' ? '\u2705' : '\u274C';
      const isNew = e.filename === newFilename;
      return `
      <tr${isNew ? ' class="new"' : ''}>
        <td>#${e.runNumber}</td>
        <td>${e.timestamp.replace(/-/g, ':').replace('T', ' ')}</td>
        <td>${icon} ${e.conclusion.toUpperCase()}</td>
        <td><a href="${e.filename}">View Report</a></td>
      </tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Regression Run History</title>
<style>
  body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;padding:2rem;max-width:800px;margin:0 auto}
  h1{font-size:1.5rem;margin-bottom:1.5rem;color:#f8fafc}
  table{width:100%;border-collapse:collapse;background:#1e293b;border-radius:8px;overflow:hidden}
  th{padding:.75rem 1rem;text-align:left;background:#162032;font-size:.75rem;text-transform:uppercase;letter-spacing:.05em;color:#64748b}
  td{padding:.75rem 1rem;border-top:1px solid #334155;font-size:.875rem}
  tr.new td{background:#1a2f1a}
  a{color:#4FC3F7;text-decoration:none}
  .badge{font-size:.7rem;padding:2px 8px;border-radius:999px;background:#9333ea22;color:#9333ea;margin-left:.5rem}
</style>
</head>
<body>
<h1>Regression Run History <span class="badge">@regression tests only</span></h1>
<table>
  <thead><tr><th>Run</th><th>Timestamp</th><th>Result</th><th>Report</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
</body>
</html>`;

  let sha: string | undefined;
  try {
    const existing = await octokit.rest.repos.getContent({ owner, repo, path: 'regression-history/index.html', ref: branch });
    if (!Array.isArray(existing.data) && 'sha' in existing.data) sha = existing.data.sha;
  } catch { /* new file */ }

  await octokit.rest.repos.createOrUpdateFileContents({
    owner, repo,
    path:    'regression-history/index.html',
    message: 'ci: update regression history index [skip ci]',
    content: Buffer.from(html).toString('base64'),
    branch,
    ...(sha ? { sha } : {}),
  });

  console.log('   Regression index updated: regression-history/index.html');
}
