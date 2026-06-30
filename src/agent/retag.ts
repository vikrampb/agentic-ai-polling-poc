/**
 * src/agent/retag.ts
 * ─────────────────────────────────────────────────────────────
 * Re-generates spec files with @regression tags for stories
 * that have been retrospectively labelled for regression testing.
 *
 * Usage:
 *   npm run retag -- AQA-1,AQA-2
 *   npm run retag -- AQA-1                (single key)
 *   npm run retag                         (reads all "Regression" labelled stories from Jira)
 *
 * Does NOT require the story to be "In Review" — works on any status.
 * Reads the existing spec file from the agent branch, regenerates it
 * with @regression tags, and commits it back.
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { fetchIssue }              from '../jira/client';
import { generatePlaywrightTests } from './testGenerator';
import { ensureBranch, commitFile, listGeneratedTests } from '../github/client';

const JIRA_HOST      = process.env.JIRA_HOST!;
const JIRA_EMAIL     = process.env.JIRA_EMAIL!;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN!;
const PROJECT_KEY    = process.env.JIRA_PROJECT_KEY ?? 'AQA';

function authHeader(): string {
  return 'Basic ' + Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');
}

// ── Find all stories with "Regression" label in the project ──────────────────
async function fetchRegressionLabelledStories(): Promise<string[]> {
  const jql = `project = "${PROJECT_KEY}" AND labels = "Regression" AND issuetype = Story`;
  const url = `https://${JIRA_HOST}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&fields=summary,status,labels&maxResults=50`;
  const res = await fetch(url, {
    headers: { Authorization: authHeader(), Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Jira search failed ${res.status}: ${await res.text()}`);
  const data = await res.json() as { issues: Array<{ key: string }> };
  return data.issues.map((i) => i.key);
}

// ── Force @regression into a spec file by overriding the label detection ─────
async function retagStory(issueKey: string): Promise<void> {
  console.log(`\n   ▶  Retagging ${issueKey}…`);

  // Fetch the story
  let issue;
  try {
    issue = await fetchIssue(issueKey);
  } catch (err) {
    console.log(`      ⚠️   Could not fetch ${issueKey}: ${(err as Error).message}`);
    return;
  }

  console.log(`      ✓  "${issue.summary}" (${issue.status})`);

  // Force the Regression label so detectRegression() returns true
  // even if the story's labels array doesn't have it yet
  const issueWithLabel = {
    ...issue,
    labels: [...(issue.labels ?? []), 'Regression'],
  };

  console.log(`      🤖  Regenerating with @regression tags…`);
  const testCode = await generatePlaywrightTests(issueWithLabel, []);

  // Verify tags were added
  const tagCount = (testCode.match(/@regression/g) ?? []).length;
  if (tagCount === 0) {
    console.log(`      ⚠️   No @regression tags generated — check testGenerator prompt`);
    return;
  }
  console.log(`      ✓  ${tagCount} @regression tag(s) added`);
  console.log(`      ✓  ${testCode.split('\n').length} lines generated`);

  // Commit to agent branch
  const commitMsg = `feat(retag): add @regression tags to ${issueKey} spec`;
  await commitFile(`tests/generated/${issueKey}.spec.ts`, testCode, commitMsg);
  console.log(`      ✓  Committed tests/generated/${issueKey}.spec.ts`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('\n🔖  RETAG MODE — Adding @regression tags to spec files\n');

  await ensureBranch();

  // Parse keys from command line args
  const args = process.argv.slice(2);
  let keys: string[] = [];

  if (args.length > 0) {
    // Keys provided explicitly: npm run retag -- AQA-1,AQA-2
    keys = args[0].split(',').map((k) => k.trim()).filter(Boolean);
    console.log(`   Keys from command line: ${keys.join(', ')}`);
  } else {
    // No keys — auto-discover from Jira "Regression" label
    console.log(`   No keys specified — fetching all stories with "Regression" label…`);
    keys = await fetchRegressionLabelledStories();
    if (keys.length === 0) {
      console.log('   No stories found with "Regression" label. Nothing to retag.');
      return;
    }
    console.log(`   Found: ${keys.join(', ')}`);
  }

  console.log(`\n   Retagging ${keys.length} story/stories…`);

  for (const key of keys) {
    await retagStory(key);
  }

  console.log('\n' + '═'.repeat(56));
  console.log(`✅  Retag complete — ${keys.length} story/stories processed`);
  console.log('   The regression workflow will now pick up these tests.');
  console.log('   Run it with:');
  console.log('     gh workflow run regression.yml --repo YOUR_USERNAME/agentic-ai-polling-poc --ref main');
  console.log('   Or from GitHub Actions UI → Regression Tests → Run workflow');
  console.log('═'.repeat(56) + '\n');
}

main().catch((err) => {
  console.error('\n❌  Retag failed:', err);
  process.exit(1);
});
