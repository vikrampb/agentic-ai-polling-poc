/**
 * src/jira/createBugs.ts
 * Creates Jira Bug tickets for failed Playwright tests.
 * Called automatically by the agent after a CI failure.
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
dotenv.config();

const { JIRA_HOST, JIRA_EMAIL, JIRA_API_TOKEN } = process.env;
const PROJECT_KEY = process.env.JIRA_PROJECT_KEY ?? 'AQA';

function authHeader(): string {
  return 'Basic ' + Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');
}

async function jiraFetch(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`https://${JIRA_HOST}/rest/api/3${path}`, {
    ...options,
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers ?? {}),
    },
  });
}

export interface FailedTest {
  title:     string;
  error:     string;
  file:      string;
  storyKey:  string;
}

// ── Parse failed tests from Playwright results.json ──────────────────────────
export function parseFailedTests(resultsJsonPath: string): FailedTest[] {
  if (!fs.existsSync(resultsJsonPath)) return [];

  const results = JSON.parse(fs.readFileSync(resultsJsonPath, 'utf-8'));
  const failed: FailedTest[] = [];

  for (const suite of results.suites ?? []) {
    const file = suite.file ?? '';
    // Extract story key from filename e.g. AQA-1.spec.ts → AQA-1
    const storyKey = file.replace(/.*\//, '').replace('.spec.ts', '');

    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        for (const result of test.results ?? []) {
          if (result.status === 'failed') {
            const error = result.errors?.[0]?.message ?? 'Unknown error';
            failed.push({
              title:    spec.title,
              error:    error.slice(0, 500), // truncate long errors
              file,
              storyKey,
            });
          }
        }
      }
    }
  }

  return failed;
}

// ── Get issue type ID for Bug ─────────────────────────────────────────────────
async function getBugIssueTypeId(): Promise<string | null> {
  const res = await jiraFetch(`/issue/createmeta?projectKeys=${PROJECT_KEY}&expand=projects.issuetypes`);
  if (!res.ok) return null;
  const data = await res.json() as any;
  const project = data.projects?.[0];
  const bugType = project?.issuetypes?.find((t: any) => t.name.toLowerCase() === 'bug');
  return bugType?.id ?? null;
}

// ── Create a single Jira bug ticket ──────────────────────────────────────────
async function createBugTicket(
  failedTest: FailedTest,
  runUrl:     string,
  bugTypeId:  string,
): Promise<string | null> {
  const summary = `[AUTO] Test failed: ${failedTest.title}`;

  const description = {
    type: 'doc',
    version: 1,
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: `Automated test failure detected by CI pipeline.`, marks: [{ type: 'strong' }] }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: `Story: ${failedTest.storyKey}` }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: `Test file: ${failedTest.file}` }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: `CI Run: ${runUrl}` }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: `Error:`, marks: [{ type: 'strong' }] }],
      },
      {
        type: 'codeBlock',
        content: [{ type: 'text', text: failedTest.error }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: `This ticket was automatically created by the Agentic AI test framework.` }],
      },
    ],
  };

  const body = {
    fields: {
      project:   { key: PROJECT_KEY },
      summary,
      description,
      issuetype: { id: bugTypeId },
      labels:    ['auto-generated', 'test-failure'],
    },
  };

  const res = await jiraFetch('/issue', {
    method: 'POST',
    body:   JSON.stringify(body),
  });

  if (!res.ok) {
    console.log(`      ⚠️   Could not create bug: ${res.status} ${await res.text()}`);
    return null;
  }

  const data = await res.json() as { key: string };
  return data.key;
}

// ── Link bug to parent story ──────────────────────────────────────────────────
async function linkToStory(bugKey: string, storyKey: string): Promise<void> {
  const body = {
    type:         { name: 'Relates' },
    inwardIssue:  { key: bugKey },
    outwardIssue: { key: storyKey },
  };

  await jiraFetch('/issueLink', {
    method: 'POST',
    body:   JSON.stringify(body),
  });
}

// ── Check if a bug for this test already exists (avoid duplicates) ─────────────
async function bugAlreadyExists(testTitle: string): Promise<boolean> {
  const jql = `project = "${PROJECT_KEY}" AND summary ~ "[AUTO] Test failed: ${testTitle.slice(0, 50)}" AND statusCategory != Done`;
  const url  = `/search/jql?jql=${encodeURIComponent(jql)}&maxResults=1`;
  const res  = await jiraFetch(url);
  if (!res.ok) return false;
  const data = await res.json() as { issues: any[] };
  return data.issues.length > 0;
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function createBugsForFailedTests(
  resultsJsonPath: string,
  runUrl:          string,
): Promise<void> {
  const failedTests = parseFailedTests(resultsJsonPath);

  // Debug: show what we parsed
  const raw = require('fs').readFileSync(resultsJsonPath, 'utf-8');
  const parsed = JSON.parse(raw);
  const suiteCount = parsed.suites?.length ?? 0;
  const specCount = parsed.suites?.reduce((a: number, s: any) => a + (s.specs?.length ?? 0), 0) ?? 0;
  console.log(`   📄  results.json: ${suiteCount} suites, ${specCount} specs, ${failedTests.length} failed`);

  if (failedTests.length === 0) {
    console.log('   ✓  No failed tests — no bug tickets created');
    return;
  }

  console.log(`\n🐛  Creating Jira bug tickets for ${failedTests.length} failed test(s)…`);

  const bugTypeId = await getBugIssueTypeId();
  if (!bugTypeId) {
    console.log('   ⚠️   Could not find Bug issue type in Jira — skipping bug creation');
    return;
  }

  for (const test of failedTests) {
    console.log(`\n   ▶  "${test.title}"`);

    // Check for duplicate
    const exists = await bugAlreadyExists(test.title);
    if (exists) {
      console.log(`      ⏭️   Bug already exists for this test — skipping`);
      continue;
    }

    const bugKey = await createBugTicket(test, runUrl, bugTypeId);
    if (bugKey) {
      console.log(`      ✓  Created bug: ${bugKey}`);

      // Link to parent story
      if (test.storyKey && test.storyKey.includes('-')) {
        await linkToStory(bugKey, test.storyKey);
        console.log(`      ✓  Linked to ${test.storyKey}`);
      }
    }
  }
}
