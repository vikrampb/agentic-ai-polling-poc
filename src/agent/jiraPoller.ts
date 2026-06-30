/**
 * src/agent/jiraPoller.ts
 * Polls Jira for stories in "In Review" status using JQL.
 * Configurable interval - defaults to 2 minutes for demo,
 * set JIRA_POLL_INTERVAL_MS in .env for production (e.g. 3600000 = 1hr).
 */
import * as fs   from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config();

const { JIRA_HOST, JIRA_EMAIL, JIRA_API_TOKEN } = process.env;

const POLL_INTERVAL_MS = parseInt(process.env.JIRA_POLL_INTERVAL_MS ?? '120000');
const PROJECT_KEY      = process.env.JIRA_PROJECT_KEY ?? 'AQA';
const STATUS           = process.env.JIRA_READY_STATUS ?? 'In Review';
const SUITE_MANIFEST   = path.join(process.cwd(), 'data', 'suite-manifest.json');
const MAX_SUITE_SIZE   = parseInt(process.env.MAX_SUITE_SIZE ?? '0');

export interface JiraSuiteItem {
  issueKey: string;
  summary: string;
  addedAt: string;
  status: string;
}

function authHeader(): string {
  return 'Basic ' + Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');
}

export async function fetchReadyStories(): Promise<JiraSuiteItem[]> {
  // NOTE: do not add ORDER BY here - the /search/jql endpoint returns
  // zero results when an ORDER BY clause is present (confirmed via testing).
  const jql = `project = "${PROJECT_KEY}" AND status = "${STATUS}" AND issuetype = Story`;
  const url = `https://${JIRA_HOST}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&fields=summary,status&maxResults=50`;

  const response = await fetch(url, {
    headers: { Authorization: authHeader(), Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Jira JQL search failed ${response.status}: ${await response.text()}`);
  }

  const data = await response.json() as {
    issues: Array<{ key: string; fields: { summary: string; status: { name: string } } }>;
  };

  return data.issues.map((i) => ({
    issueKey: i.key,
    summary: i.fields.summary,
    addedAt: new Date().toISOString(),
    status: i.fields.status.name,
  }));
}

/** Fetch the current status of a single Jira issue. Returns null if not found. */
async function fetchCurrentStatus(issueKey: string): Promise<string | null> {
  try {
    const url = `https://${JIRA_HOST}/rest/api/3/issue/${issueKey}?fields=status`;
    const response = await fetch(url, {
      headers: { Authorization: authHeader(), Accept: 'application/json' },
    });
    if (!response.ok) return null;
    const data = await response.json() as { fields: { status: { name: string } } };
    return data.fields.status.name;
  } catch {
    return null;
  }
}

/**
 * Re-check every story currently in the manifest against its live Jira status.
 * Removes any story that has moved OUT of the target status (e.g. back to "To Do"
 * or forward to "Done"). Returns the filtered manifest.
 */
export async function revalidateManifest(existing: JiraSuiteItem[]): Promise<JiraSuiteItem[]> {
  if (existing.length === 0) return existing;

  const stillValid: JiraSuiteItem[] = [];
  const removed: string[] = [];

  for (const item of existing) {
    const currentStatus = await fetchCurrentStatus(item.issueKey);
    if (currentStatus === STATUS) {
      stillValid.push({ ...item, status: currentStatus });
    } else {
      removed.push(`${item.issueKey} (now "${currentStatus ?? 'not found'}")`);
    }
  }

  if (removed.length > 0) {
    console.log(`   Removing ${removed.length} story/stories no longer in "${STATUS}":`);
    removed.forEach((r) => console.log(`       - ${r}`));
  }

  return stillValid;
}

export function loadManifest(): JiraSuiteItem[] {
  if (!fs.existsSync(SUITE_MANIFEST)) return [];
  return JSON.parse(fs.readFileSync(SUITE_MANIFEST, 'utf-8')) as JiraSuiteItem[];
}

export function saveManifest(items: JiraSuiteItem[]): void {
  const dir = path.dirname(SUITE_MANIFEST);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SUITE_MANIFEST, JSON.stringify(items, null, 2), 'utf-8');
}

export function mergeIntoSuite(existing: JiraSuiteItem[], fresh: JiraSuiteItem[]): JiraSuiteItem[] {
  const existingKeys = new Set(existing.map((i) => i.issueKey));
  const newItems = fresh.filter((i) => !existingKeys.has(i.issueKey));

  if (newItems.length > 0) {
    console.log(`   Adding ${newItems.length} new story/stories to suite:`);
    newItems.forEach((i) => console.log(`       - ${i.issueKey} -- ${i.summary}`));
  } else {
    console.log('   No new stories found in "In Review" status');
  }

  let merged = [...existing, ...newItems];

  if (MAX_SUITE_SIZE > 0 && merged.length > MAX_SUITE_SIZE) {
    console.log(`   Suite capped at ${MAX_SUITE_SIZE} items (removing oldest)`);
    merged = merged.slice(merged.length - MAX_SUITE_SIZE);
  }

  return merged;
}

export async function pollOnce(): Promise<JiraSuiteItem[]> {
  console.log(`\nPolling Jira for "${STATUS}" stories in project ${PROJECT_KEY}...`);
  const fresh = await fetchReadyStories();

  let existing = loadManifest();
  console.log(`   Revalidating ${existing.length} existing suite entries...`);
  existing = await revalidateManifest(existing);

  const updated = mergeIntoSuite(existing, fresh);
  saveManifest(updated);
  console.log(`   Suite total: ${updated.length} story/stories`);
  return updated;
}

export function startPollingLoop(
  onNewStories: (suite: JiraSuiteItem[]) => Promise<void>,
  onEachTick?: () => Promise<void>,
): () => void {
  console.log(`\nStarting Jira polling loop (interval: ${POLL_INTERVAL_MS / 1000}s)`);
  let stopped = false;

  async function tick() {
    if (stopped) return;
    try {
      const beforeCount = loadManifest().length;
      const suite = await pollOnce();
      if (suite.length > beforeCount) {
        await onNewStories(suite);
      }
      // Run any per-tick callback (e.g. regression check)
      if (onEachTick) await onEachTick();
    } catch (err) {
      console.error('   Poll error:', (err as Error).message);
    }
    if (!stopped) setTimeout(tick, POLL_INTERVAL_MS);
  }

  tick();
  return () => { stopped = true; };
}

export { POLL_INTERVAL_MS, MAX_SUITE_SIZE, PROJECT_KEY, STATUS };
