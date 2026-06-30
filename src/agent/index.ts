/**
 * src/agent/index.ts
 * ─────────────────────────────────────────────────────────────
 * Agentic AI Orchestrator — Polling Edition
 *
 * Two modes:
 *   INTERACTIVE (npm run agent)
 *     Prompt for Jira keys + plain-English test cases → run once
 *
 *   POLLING (npm run poll)
 *     Poll Jira every JIRA_POLL_INTERVAL_MS for "In Review" stories
 *     Auto-generate happy path + boundary + negative tests via Claude
 *     Run CI suite, store results in history, post HTML to Jira
 *
 * Set RUN_MODE=poll in .env or use npm run poll to enable polling.
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { fetchIssue, postComment, transitionIssue, attachFile } from '../jira/client';
import { generatePlaywrightTests, PlainEnglishTestCase, hasRegressionTests } from './testGenerator';
/* INTERACTIVE_PROMPT_START
import { collectStories, printSummary }                          from './prompt';
INTERACTIVE_PROMPT_END */
import { buildAndShowReport, buildJiraAdfBody, openInNewBrowserSession } from './report';
/* LOGIN_UI_START
import { saveLoginUi }                                           from './loginUi';
LOGIN_UI_END */
import {
  pollOnce, startPollingLoop, loadManifest, saveManifest,
  JiraSuiteItem, POLL_INTERVAL_MS, MAX_SUITE_SIZE,
}                                                                from './jiraPoller';
import {
  listHistoryFiles, pruneHistory, commitRunReport, commitIndex,
  listRegressionFiles, pruneRegressionHistory,
  commitRegressionReport, commitRegressionIndex,
}                                                                from './resultsHistory';
import {
  ensureBranch, commitFile, deleteFile,
  listGeneratedTests, triggerWorkflow,
  waitForLatestRun, fetchResultsJson,
  createRepoIfNeeded,
}                                                                from '../github/client';

const GITHUB_REPO  = process.env.GITHUB_REPO!;
const RUN_MODE     = process.env.RUN_MODE ?? 'interactive'; // 'interactive' | 'poll'

// ── Shared files ──────────────────────────────────────────────────────────────
const PLAYWRIGHT_CONFIG = `import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/generated',
  timeout: 30_000,
  use: {
    baseURL: process.env.BASE_URL ?? 'http://127.0.0.1:3000',
    extraHTTPHeaders: { Accept: 'application/json' },
  },
  reporter: [['list'], ['json', { outputFile: 'playwright-report/results.json' }]],
});
`;

const MOCK_SERVER = `import express, { Request, Response } from 'express';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config();
interface User { id:number;name:string;export_status:'US_PERSON'|'NON_US_PERSON';username:string;password_hash:string; }
const app=express(), PORT=process.env.PORT??3000;
const db=new Database(path.join(__dirname,'..', process.env.DB_PATH??'data/users.db'),{readonly:true});
app.get('/api/users',(_req:Request,res:Response)=>{
  const users=db.prepare('SELECT id,name,export_status,username,password_hash as password FROM users').all();
  return res.json({users});
});
app.get('/api/login',(req:Request,res:Response)=>{
  const {username,password}=req.query as {username?:string;password?:string};
  if(!username||!password) return res.status(400).json({success:false,message:'Missing credentials.'});
  const user=db.prepare('SELECT * FROM users WHERE username=? AND password_hash=?').get(username,password) as User|undefined;
  if(!user) return res.json({success:false,message:'Invalid username or password.'});
  if(user.export_status==='NON_US_PERSON') return res.json({success:false,message:'Only US Persons are allowed to watch this demo.',exportStatus:user.export_status});
  return res.json({success:true,message:'Login successful. Welcome!',exportStatus:user.export_status});
});
app.get('/health',(_req:Request,res:Response)=>res.json({status:'ok'}));
app.listen(Number(PORT),'0.0.0.0',()=>console.log(\`Mock server on http://0.0.0.0:\${PORT}\`));
`;

// ── Core pipeline ─────────────────────────────────────────────────────────────
interface StoryInput {
  issueKey:              string;
  plainEnglishTestCases: PlainEnglishTestCase[];
}

async function runPipeline(stories: StoryInput[]): Promise<void> {
  const timestamp  = new Date().toISOString();
  const storyKeys  = stories.map((s) => s.issueKey).join(', ');
  const commitMsg  = `feat(agent): tests for [${storyKeys}] @ ${timestamp}`;
  const allKeys    = stories.map((s) => s.issueKey);

  console.log('\n' + '═'.repeat(60));
  console.log(`🤖  Pipeline starting — ${stories.length} story/stories: ${storyKeys}`);
  console.log('═'.repeat(60));

  // Step 1: GitHub repo
  await createRepoIfNeeded(GITHUB_REPO, 'Agentic AI Playwright POC');

  // Step 2: Clean stale files
  console.log('\n🧹  Cleaning stale files…');
  await ensureBranch();
  const currentKeys    = new Set(stories.map((s) => `${s.issueKey}.spec.ts`));
  const existingFiles  = await listGeneratedTests();
  for (const file of existingFiles) {
    if (file.name.endsWith('.spec.ts') && !currentKeys.has(file.name)) {
      await deleteFile(file.path);
    }
  }
  await deleteFile('playwright-report/results.json');
  await commitFile('playwright.config.ts', PLAYWRIGHT_CONFIG, commitMsg);
  await commitFile('scripts/mockServer.ts',  MOCK_SERVER,       commitMsg);

  // Step 3: Fetch + generate + commit per story
  console.log('\n🧠  Generating tests…');
  const issueMap: Record<string, Awaited<ReturnType<typeof fetchIssue>> | null> = {};
  let regressionPresent = false;
  const skippedKeys: string[] = [];

  for (const story of stories) {
    const { issueKey, plainEnglishTestCases } = story;
    console.log(`\n   ▶  ${issueKey}`);
    let issue = null;
    try {
      issue = await fetchIssue(issueKey);
      issueMap[issueKey] = issue;
      console.log(`      ✓  "${issue.summary}"`);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('404') || msg.toLowerCase().includes('does not exist')) {
        console.log(`      ⚠️   ${issueKey} not found — skipping`);
        skippedKeys.push(issueKey);
        issueMap[issueKey] = null;
        const skipped = [
          `import { test } from '@playwright/test';`,
          `test.describe('${issueKey} – SKIPPED', () => {`,
          `  test.skip(true, 'Jira issue "${issueKey}" not found.');`,
          `  test('placeholder', async () => {});`,
          `});`,
        ].join('\n');
        await commitFile(`tests/generated/${issueKey}.spec.ts`, skipped, commitMsg);
        continue;
      }
      throw err;
    }

    const mode = plainEnglishTestCases.length > 0 ? 'interactive' : 'auto (happy+boundary+negative)';
    console.log(`      📝  Mode: ${mode}`);
    const testCode = await generatePlaywrightTests(issue, plainEnglishTestCases);
    console.log(`      ✓  ${testCode.split('\n').length} lines`);
    if (hasRegressionTests(testCode)) {
      regressionPresent = true;
      console.log(`      🔖  @regression tags detected`);
    }
    await commitFile(`tests/generated/${issueKey}.spec.ts`, testCode, commitMsg);
  }

  // Step 4: Trigger CI
  console.log('\n🚀  Triggering GitHub Actions…');
  console.log(`   📊  Regression tests present: ${regressionPresent}`);
  await triggerWorkflow('ci.yml', 'main');
  // Store in env for regression step after CI completes
  process.env.REGRESSION_PRESENT = regressionPresent ? 'true' : 'false';

  // Step 5: Poll for result
  console.log('\n⏳  Waiting for CI…');
  const run  = await waitForLatestRun('ci.yml', 600_000, 'main');
  const icon = run.conclusion === 'success' ? '✅' : '❌';
  console.log(`\n${icon} CI: ${run.conclusion?.toUpperCase()} | Run #${run.runId}`);

  // Step 6: Build HTML report
  const jsonPath     = await fetchResultsJson(run.runId);
  const reportResult = jsonPath
    ? await buildAndShowReport(run.runId, run.url, run.conclusion ?? 'unknown', jsonPath)
    : null;

  // Step 7: Save to results history + prune
  if (reportResult) {
    console.log('\n📚  Updating results history…');
    const historyEntries = await listHistoryFiles();
    const prunedEntries  = await pruneHistory(historyEntries);

    const nextRunNum  = prunedEntries.length > 0
      ? Math.max(...prunedEntries.map((e) => e.runNumber)) + 1
      : 1;

    const { html }   = reportResult as any;
    const reportHtml = html ?? '';

    const newFilename = await commitRunReport(reportHtml, nextRunNum, run.conclusion ?? 'unknown');
    const allEntries  = await listHistoryFiles();
    await commitIndex(allEntries, newFilename);

    // Step 7b: Store regression report if @regression tests ran
    if (regressionPresent && reportHtml) {
      console.log('\n🔖  Updating regression history…');
      const regEntries  = await listRegressionFiles();
      const prunedReg   = await pruneRegressionHistory(regEntries);
      const nextRegNum  = prunedReg.length > 0
        ? Math.max(...prunedReg.map((e) => e.runNumber)) + 1
        : 1;
      const regFilename = await commitRegressionReport(reportHtml, nextRegNum, run.conclusion ?? 'unknown');
      const allRegEntries = await listRegressionFiles();
      await commitRegressionIndex(allRegEntries, regFilename);
      console.log(`   ✓  Regression history updated`);
    }

    // Step 7c: Auto-trigger dedicated regression workflow
    if (regressionPresent) {
      console.log('\n🔖  Step 7c – Auto-triggering regression run…');
      console.log('   (In production this is replaced by the configurable schedule in regression.yml)');
      const { Octokit } = require('octokit');
      const octokit2 = new Octokit({ auth: process.env.GITHUB_TOKEN });
      await octokit2.rest.actions.createWorkflowDispatch({
        owner: process.env.GITHUB_OWNER!,
        repo:  process.env.GITHUB_REPO!,
        workflow_id: 'regression.yml',
        ref:   'main',
        inputs: { triggered_by: 'agent' },
      });
      console.log('   ✓  Regression workflow triggered — check GitHub Actions for results');
    }

    // Step 7b: Open report locally (polling mode skips UI, interactive opens browser)
    if (RUN_MODE === 'interactive' && reportResult.reportPath) {
      /* LOGIN_UI_START
      const uiSummary  = reportResult.summary;
      const loginUiPath = saveLoginUi(uiSummary, run.runId);
      openInNewBrowserSession(loginUiPath, reportResult.reportPath);
      LOGIN_UI_END */
      openInNewBrowserSession(reportResult.reportPath);
    }
  }

  // Step 8: Post results to Jira
  console.log('\n💬  Posting results to Jira…');
  const passRate = reportResult?.summary
    ? Math.round((reportResult.summary.passed / reportResult.summary.totalTests) * 100)
    : 0;

  for (const story of stories) {
    const { issueKey } = story;
    if (issueMap[issueKey] === null) continue;

    // Post ADF comment with results table
    if (reportResult?.summary) {
      const adfBody = buildJiraAdfBody(reportResult.summary, issueKey, allKeys);
      await postComment(issueKey, '', adfBody);
    } else {
      const comment = `Story: ${issueKey}\nCI Result: ${icon} ${run.conclusion?.toUpperCase()}\nRun: ${run.url}`;
      await postComment(issueKey, comment);
    }

    // Attach HTML report to Jira ticket
    if (reportResult?.reportPath) {
      try {
        await attachFile(issueKey, reportResult.reportPath, `test-report-run-${run.runId}.html`);
        console.log(`   📎  Report attached to ${issueKey}`);
      } catch (e) {
        console.log(`   ⚠️   Could not attach report: ${(e as Error).message}`);
      }
    }

    if (run.conclusion === 'success') {
      await transitionIssue(issueKey, 'Done');
    }
  }

  // Final summary
  console.log('\n' + '═'.repeat(60));
  console.log(`✅  Pipeline complete — ${stories.length} story/stories processed`);
  if (skippedKeys.length > 0) {
    console.log(`⚠️   Skipped: ${skippedKeys.join(', ')}`);
  }
  console.log('═'.repeat(60) + '\n');
}

// ── INTERACTIVE MODE ──────────────────────────────────────────────────────────
async function runInteractive(): Promise<void> {
  /* INTERACTIVE_PROMPT_START
  const stories = await collectStories();
  printSummary(stories);
  INTERACTIVE_PROMPT_END */

  // Interactive prompt is currently commented out.
  // Using JIRA_ISSUE_KEY from .env as fallback.
  const issueKey = process.env.JIRA_ISSUE_KEY;
  if (!issueKey) throw new Error('Set JIRA_ISSUE_KEY in .env or enable the interactive prompt');

  const stories: StoryInput[] = [{ issueKey, plainEnglishTestCases: [] }];
  await runPipeline(stories);
}

// ── POLLING MODE ──────────────────────────────────────────────────────────────
async function runPolling(): Promise<void> {
  console.log('\n🔄  POLLING MODE');
  console.log(`    Interval : ${POLL_INTERVAL_MS / 1000}s`);
  console.log(`    Max suite: ${MAX_SUITE_SIZE > 0 ? MAX_SUITE_SIZE : 'unlimited'}`);
  console.log(`    Project  : ${process.env.JIRA_PROJECT_KEY ?? 'AQA'}`);
  console.log(`    Status   : ${process.env.JIRA_READY_STATUS ?? 'In Review'}\n`);

  // Initial poll
  const suite = await pollOnce();

  if (suite.length === 0) {
    console.log('\n⚠️   No stories in "In Review" status. Polling will continue…');
  } else {
    const stories: StoryInput[] = suite.map((s) => ({
      issueKey:              s.issueKey,
      plainEnglishTestCases: [],
    }));
    await runPipeline(stories);
  }

  // Continue polling for new stories
  const stop = startPollingLoop(async (updatedSuite) => {
    const stories: StoryInput[] = updatedSuite.map((s) => ({
      issueKey:              s.issueKey,
      plainEnglishTestCases: [],
    }));
    await runPipeline(stories);
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\n👋  Polling stopped. Goodbye.');
    stop();
    process.exit(0);
  });
}

// ── Entry point ───────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  if (RUN_MODE === 'poll') {
    await runPolling();
  } else {
    await runInteractive();
  }
}

main().catch((err) => {
  console.error('\n❌  Pipeline failed:', err);
  process.exit(1);
});
