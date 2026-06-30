/**
 * src/github/client.ts
 * Octokit wrapper - branch, commit, delete, list, trigger, poll, fetch results.json
 */
import { Octokit } from 'octokit';
import * as dotenv from 'dotenv';
dotenv.config();

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const owner   = process.env.GITHUB_OWNER!;
const repo    = process.env.GITHUB_REPO!;
const branch  = process.env.GITHUB_BRANCH ?? 'agent/auto-tests';

async function getDefaultBranchSha(): Promise<string> {
  const { data } = await octokit.rest.repos.get({ owner, repo });
  const ref = await octokit.rest.git.getRef({ owner, repo, ref: `heads/${data.default_branch}` });
  return ref.data.object.sha;
}

export async function ensureBranch(): Promise<void> {
  try {
    await octokit.rest.git.getRef({ owner, repo, ref: `heads/${branch}` });
    console.log(`Branch "${branch}" exists`);
  } catch {
    const sha = await getDefaultBranchSha();
    await octokit.rest.git.createRef({ owner, repo, ref: `refs/heads/${branch}`, sha });
    console.log(`Branch "${branch}" created`);
  }
}

export async function commitFile(filePath: string, content: string, message: string): Promise<void> {
  let sha: string | undefined;
  try {
    const existing = await octokit.rest.repos.getContent({ owner, repo, path: filePath, ref: branch });
    if (!Array.isArray(existing.data) && 'sha' in existing.data) sha = existing.data.sha;
  } catch { /* new file */ }
  await octokit.rest.repos.createOrUpdateFileContents({
    owner, repo, path: filePath, message,
    content: Buffer.from(content).toString('base64'),
    branch,
    ...(sha ? { sha } : {}),
  });
  console.log(`Committed ${filePath}`);
}

export async function deleteFile(filePath: string): Promise<void> {
  try {
    const existing = await octokit.rest.repos.getContent({ owner, repo, path: filePath, ref: branch });
    if (!Array.isArray(existing.data) && 'sha' in existing.data) {
      await octokit.rest.repos.deleteFile({
        owner, repo, path: filePath,
        message: `chore: remove stale ${filePath} [skip ci]`,
        sha: existing.data.sha,
        branch,
      });
    }
  } catch { /* already gone or never existed */ }
}

export async function listGeneratedTests(): Promise<Array<{ name: string; sha: string; path: string }>> {
  try {
    const { data } = await octokit.rest.repos.getContent({ owner, repo, path: 'tests/generated', ref: branch });
    return Array.isArray(data) ? (data as any[]) : [];
  } catch {
    return [];
  }
}

export async function triggerWorkflow(workflowFile = 'ci.yml', ref = 'main'): Promise<void> {
  await octokit.rest.actions.createWorkflowDispatch({ owner, repo, workflow_id: workflowFile, ref });
  console.log(`Triggered "${workflowFile}" on "${ref}"`);
}

export interface WorkflowRunResult {
  runId: number;
  status: string;
  conclusion: string | null;
  url: string;
}

export async function waitForLatestRun(
  workflowFile = 'ci.yml',
  timeoutMs    = 600000,
  pollBranch   = branch,
): Promise<WorkflowRunResult> {
  const deadline = Date.now() + timeoutMs;
  await new Promise((r) => setTimeout(r, 8000));

  while (Date.now() < deadline) {
    const { data } = await octokit.rest.actions.listWorkflowRuns({
      owner, repo, workflow_id: workflowFile, branch: pollBranch, per_page: 1,
    });
    const run = data.workflow_runs[0];
    if (run) {
      console.log(`Run #${run.id} - ${run.status} | ${run.conclusion ?? 'pending'}`);
      if (run.status === 'completed') {
        return { runId: run.id, status: run.status, conclusion: run.conclusion, url: run.html_url };
      }
    }
    await new Promise((r) => setTimeout(r, 15000));
  }
  throw new Error('Timed out waiting for workflow run');
}

export async function fetchResultsJson(runId: number): Promise<string | null> {
  try {
    await new Promise((r) => setTimeout(r, 5000));
    const { data } = await octokit.rest.repos.getContent({
      owner, repo, path: 'playwright-report/results.json', ref: branch,
    });
    if (!Array.isArray(data) && 'content' in data) {
      const path = require('path');
      const os   = require('os');
      const fs   = require('fs');
      const tmpPath = path.join(os.tmpdir(), `pw-results-${runId}.json`);
      fs.writeFileSync(tmpPath, Buffer.from(data.content, 'base64').toString('utf-8'));
      return tmpPath;
    }
  } catch { /* not available yet */ }
  return null;
}

export async function createRepoIfNeeded(repoName: string, description: string): Promise<string> {
  try {
    const { data } = await octokit.rest.repos.get({ owner, repo: repoName });
    console.log(`Repo "${repoName}" exists`);
    return data.html_url;
  } catch {
    const { data } = await octokit.rest.repos.createForAuthenticatedUser({
      name: repoName, description, private: false, auto_init: true,
    });
    console.log(`Repo "${repoName}" created: ${data.html_url}`);
    return data.html_url;
  }
}
