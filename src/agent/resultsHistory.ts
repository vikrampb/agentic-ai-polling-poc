/**
 * src/agent/resultsHistory.ts
 * Manages results-history/ and regression-history/ folders on the agent branch.
 * Keeps the last MAX_HISTORY_RUNS HTML reports and prunes on the next run.
 */
import { Octokit } from 'octokit';
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

// ── Generic helpers ───────────────────────────────────────────────────────────

async function listFiles(folder: string, prefix: string): Promise<HistoryEntry[]> {
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner, repo, path: folder, ref: branch,
    });
    if (!Array.isArray(data)) return [];
    return data
      .filter((f) => f.name.endsWith('.html') && f.name !== 'index.html')
      .map((f) => {
        const re    = new RegExp(`^${prefix}-(\\d+)-(.+)-(passed|failed)\\.html$`);
        const match = f.name.match(re);
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

async function pruneFiles(entries: HistoryEntry[], label: string): Promise<HistoryEntry[]> {
  if (entries.length <= MAX_HISTORY) return entries;
  const toDelete = entries.slice(0, entries.length - MAX_HISTORY);
  console.log(`   Pruning ${toDelete.length} old ${label} run(s)`);
  for (const entry of toDelete) {
    await octokit.rest.repos.deleteFile({
      owner, repo,
      path:    entry.path,
      message: `chore: prune old ${label} run ${entry.filename} [skip ci]`,
      sha:     entry.sha,
      branch,
    });
  }
  return entries.slice(entries.length - MAX_HISTORY);
}

async function commitReport(
  html:       string,
  runNumber:  number,
  conclusion: string,
  folder:     string,
  prefix:     string,
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename  = `${prefix}-${String(runNumber).padStart(3, '0')}-${timestamp}-${conclusion}.html`;
  const filePath  = `${folder}/${filename}`;
  await octokit.rest.repos.createOrUpdateFileContents({
    owner, repo,
    path:    filePath,
    message: `ci: add ${prefix} report ${filename} [skip ci]`,
    content: Buffer.from(html).toString('base64'),
    branch,
  });
  console.log(`   Report committed: ${filename}`);
  return filename;
}

function buildIndex(
  entries:      HistoryEntry[],
  title:        string,
  badge:        string,
  newFilename?: string,
): string {
  const rows = [...entries]
    .reverse()
    .map((e) => {
      const icon  = e.conclusion === 'passed' ? '✅' : '❌';
      const isNew = e.filename === newFilename;
      return `<tr${isNew ? ' class="new"' : ''}><td>#${e.runNumber}</td><td>${e.timestamp.replace(/-/g, ':').replace('T', ' ')}</td><td>${icon} ${e.conclusion.toUpperCase()}</td><td><a href="${e.filename}">View</a></td></tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;padding:2rem;max-width:800px;margin:0 auto}
h1{color:#f8fafc}table{width:100%;border-collapse:collapse;background:#1e293b;border-radius:8px;overflow:hidden}
th{padding:.75rem 1rem;text-align:left;background:#162032;color:#64748b;font-size:.75rem;text-transform:uppercase;letter-spacing:.05em}
td{padding:.75rem 1rem;border-top:1px solid #334155;font-size:.875rem}tr.new td{background:#1a2f1a}
a{color:#4FC3F7;text-decoration:none}.badge{font-size:.7rem;padding:2px 8px;border-radius:999px;background:#02C39A22;color:#02C39A;margin-left:.5rem}
</style></head><body>
<h1>${title} <span class="badge">${badge}</span></h1>
<table><thead><tr><th>Run</th><th>Timestamp</th><th>Result</th><th>Report</th></tr></thead>
<tbody>${rows}</tbody></table></body></html>`;
}

async function commitIndex(
  entries:      HistoryEntry[],
  folder:       string,
  title:        string,
  badge:        string,
  newFilename?: string,
): Promise<void> {
  const html    = buildIndex(entries, title, badge, newFilename);
  const idxPath = `${folder}/index.html`;
  let sha: string | undefined;
  try {
    const existing = await octokit.rest.repos.getContent({ owner, repo, path: idxPath, ref: branch });
    if (!Array.isArray(existing.data) && 'sha' in existing.data) sha = existing.data.sha;
  } catch { /* new file */ }
  await octokit.rest.repos.createOrUpdateFileContents({
    owner, repo,
    path:    idxPath,
    message: `ci: update ${folder} index [skip ci]`,
    content: Buffer.from(html).toString('base64'),
    branch,
    ...(sha ? { sha } : {}),
  });
  console.log(`   Index updated: ${idxPath}`);
}

// ── Results history (normal runs) ─────────────────────────────────────────────

export async function listHistoryFiles(): Promise<HistoryEntry[]> {
  return listFiles('results-history', 'run');
}

export async function pruneHistory(entries: HistoryEntry[]): Promise<HistoryEntry[]> {
  return pruneFiles(entries, 'run');
}

export async function commitRunReport(
  html:       string,
  runNumber:  number,
  conclusion: string,
): Promise<string> {
  return commitReport(html, runNumber, conclusion, 'results-history', 'run');
}

export async function commitIndex(entries: HistoryEntry[], newFilename?: string): Promise<void> {
  return commitIndex(entries, 'results-history', 'Test Run History', `Last ${MAX_HISTORY} runs`, newFilename);
}

// ── Regression history ────────────────────────────────────────────────────────

export async function listRegressionFiles(): Promise<HistoryEntry[]> {
  return listFiles('regression-history', 'regression');
}

export async function pruneRegressionHistory(entries: HistoryEntry[]): Promise<HistoryEntry[]> {
  return pruneFiles(entries, 'regression');
}

export async function commitRegressionReport(
  html:       string,
  runNumber:  number,
  conclusion: string,
): Promise<string> {
  return commitReport(html, runNumber, conclusion, 'regression-history', 'regression');
}

export async function commitRegressionIndex(entries: HistoryEntry[], newFilename?: string): Promise<void> {
  return commitIndex(entries, 'regression-history', 'Regression Run History', '@regression tests only', newFilename);
}
