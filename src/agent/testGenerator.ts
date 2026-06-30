/**
 * src/agent/testGenerator.ts
 * Generates Playwright TypeScript tests from a Jira story.
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

// ── Detect if story should have @regression tagging ───────────────────────────
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

// ── Detect if generated file has @regression tags ────────────────────────────
export function hasRegressionTests(testCode: string): boolean {
  return testCode.includes('@regression');
}

// ── Strip markdown/code-fence artifacts from Claude output ───────────────────
function cleanBody(text: string): string {
  return text
    .replace(/^```(?:typescript|ts|javascript|js)?\n?/gi, '')
    .replace(/\n?```\s*$/gi, '')
    .replace(/^(?:typescript|javascript|ts|js)\n/i, '')
    .replace(/^import .*$/gm, '')
    .replace(/^interface (User|LoginResponse)\s*\{[\s\S]*?\n\}\n?/gm, '')
    .replace(/^async function (getUsers|login)\([\s\S]*?\n\}\n?/gm, '')
    .trim();
}

// ── Auto-generate 3 describe blocks via Claude ───────────────────────────────
async function generateAutoTests(issue: JiraIssue, isRegression: boolean): Promise<string> {
  const tagInstruction = isRegression
    ? `- Tag EVERY test() with { tag: ['@regression'] } like:
  test('name', { tag: ['@regression'] }, async ({ request }) => {`
    : `- Do NOT add any tag annotations.`;

  const prompt = `You are a QA engineer. Generate Playwright TypeScript tests for this story.
Output ONLY test.describe blocks. No imports. No function declarations. No markdown.

Story: ${issue.key} — ${issue.summary}
Description: ${issue.description}
AC: ${issue.acceptanceCriteria || '(see description)'}

ALREADY DEFINED — do NOT redeclare:
  getUsers(request): Promise<User[]>   — User has: id, name, export_status, username, password, team_name
  login(request, username, password): Promise<LoginResponse>

AVAILABLE ENDPOINTS — only these two exist, do not invent others:
  GET /api/users
    Response: { users: Array<{ id, name, export_status, username, password, team_name }> }
    export_status values are the strings "US_PERSON" or "NON_US_PERSON" (not variables)
    team_name is "PBE", "DPS", or null

  GET /api/login?username=u&password=p
    Response: { success: boolean, message: string, exportStatus?: string }
    No other fields exist — do not assert redirect_url, home_page, team, or teamPage

Exact assertions to use:
  US_PERSON success  : expect(response.message).toContain("Login successful")
  NON_US_PERSON block: expect(response.message).toContain("Only US Persons are allowed to watch this demo.")

CRITICAL — US_PERSON and NON_US_PERSON are STRING VALUES not variables:
  CORRECT: user.export_status === 'US_PERSON'
  WRONG:   user.export_status === US_PERSON

Rules:
- Call getUsers/login directly. Never redeclare them.
- Never hardcode credentials — use password from getUsers()
${tagInstruction}
- Generate THREE describe blocks: Happy Path, Boundary Conditions, Negative Tests
- 2-3 test() blocks each
- Start with: test.describe('${issue.key} – Happy Path', () => {`.trim();

  const response = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 2500,
    messages:   [{ role: 'user', content: prompt }],
  });

  return cleanBody(
    response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('')
  );
}

// ── Generate body for one plain-English test case ────────────────────────────
async function generateTestBody(tc: PlainEnglishTestCase): Promise<string> {
  const prompt = `Write the BODY of one Playwright TypeScript test.
Output ONLY raw TypeScript statements inside the async ({ request }) => { } block.
No imports. No function declarations. No markdown.

Helpers available:
  getUsers(request) -> User[]   (User has: export_status, username, password, team_name)
  login(request, username, password) -> { success, message, exportStatus? }

Server messages:
  success : "Login successful. Welcome!"
  blocked : "Only US Persons are allowed to watch this demo."

Test:
  Description : ${tc.description}
  Endpoint    : ${tc.endpoint}
  Expected    : ${tc.expectedOutcome}`.trim();

  const response = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 800,
    messages:   [{ role: 'user', content: prompt }],
  });

  return cleanBody(
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

  if (plainEnglishTestCases.length > 0) {
    const testBlocks: string[] = [];
    for (const tc of plainEnglishTestCases) {
      console.log(`         🤖  Generating body for: "${tc.description}"`);
      const body = await generateTestBody(tc);
      const sig  = isRegression
        ? `test('${tc.description}', { tag: ['@regression'] }, async ({ request }) => {`
        : `test('${tc.description}', async ({ request }) => {`;
      testBlocks.push(`\n  ${sig}\n${body.split('\n').map((l) => '    ' + l).join('\n')}\n  });`);
    }
    return FILE_HEADER + `\ntest.describe('${issue.key} – ${issue.summary}', () => {${testBlocks.join('\n')}\n});\n`;
  }

  console.log(`         🤖  Auto-generating happy path, boundary and negative tests…`);
  const autoTests = await generateAutoTests(issue, isRegression);
  return FILE_HEADER + '\n' + autoTests + '\n';
}
