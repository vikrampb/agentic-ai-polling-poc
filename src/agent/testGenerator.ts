/**
 * src/agent/testGenerator.ts
 * Generates Playwright TypeScript tests from a Jira story.
 *
 * Interactive mode: one test() per plain-English case entered at prompt.
 * Automated mode:   Claude generates happy path + boundary + negative tests.
 *
 * @regression tagging: applied when the Jira story has a "Regression" label
 * OR when the AC/description contains regression-related keywords.
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

// ── Detect if a story should have @regression tagging ─────────────────────────
function detectRegression(issue: JiraIssue): boolean {
  // Check Jira label first (easiest for demo)
  const labelMatch = issue.labels.some(
    (l) => l.toLowerCase() === 'regression'
  );
  if (labelMatch) {
    console.log(`         🏷️   Jira label "Regression" detected — tagging tests with @regression`);
    return true;
  }
  // Fall back to keyword check in AC/description
  const text = (issue.acceptanceCriteria || issue.description || '').toLowerCase();
  const textMatch = text.includes('regression') ||
    text.includes('existing functionality') ||
    text.includes('backward compatibility') ||
    text.includes('must not break') ||
    text.includes('should not break') ||
    text.includes('@regression');
  if (textMatch) {
    console.log(`         🏷️   Regression keyword found in AC/description — tagging tests with @regression`);
    return true;
  }
  return false;
}

// ── Detect if a generated test file contains @regression tags ─────────────────
export function hasRegressionTests(testCode: string): boolean {
  return testCode.includes('@regression');
}

// ── Auto-generate happy path, boundary, negative tests ────────────────────────
async function generateAutoTests(issue: JiraIssue, isRegression: boolean): Promise<string> {
  const regressionInstruction = isRegression
    ? `- IMPORTANT: Tag every test() block with { tag: ['@regression'] } like this:
  test('test name', { tag: ['@regression'] }, async ({ request }) => {
  Apply this to every single test() in all three describe blocks.`
    : `- Do NOT add any test.tag() annotations to tests.`;

  const prompt = `
You are a QA engineer. Given this Jira story, generate Playwright TypeScript tests.
Output ONLY raw TypeScript -- no markdown, no code fences, no language tags.
Output ONLY test.describe blocks containing test() blocks. NOTHING ELSE.

Story: ${issue.key} -- ${issue.summary}
Description: ${issue.description}
AC: ${issue.acceptanceCriteria || '(see description)'}

CRITICAL -- these are ALREADY DEFINED above your output. Do NOT redeclare them:
  - interface User (includes team_name: string | null)
  - interface LoginResponse
  - async function getUsers(request) -> Promise<User[]>
  - async function login(request, username, password) -> Promise<LoginResponse>

Just call these directly. Redeclaring them is a fatal syntax error.

Exact server messages:
  US_PERSON success  : "Login successful. Welcome!"
  NON_US_PERSON block: "Only US Persons are allowed to watch this demo."

Rules:
- Call getUsers(request) to get users dynamically -- never hardcode credentials
- Use the password field from getUsers() directly
- Do NOT include import statements or function declarations in your output
${regressionInstruction}
- CRITICAL: interface User, interface LoginResponse, async function getUsers,
  and async function login are ALREADY DEFINED. Do NOT redeclare them.
- Generate exactly THREE describe blocks:
  1. "Happy Path" -- expected successful scenarios
  2. "Boundary Conditions" -- edge cases and limits
  3. "Negative Tests" -- failure scenarios, invalid inputs, access denials
- Each describe block should have 2-3 test() blocks
- Start your output directly with: test.describe('${issue.key} -- Happy Path', () => {
`.trim();

  const response = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 2500,
    messages:   [{ role: 'user', content: prompt }],
  });

  let cleaned = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('')
    .replace(/^```(?:typescript|ts|javascript|js)?\n?/gi, '')
    .replace(/\n?```\s*$/gi, '')
    .replace(/^(?:typescript|javascript|ts|js)\n/i, '')
    .trim();

  // Safety net: strip accidental redeclarations
  cleaned = cleaned
    .replace(/^import .*$/gm, '')
    .replace(/^interface (User|LoginResponse)\s*\{[\s\S]*?\n\}\n?/gm, '')
    .replace(/^async function (getUsers|login)\([\s\S]*?\n\}\n?/gm, '')
    .trim();

  return cleaned;
}

// ── Generate body for a single plain-English test case ────────────────────────
async function generateTestBody(tc: PlainEnglishTestCase, isRegression: boolean): Promise<string> {
  const regressionInstruction = isRegression
    ? `For this test use: test('description', { tag: ['@regression'] }, async ({ request }) => {`
    : '';

  const prompt = `
You are writing the BODY of a single Playwright TypeScript test function.
Output ONLY raw TypeScript statements -- no markdown, no code fences.
Only statements inside the async ({ request }) => { } block.
${regressionInstruction}

Available helpers:
  getUsers(request) -> Promise<User[]>
    User: { id, name, export_status: "US_PERSON"|"NON_US_PERSON", username, password, team_name }
  login(request, username, password) -> Promise<LoginResponse>
    LoginResponse: { success: boolean, message: string, exportStatus?: string }

Exact server messages:
  US_PERSON success  : "Login successful. Welcome!"
  NON_US_PERSON block: "Only US Persons are allowed to watch this demo."

Test:
  Description : ${tc.description}
  Endpoint    : ${tc.endpoint}
  Expected    : ${tc.expectedOutcome}
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
  const isRegression = detectRegression(issue);

  // Interactive mode — one test() per plain-English case
  if (plainEnglishTestCases.length > 0) {
    const testBlocks: string[] = [];
    for (const tc of plainEnglishTestCases) {
      console.log(`         🤖  Generating body for: "${tc.description}"`);
      const body  = await generateTestBody(tc, isRegression);
      const tag   = isRegression ? \`, { tag: ['@regression'] }\` : '';
      testBlocks.push(`
  test('${tc.description}'${tag}, async ({ request }) => {
${body.split('\n').map((l) => '    ' + l).join('\n')}
  });`);
    }
    return FILE_HEADER + `\ntest.describe('${issue.key} -- ${issue.summary}', () => {\n${testBlocks.join('\n')}\n});\n`;
  }

  // Automated mode — Claude generates all three test categories
  console.log(`         🤖  Auto-generating happy path, boundary and negative tests…`);
  const autoTests = await generateAutoTests(issue, isRegression);
  return FILE_HEADER + '\n' + autoTests + '\n';
}
