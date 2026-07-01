/**
 * src/agent/retag.ts
 * ─────────────────────────────────────────────────────────────
 * Synchronises @regression tags in spec files with the Jira
 * "Regression" label — making Jira the single source of truth.
 *
 * Usage:
 *   npm run retag              → auto-sync all stories from Jira labels
 *   npm run retag -- AQA-1    → retag specific key(s) only
 *   npm run retag -- AQA-1,AQA-2
 *
 * What it does:
 *   ADD    @regression tags to specs whose Jira story has the label
 *   REMOVE @regression tags from specs whose Jira story lost the label
 *
 * Does NOT require stories to be "In Review" — works on any status.
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { fetchIssue }              from '../jira/client';
import { generatePlaywrightTests } from './testGenerator';
import { ensureBranch, commitFile, listGeneratedTests } from '../github/client';
import { Octokit }                 from 'octokit';

const JIRA_HOST      = process.env.JIRA_HOST!;
const JIRA_EMAIL     = process.env.JIRA_EMAIL!;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN!;
const PROJECT_KEY    = process.env.JIRA_PROJECT_KEY ?? 'AQA';

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const owner   = process.env.GITHUB_OWNER!;
const repo    = process.env.GITHUB_REPO!;
const branch  = process.env.GITHUB_BRANCH ?? 'agent/auto-tests';

function authHeader(): string {
  return 'Basic ' + Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');
}

// ── Fetch all stories with "Regression" label ─────────────────────────────────
async function fetchRegressionLabelledKeys(): Promise<Set<string>> {
  const jql = `project = "${PROJECT_KEY}" AND labels = "Regression" AND issuetype = Story`;
  const url  = `https://${JIRA_HOST}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&fields=summary&maxResults=50`;
  const res  = await fetch(url, {
    headers: { Authorization: authHeader(), Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Jira search failed ${res.status}: ${await res.text()}`);
  const data = await res.json() as { issues: Array<{ key: string }> };
  return new Set(data.issues.map((i) => i.key));
}

// ── Read a spec file from the agent branch ────────────────────────────────────
async function readSpecFromBranch(issueKey: string): Promise<string | null> {
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner, repo, path: `tests/generated/${issueKey}.spec.ts`, ref: branch,
    });
    if (!Array.isArray(data) && 'content' in data) {
      return Buffer.from((data as any).content, 'base64').toString('utf-8');
    }
  } catch { /* file doesn't exist */ }
  return null;
}

// ── Add @regression tags to a spec ───────────────────────────────────────────
async function addRegressionTags(issueKey: string): Promise<void> {
  console.log(`\n   ▶  Adding @regression tags to ${issueKey}…`);
  let issue;
  try {
    issue = await fetchIssue(issueKey);
  } catch (err) {
    console.log(`      ⚠️   Could not fetch ${issueKey}: ${(err as Error).message}`);
    return;
  }
  console.log(`      ✓  "${issue.summary}" (${issue.status})`);

  // Force Regression label so detectRegression() returns true
  const issueWithLabel = { ...issue, labels: [...(issue.labels ?? []), 'Regression'] };
  const testCode = await generatePlaywrightTests(issueWithLabel, []);

  const tagCount = (testCode.match(/@regression/g) ?? []).length;
  if (tagCount === 0) {
    console.log(`      ⚠️   No @regression tags generated`);
    return;
  }
  console.log(`      ✓  ${tagCount} @regression tag(s) added`);
  await commitFile(
    `tests/generated/${issueKey}.spec.ts`,
    testCode,
    `feat(retag): add @regression tags to ${issueKey}`,
  );
  console.log(`      ✓  Committed`);
}

// ── Remove @regression tags from a spec ──────────────────────────────────────
async function removeRegressionTags(issueKey: string): Promise<void> {
  console.log(`\n   ▶  Removing @regression tags from ${issueKey}…`);

  let issue;
  try {
    issue = await fetchIssue(issueKey);
  } catch (err) {
    console.log(`      ⚠️   Could not fetch ${issueKey}: ${(err as Error).message}`);
    return;
  }
  console.log(`      ✓  "${issue.summary}" (${issue.status})`);

  // Ensure labels does NOT include Regression so detectRegression() returns false
  const issueWithoutLabel = {
    ...issue,
    labels: (issue.labels ?? []).filter((l) => l.toLowerCase() !== 'regression'),
  };

  const testCode = await generatePlaywrightTests(issueWithoutLabel, []);
  const tagCount = (testCode.match(/@regression/g) ?? []).length;

  if (tagCount > 0) {
    console.log(`      ⚠️   @regression tags still present after regeneration — check AC/description for regression keywords`);
  } else {
    console.log(`      ✓  @regression tags removed`);
  }

  await commitFile(
    `tests/generated/${issueKey}.spec.ts`,
    testCode,
    `feat(retag): remove @regression tags from ${issueKey}`,
  );
  console.log(`      ✓  Committed`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('\n🔖  RETAG — Syncing @regression tags with Jira labels\n');
  console.log('   Jira "Regression" label = single source of truth\n');

  await ensureBranch();

  const args = process.argv.slice(2);

  if (args.length > 0) {
    // ── Manual mode: specific keys provided ───────────────────────────────────
    const keys = args[0].split(',').map((k) => k.trim()).filter(Boolean);
    console.log(`   Manual mode — retagging: ${keys.join(', ')}`);
    const labelledKeys = await fetchRegressionLabelledKeys();
    for (const key of keys) {
      if (labelledKeys.has(key)) {
        await addRegressionTags(key);
      } else {
        await removeRegressionTags(key);
      }
    }
  } else {
    // ── Auto mode: sync all spec files on agent branch with Jira labels ───────
    console.log('   Auto mode — discovering stories from Jira + agent branch…');

    const labelledKeys   = await fetchRegressionLabelledKeys();
    console.log(`   Stories with Regression label: ${labelledKeys.size > 0 ? [...labelledKeys].join(', ') : 'none'}`);

    const existingFiles  = await listGeneratedTests();
    const existingKeys   = existingFiles
      .filter((f) => f.name.endsWith('.spec.ts'))
      .map((f) => f.name.replace('.spec.ts', ''));
    console.log(`   Spec files on agent branch: ${existingKeys.length > 0 ? existingKeys.join(', ') : 'none'}`);

    let added = 0, removed = 0, skipped = 0;

    // Add tags to specs that should have them
    for (const key of labelledKeys) {
      const specContent = await readSpecFromBranch(key);
      if (!specContent) {
        console.log(`\n   ⚠️   ${key} has Regression label but no spec file — run npm run poll to generate it first`);
        skipped++;
        continue;
      }
      const hasTag = specContent.includes('@regression');
      if (hasTag) {
        console.log(`\n   ✓  ${key} already has @regression tags — skipping`);
        skipped++;
      } else {
        await addRegressionTags(key);
        added++;
      }
    }

    // Remove tags from specs that should NOT have them
    for (const key of existingKeys) {
      if (labelledKeys.has(key)) continue; // already handled above
      const specContent = await readSpecFromBranch(key);
      if (!specContent) continue;
      const hasTag = specContent.includes('@regression');
      if (hasTag) {
        await removeRegressionTags(key);
        removed++;
      } else {
        console.log(`\n   ✓  ${key} has no @regression tags — no change needed`);
        skipped++;
      }
    }

    console.log('\n' + '─'.repeat(56));
    console.log(`   Summary: ${added} tagged, ${removed} untagged, ${skipped} unchanged`);
  }

  console.log('\n' + '═'.repeat(56));
  console.log('✅  Retag complete');
  console.log('   Trigger the regression workflow to run updated suite:');
  console.log('   GitHub Actions → Regression Tests → Run workflow (main)');
  console.log('═'.repeat(56) + '\n');
}

main().catch((err) => {
  console.error('\n❌  Retag failed:', err);
  process.exit(1);
});
