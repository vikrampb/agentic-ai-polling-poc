/**
 * src/agent/testGenerator.ts
 *
 * AC MODE  (story has numbered AC points):
 *   - Parse AC points in TypeScript — we control the count
 *   - Call Claude once per AC point to get ONLY assertion lines
 *   - Wrap each in exactly one test() block ourselves
 *   - Result: exactly N tests for N AC points
 *
 * DESCRIPTION MODE (no AC or no numbered points):
 *   - Call Claude once to generate 3 describe blocks
 *   - 2-3 tests per block inferred from description
 *
 * INTERACTIVE MODE (plain-English test cases provided):
 *   - One test per case, Claude writes the body
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

// ── Fixed file header — always prepended ──────────────────────────────────────
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

// ── Shared context injected into every Claude prompt ──────────────────────────
const CONTEXT = `
HELPERS (already defined — do NOT redeclare):
  getUsers(request) → User[]
    User fields: id, name, export_status, username, password, team_name
    export_status is ALWAYS the string "US_PERSON" or "NON_US_PERSON" — never a variable
  login(request, username, password) → LoginResponse
    LoginResponse fields: success (boolean), message (string), exportStatus? (string)
    NO OTHER FIELDS EXIST — do not assert redirect_url, home_page, team, teamPage etc.

EXACT server messages — copy verbatim into assertions:
  US_PERSON success  : "Login successful. Welcome!"
  NON_US_PERSON block: "Only US Persons are allowed to watch this demo."
  Wrong credentials  : "Invalid UserID/Password combination. Please verify."
  Missing credentials: "Missing credentials."

RULES:
  - Never hardcode usernames or passwords — always get them from getUsers()
  - Use 'wrongPassword123!' when testing incorrect passwords
  - export_status comparisons: user.export_status === 'US_PERSON' (string, not variable)
`.trim();

// ── Detect @regression ────────────────────────────────────────────────────────
function detectRegression(issue: JiraIssue): boolean {
  if (issue.labels.some((l) => l.toLowerCase() === 'regression')) {
    console.log(`         🏷️   Jira "Regression" label — tagging tests`);
    return true;
  }
  const text = (issue.acceptanceCriteria || issue.description || '').toLowerCase();
  if (
    text.includes('regression') || text.includes('existing functionality') ||
    text.includes('backward compatibility') || text.includes('must not break') ||
    text.includes('@regression')
  ) {
    console.log(`         🏷️   Regression keyword in AC/description — tagging tests`);
    return true;
  }
  return false;
}

export function hasRegressionTests(testCode: string): boolean {
  return testCode.includes('@regression');
}

// ── Parse AC points — handles numbered lists AND prose sentences ─────────────
function parseAcPoints(ac: string): string[] {
  if (!ac || !ac.trim()) return [];

  // Strategy 1: numbered lines (1. or 1) format)
  const numbered = ac
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^\d+[.)\s]/.test(l))
    .map((l) => l.replace(/^\d+[.)\s]+/, '').trim())
    .filter((l) => l.length > 10);

  if (numbered.length > 0) return numbered;

  // Strategy 2: extract "Acceptance Criteria:" section from prose
  const acMatch = ac.match(/[Aa]cceptance [Cc]riteria[:\s]+(.+?)(?:$)/s);
  const acSection = acMatch ? acMatch[1].trim() : ac.trim();

  // Strategy 3: split prose on "If " conditions
  const ifStatements = acSection
    .split(/(?=\bIf\b)/g)
    .map((s) => s.trim())
    .filter((s) => s.toLowerCase().startsWith('if') && s.length > 20);

  if (ifStatements.length > 0) return ifStatements;

  // Strategy 4: split on sentence boundaries
  const sentences = acSection
    .split(/\.\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);

  return sentences;
}

// ── Categorise AC point ───────────────────────────────────────────────────────
function categorise(point: string): 'happy' | 'boundary' | 'negative' {
  const lower = point.toLowerCase();
  if (
    lower.includes('not allow') || lower.includes('block') || lower.includes('denied') ||
    lower.includes('error') || lower.includes('invalid') || lower.includes('incorrect') ||
    lower.includes('cannot') || lower.includes('rejected') || lower.includes('fail') ||
    lower.includes('not allow') || lower.includes('is not allowed')
  ) return 'negative';
  if (
    lower.includes('all users') || lower.includes('every user') || lower.includes('regardless') ||
    lower.includes('boundary') || lower.includes('edge') || lower.includes('any user')
  ) return 'boundary';
  return 'happy';
}

// ── Strip markdown and helper redeclarations ──────────────────────────────────
function clean(raw: string): string {
  return raw
    .replace(/^```(?:typescript|ts|javascript|js)?\n?/gim, '')
    .replace(/\n?```\s*$/gim, '')
    .replace(/^(?:typescript|javascript)\n/im, '')
    .replace(/^import\s+.*$/gm, '')
    .replace(/^interface\s+(User|LoginResponse)\s*\{[\s\S]*?\n\}\n?/gm, '')
    .replace(/^async\s+function\s+(getUsers|login)\s*\([\s\S]*?\n\}\n?/gm, '')
    .replace(/^\s*\/\/.*$/gm, '') // strip comment-only lines
    .trim();
}

// ── Extract only assertion lines from Claude output ───────────────────────────
// Claude sometimes returns complete test() or describe() blocks even when asked
// for just assertions. This extracts the inner body of the first test() found,
// or returns the raw output if no test() wrapper is present.
function extractAssertions(raw: string): string {
  const cleaned = clean(raw);

  // If it looks like plain assertion lines (no test( at start), return as-is
  if (!cleaned.includes('test(') && !cleaned.includes('test.describe(')) {
    return cleaned;
  }

  // Extract body of first test() block
  const match = cleaned.match(/test\s*\([^)]*\)\s*,?\s*async\s*\(\s*\{\s*request\s*\}\s*\)\s*=>\s*\{([\s\S]*?)\n  \}/);
  if (match) {
    return match[1].replace(/^\n/, '').replace(/\n$/, '').trim();
  }

  // Fallback: strip test() and describe() wrapper lines and return the rest
  return cleaned
    .split('\n')
    .filter((l) => !l.trim().startsWith('test(') && !l.trim().startsWith('test.describe(') && l.trim() !== '});' && l.trim() !== '});')
    .join('\n')
    .trim();
}

// ── Call Claude for assertions for one AC point ───────────────────────────────
async function assertionsForAcPoint(point: string, retries = 3): Promise<string> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await assertionsForAcPointOnce(point);
    } catch (err: any) {
      if (attempt < retries && (err?.status === 529 || err?.status === 503 || err?.message?.includes('overloaded'))) {
        const wait = attempt * 10000;
        console.log(`         ⚠️   API overloaded — retrying in ${wait/1000}s (attempt ${attempt}/${retries})`);
        await new Promise(r => setTimeout(r, wait));
      } else {
        throw err;
      }
    }
  }
  throw new Error('All retries exhausted');
}

async function assertionsForAcPointOnce(point: string): Promise<string> {
  const prompt = `You are a QA engineer. Write ONLY the assertion statements for this single acceptance criterion.

${CONTEXT}

Acceptance criterion: "${point}"

Output ONLY raw TypeScript statements — no test() wrapper, no describe(), no imports, no comments.
Start with: const users = await getUsers(request);
Then find the right user and call login().
Write 3-5 lines maximum.`.trim();

  const resp = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 300,
    messages:   [{ role: 'user', content: prompt }],
  });

  return extractAssertions(
    resp.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as any).text)
      .join('')
  );
}

// ── AC MODE ───────────────────────────────────────────────────────────────────
async function generateFromAC(
  issue:        JiraIssue,
  acPoints:     string[],
  isRegression: boolean,
): Promise<string> {
  console.log(`         📋  AC mode — ${acPoints.length} AC point(s) → ${acPoints.length} test(s)`);

  const tag = isRegression ? `, { tag: ['@regression'] }` : '';
  const happy:    string[] = [];
  const boundary: string[] = [];
  const negative: string[] = [];

  for (let i = 0; i < acPoints.length; i++) {
    const point = acPoints[i];
    console.log(`         🤖  [${i + 1}/${acPoints.length}] ${point.slice(0, 70)}`);

    const assertions = await assertionsForAcPoint(point);
    const name = point.length > 100 ? point.slice(0, 97) + '…' : point;
    const indented = assertions.split('\n').map((l) => '    ' + l).join('\n');

    const block = `
  test('${name}'${tag}, async ({ request }) => {
${indented}
  });`;

    switch (categorise(point)) {
      case 'negative':  negative.push(block);  break;
      case 'boundary':  boundary.push(block);  break;
      default:          happy.push(block);      break;
    }
  }

  // In AC mode, all tests go in one describe block — the AC defines the scope exactly
  const allTests = [...happy, ...boundary, ...negative];

  return (
    FILE_HEADER +
    `\ntest.describe('${issue.key} \u2013 Acceptance Criteria Tests', () => {${allTests.join('')}\n});\n`
  );
}

// ── DESCRIPTION MODE ──────────────────────────────────────────────────────────
async function generateFromDescription(
  issue:        JiraIssue,
  isRegression: boolean,
): Promise<string> {
  console.log(`         🤖  Description mode — inferring happy/boundary/negative tests`);

  const tag = isRegression
    ? `Tag every test: test('name', { tag: ['@regression'] }, async ({ request }) => {`
    : `Do NOT add any tag annotations.`;

  const prompt = `You are a QA engineer. Generate Playwright TypeScript tests for this story.
Output ONLY test.describe blocks. No imports. No function declarations. No markdown.

Story: ${issue.key} \u2014 ${issue.summary}
Description: ${issue.description}

${CONTEXT}

${tag}
Generate THREE describe blocks: Happy Path, Boundary Conditions, Negative Tests.
2-3 tests per block. Plain business language for test names.
Start with: test.describe('${issue.key} \u2013 Happy Path', () => {`.trim();

  const resp = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 2500,
    messages:   [{ role: 'user', content: prompt }],
  });

  return FILE_HEADER + '\n' + clean(
    resp.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as any).text)
      .join('')
  ) + '\n';
}

// ── INTERACTIVE MODE ──────────────────────────────────────────────────────────
async function generateTestBody(tc: PlainEnglishTestCase): Promise<string> {
  const prompt = `Write the body of one Playwright test. Output ONLY TypeScript statements inside async ({ request }) => {}.
No test() wrapper. No describe(). No imports.

${CONTEXT}

Test: ${tc.description}
Endpoint: ${tc.endpoint}
Expected: ${tc.expectedOutcome}`.trim();

  const resp = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 400,
    messages:   [{ role: 'user', content: prompt }],
  });

  return extractAssertions(
    resp.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as any).text)
      .join('')
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function generatePlaywrightTests(
  issue:                 JiraIssue,
  plainEnglishTestCases: PlainEnglishTestCase[] = [],
): Promise<string> {
  const isRegression = detectRegression(issue);

  // Interactive mode
  if (plainEnglishTestCases.length > 0) {
    const tag = isRegression ? `, { tag: ['@regression'] }` : '';
    const blocks: string[] = [];
    for (const tc of plainEnglishTestCases) {
      console.log(`         🤖  Generating: "${tc.description}"`);
      const body = await generateTestBody(tc);
      blocks.push(`\n  test('${tc.description}'${tag}, async ({ request }) => {\n${body.split('\n').map((l) => '    ' + l).join('\n')}\n  });`);
    }
    return FILE_HEADER + `\ntest.describe('${issue.key} \u2013 ${issue.summary}', () => {${blocks.join('')}\n});\n`;
  }

  // AC mode — parse numbered points
  const hasAC = !!(issue.acceptanceCriteria?.trim());
  const acPoints = hasAC ? parseAcPoints(issue.acceptanceCriteria!) : [];

  if (acPoints.length > 0) {
    return generateFromAC(issue, acPoints, isRegression);
  }

  // Description mode
  return generateFromDescription(issue, isRegression);
}
