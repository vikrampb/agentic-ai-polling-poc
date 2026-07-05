/**
 * src/agent/testGenerator.ts
 * Generates Playwright TypeScript tests from a Jira story.
 *
 * AC MODE (when AC has numbered points):
 *   Parses each AC point in TypeScript, calls Claude once per point
 *   to write the test body. Guarantees exactly N tests for N AC points.
 *
 * DESCRIPTION MODE (no AC or no numbered points):
 *   Claude generates happy path + boundary + negative tests from description.
 */
import Anthropic from '@anthropic-ai/sdk';
import { JiraIssue } from '../jira/client';
import * as dotenv from 'dotenv';
dotenv.config();

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface PlainEnglishTestCase {
  description:     string;
  endpoint:        string;
  expectedOutcome: string;
}

// ── Fixed file header ─────────────────────────────────────────────────────────
const FILE_HEADER = `import { test, expect, APIRequestContext } from '@playwright/test';

interface User {
  id:            number;
  name:          string;
  export_status: 'US_PERSON' | 'NON_US_PERSON';
  username:      string;
  password:      string;
  team_name:     string | null;
}

interface LoginResponse {
  success:       boolean;
  message:       string;
  exportStatus?: string;
}

async function getUsers(request: APIRequestContext): Promise<User[]> {
  const res  = await request.get('/api/users');
  const body = await res.json();
  return body.users as User[];
}

async function login(
  request:  APIRequestContext,
  username: string,
  password: string,
): Promise<LoginResponse> {
  const res = await request.get('/api/login', { params: { username, password } });
  return res.json();
}
`;

// ── Detect @regression from Jira label or AC/description keywords ─────────────
function detectRegression(issue: JiraIssue): boolean {
  const labelMatch = issue.labels.some((l) => l.toLowerCase() === 'regression');
  if (labelMatch) {
    console.log(`         🏷️   Jira label "Regression" detected — tagging tests`);
    return true;
  }
  const text = (issue.acceptanceCriteria || issue.description || '').toLowerCase();
  const textMatch =
    text.includes('regression') ||
    text.includes('existing functionality') ||
    text.includes('backward compatibility') ||
    text.includes('must not break') ||
    text.includes('should not break') ||
    text.includes('@regression');
  if (textMatch) {
    console.log(`         🏷️   Regression keyword in AC/description — tagging tests`);
    return true;
  }
  return false;
}

// ── Detect @regression tags in generated code ─────────────────────────────────
export function hasRegressionTests(testCode: string): boolean {
  return testCode.includes('@regression');
}

// ── Parse numbered AC points from AC text ─────────────────────────────────────
function parseAcPoints(ac: string): string[] {
  return ac
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^\d+[.)]\s/.test(l))
    .map((l) => l.replace(/^\d+[.)]\s+/, '').trim())
    .filter((l) => l.length > 0);
}

// ── Clean Claude output ───────────────────────────────────────────────────────
function cleanOutput(text: string): string {
  return text
    .replace(/^```(?:typescript|ts|javascript|js)?\n?/gi, '')
    .replace(/\n?```\s*$/gi, '')
    .replace(/^(?:typescript|javascript|ts|js)\n/i, '')
    .replace(/^import .*$/gm, '')
    .replace(/^interface (User|LoginResponse)\s*\{[\s\S]*?\n\}\n?/gm, '')
    .replace(/^async function (getUsers|login)\([\s\S]*?\n\}\n?/gm, '')
    .trim();
}

// ── Extract only the inner body from Claude output (strips test() wrappers) ───
function extractBodyOnly(text: string): string {
  const cleaned = cleanOutput(text);
  // If Claude returned complete test() blocks, extract just the inner body
  const testMatch = cleaned.match(/test\s*\([^,]+,\s*(?:\{[^}]*\},\s*)?async\s*\(\s*\{\s*request\s*\}\s*\)\s*=>\s*\{([\s\S]*?)\}\s*\);?/);
  if (testMatch) {
    return testMatch[1].trim();
  }
  // If Claude returned a describe block, extract tests inside and take first body
  const describeMatch = cleaned.match(/test\.describe[\s\S]*?async\s*\(\s*\{\s*request\s*\}\s*\)\s*=>\s*\{([\s\S]*?)\}\s*\);?/);
  if (describeMatch) {
    return describeMatch[1].trim();
  }
  return cleaned;
}

// ── Shared context for Claude ─────────────────────────────────────────────────
const SHARED_CONTEXT = `ALREADY DEFINED — do NOT redeclare:
  getUsers(request): Promise<User[]>   — User has: id, name, export_status, username, password, team_name
  login(request, username, password): Promise<LoginResponse>

AVAILABLE ENDPOINTS — only these two exist:
  GET /api/users  → { users: Array<{ id, name, export_status, username, password, team_name }> }
  GET /api/login?username=u&password=p → { success: boolean, message: string, exportStatus?: string }

Exact server messages — use these verbatim:
  US_PERSON success  : "Login successful. Welcome!"
  NON_US_PERSON block: "Only US Persons are allowed to watch this demo."
  Invalid credentials: "Invalid UserID/Password combination. Please verify."
  Missing credentials : "Missing credentials."

CRITICAL rules:
- "US_PERSON" and "NON_US_PERSON" are string values, not variables
  CORRECT: user.export_status === 'US_PERSON'
  WRONG:   user.export_status === US_PERSON
- Only assert: success, message, exportStatus — no other response fields exist
- Never hardcode credentials — use password from getUsers()
- Call getUsers/login directly, never redeclare them`;

// ── Generate body for ONE AC point ────────────────────────────────────────────
async function generateBodyForAcPoint(
  acPoint:     string,
  issueKey:    string,
  isRegression: boolean,
): Promise<string> {
  const tagHint = isRegression
    ? `This test uses: test('name', { tag: ['@regression'] }, async ({ request }) => {`
    : '';

  const prompt = `You are a QA engineer writing a single Playwright test body.
Output ONLY the TypeScript statements inside async ({ request }) => { }.
No imports. No function declarations. No markdown. No describe blocks.

${SHARED_CONTEXT}

${tagHint}

Write ONE test that validates this acceptance criterion:
"${acPoint}"

Write only the body statements.`.trim();

  const response = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 600,
    messages:   [{ role: 'user', content: prompt }],
  });

  return extractBodyOnly(
    response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('')
  );
}

// ── Categorise an AC point into happy/boundary/negative ───────────────────────
function categorise(acPoint: string): 'happy' | 'boundary' | 'negative' {
  const lower = acPoint.toLowerCase();
  if (
    lower.includes('not allow') || lower.includes('denied') || lower.includes('block') ||
    lower.includes('error') || lower.includes('invalid') || lower.includes('incorrect') ||
    lower.includes('cannot') || lower.includes('rejected') || lower.includes('fail')
  ) return 'negative';
  if (
    lower.includes('edge') || lower.includes('boundary') || lower.includes('all users') ||
    lower.includes('every') || lower.includes('any user') || lower.includes('regardless')
  ) return 'boundary';
  return 'happy';
}

// ── AC MODE: one test per AC point — Claude writes assertions only ──────────
async function generateFromAC(
  issue:        JiraIssue,
  acPoints:     string[],
  isRegression: boolean,
): Promise<string> {
  console.log(`         📋  AC mode — generating exactly ${acPoints.length} test(s), one per AC point`);

  const tagSuffix = isRegression ? `, { tag: ['@regression'] }` : '';
  const happy: string[] = [];
  const boundary: string[] = [];
  const negative: string[] = [];

  for (let i = 0; i < acPoints.length; i++) {
    const point = acPoints[i];
    console.log(`         🤖  AC ${i + 1}/${acPoints.length}: "${point.slice(0, 70)}"`);

    const assertionPrompt = `You are a QA engineer. Given this acceptance criterion, write ONLY the assertion statements.
Output ONLY 3-6 lines of TypeScript. No test() wrapper. No describe(). No imports. No comments.

Available helpers (already defined, do not redeclare):
  getUsers(request) → users with: export_status, username, password, team_name
  login(request, username, password) → { success: boolean, message: string }

Server messages (verbatim):
  US_PERSON OK     : "Login successful. Welcome!"
  NON_US_PERSON    : "Only US Persons are allowed to watch this demo."
  Wrong credentials: "Invalid UserID/Password combination. Please verify."
  Missing creds    : "Missing credentials."

AC: "${point}"

Write minimal statements to verify this. Start with:
  const users = await getUsers(request);
Then find relevant user and call login(). Use 'wrongPassword123!' for wrong password tests.`.trim();

    const response = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 400,
      messages:   [{ role: 'user', content: assertionPrompt }],
    });

    const assertions = cleanOutput(
      response.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as { type: 'text'; text: string }).text)
        .join('')
    );

    const testName = point.length > 100 ? point.slice(0, 100) + '…' : point;
    const block = `
  test('${testName}'${tagSuffix}, async ({ request }) => {
${assertions.split('\n').map((l: string) => '    ' + l).join('\n')}
  });`;

    const cat = categorise(point);
    if (cat === 'negative') negative.push(block);
    else if (cat === 'boundary') boundary.push(block);
    else happy.push(block);
  }

  const skip = `\n  test.skip('No AC points for this category', async () => {});`;

  return FILE_HEADER + \`
test.describe('\${issue.key} – Happy Path', () => {\${happy.length ? happy.join('') : skip}
});

test.describe('\${issue.key} – Boundary Conditions', () => {\${boundary.length ? boundary.join('') : skip}
});

test.describe('\${issue.key} – Negative Tests', () => {\${negative.length ? negative.join('') : skip}
});
\`;
}

// ── DESCRIPTION MODE: Claude infers all test cases ───────────────────────────
async function generateFromDescription(
  issue:        JiraIssue,
  isRegression: boolean,
): Promise<string> {
  console.log(`         🤖  Description mode — inferring happy/boundary/negative tests`);

  const tagInstruction = isRegression
    ? `Tag EVERY test with { tag: ['@regression'] }: test('name', { tag: ['@regression'] }, async ({ request }) => {`
    : `Do NOT add any tag annotations.`;

  const prompt = `You are a QA engineer. Generate Playwright TypeScript tests for this story.
Output ONLY test.describe blocks. No imports. No function declarations. No markdown.

Story: ${issue.key} — ${issue.summary}
Description: ${issue.description}

${SHARED_CONTEXT}

${tagInstruction}

Generate THREE describe blocks (Happy Path, Boundary Conditions, Negative Tests).
2-3 tests per block. Use plain business language for test names.
Start with: test.describe('${issue.key} – Happy Path', () => {`.trim();

  const response = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 2500,
    messages:   [{ role: 'user', content: prompt }],
  });

  return FILE_HEADER + '\n' + cleanOutput(
    response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('')
  ) + '\n';
}

// ── Generate body for one plain-English test case (interactive mode) ──────────
async function generateTestBody(tc: PlainEnglishTestCase): Promise<string> {
  const prompt = `Write the body of one Playwright test. Output ONLY TypeScript statements.
No imports. No function declarations. No markdown.

${SHARED_CONTEXT}

Test:
  Description : ${tc.description}
  Endpoint    : ${tc.endpoint}
  Expected    : ${tc.expectedOutcome}`.trim();

  const response = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 600,
    messages:   [{ role: 'user', content: prompt }],
  });

  return cleanOutput(
    response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('')
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function generatePlaywrightTests(
  issue:                 JiraIssue,
  plainEnglishTestCases: PlainEnglishTestCase[] = [],
): Promise<string> {
  const isRegression = detectRegression(issue);

  // Interactive mode — one test per plain-English case
  if (plainEnglishTestCases.length > 0) {
    const tagSuffix = isRegression ? `, { tag: ['@regression'] }` : '';
    const testBlocks: string[] = [];
    for (const tc of plainEnglishTestCases) {
      console.log(`         🤖  Generating: "${tc.description}"`);
      const body = await generateTestBody(tc);
      testBlocks.push(`
  test('${tc.description}'${tagSuffix}, async ({ request }) => {
${body.split('\n').map((l) => '    ' + l).join('\n')}
  });`);
    }
    return FILE_HEADER + `\ntest.describe('${issue.key} – ${issue.summary}', () => {${testBlocks.join('\n')}\n});\n`;
  }

  // AC mode — parse AC points and generate one test per point
  const hasAC = !!(issue.acceptanceCriteria && issue.acceptanceCriteria.trim().length > 0);
  const acPoints = hasAC ? parseAcPoints(issue.acceptanceCriteria!) : [];

  if (acPoints.length > 0) {
    return generateFromAC(issue, acPoints, isRegression);
  }

  // Description mode — no AC or unparseable AC
  return generateFromDescription(issue, isRegression);
}
