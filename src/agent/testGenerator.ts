/**
 * src/agent/testGenerator.ts
 * Generates Playwright TypeScript tests from a Jira story.
 *
 * When plain-English test cases are provided (interactive mode):
 *   One test() block per case — exact scope, nothing added.
 *
 * When no plain-English cases provided (automated polling mode):
 *   Claude generates happy path, boundary, and negative test cases
 *   based on its interpretation of the Jira story.
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

// ── Auto-generate happy path, boundary and negative tests via Claude ──────────
async function generateAutoTests(issue: JiraIssue): Promise<string> {
  const prompt = `
You are a QA engineer. Given this Jira story, generate Playwright TypeScript tests.
Output ONLY raw TypeScript — no markdown, no code fences, no language tags.

Story: ${issue.key} — ${issue.summary}
Description: ${issue.description}
AC: ${issue.acceptanceCriteria || '(see description)'}

APIs available:
  GET /api/users → { users: Array<{ id, name, export_status: "US_PERSON"|"NON_US_PERSON", username, password }> }
  GET /api/login?username=u&password=p → { success: boolean, message: string, exportStatus?: string }

Exact server messages:
  US_PERSON success  : "Login successful. Welcome!"
  NON_US_PERSON block: "Only US Persons are allowed to watch this demo."

Rules:
- Call getUsers(request) to get users dynamically — never hardcode credentials
- Use the password field from getUsers() directly
- Generate exactly THREE describe blocks:
  1. "Happy Path" — expected successful scenarios
  2. "Boundary Conditions" — edge cases and limits
  3. "Negative Tests" — failure scenarios, invalid inputs, access denials
- Each describe block should have 2-3 test() blocks
- Start with: test.describe('${issue.key} – Happy Path', () => {
`.trim();

  const response = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 2500,
    messages:   [{ role: 'user', content: prompt }],
  });

  return response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('')
    .replace(/^```(?:typescript|ts|javascript|js)?\n?/gi, '')
    .replace(/\n?```\s*$/gi, '')
    .replace(/^(?:typescript|javascript|ts|js)\n/i, '')
    .trim();
}

// ── Generate body for a single plain-English test case ────────────────────────
async function generateTestBody(tc: PlainEnglishTestCase): Promise<string> {
  const prompt = `
You are writing the BODY of a single Playwright TypeScript test function.
Output ONLY raw TypeScript statements — no markdown, no code fences.
Only the statements inside the async ({ request }) => { } block.

Available helpers:
  getUsers(request) → Promise<User[]>
    User: { id, name, export_status: "US_PERSON"|"NON_US_PERSON", username, password }
  login(request, username, password) → Promise<LoginResponse>
    LoginResponse: { success: boolean, message: string, exportStatus?: string }

Exact server messages:
  US_PERSON success  : "Login successful. Welcome!"
  NON_US_PERSON block: "Only US Persons are allowed to watch this demo."

Test:
  Description : ${tc.description}
  Endpoint    : ${tc.endpoint}
  Expected    : ${tc.expectedOutcome}

Write only the body statements. Use password from getUsers() directly.
`.trim();

  const response = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 800,
    messages:   [{ role: 'user', content: prompt }],
  });

  return response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('')
    .replace(/^```(?:typescript|ts|javascript|js)?\n?/gi, '')
    .replace(/\n?```\s*$/gi, '')
    .replace(/^(?:typescript|javascript|ts|js)\n/i, '')
    .trim();
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function generatePlaywrightTests(
  issue:                 JiraIssue,
  plainEnglishTestCases: PlainEnglishTestCase[] = [],
): Promise<string> {
  // Interactive mode — one test() per plain-English case
  if (plainEnglishTestCases.length > 0) {
    const testBlocks: string[] = [];
    for (const tc of plainEnglishTestCases) {
      console.log(`         🤖  Generating body for: "${tc.description}"`);
      const body  = await generateTestBody(tc);
      testBlocks.push(`
  test('${tc.description}', async ({ request }) => {
${body.split('\n').map((l) => '    ' + l).join('\n')}
  });`);
    }
    return FILE_HEADER + `\ntest.describe('${issue.key} – ${issue.summary}', () => {\n${testBlocks.join('\n')}\n});\n`;
  }

  // Automated mode — Claude generates happy path + boundary + negative
  console.log(`         🤖  Auto-generating happy path, boundary and negative tests…`);
  const autoTests = await generateAutoTests(issue);
  return FILE_HEADER + '\n' + autoTests + '\n';
}
