/**
 * src/jira/client.ts
 * Fetches Jira issues and posts rich ADF comments back. Also supports
 * file attachments and JQL-based searching via fetch().
 */
import * as dotenv from 'dotenv';
dotenv.config();

const { JIRA_HOST, JIRA_EMAIL, JIRA_API_TOKEN } = process.env;

function authHeader(): string {
  return 'Basic ' + Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');
}

async function jiraFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const url = `https://${JIRA_HOST}/rest/api/3${path}`;
  return fetch(url, {
    ...options,
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers ?? {}),
    },
  });
}

export interface JiraIssue {
  key: string;
  summary: string;
  description: string;
  acceptanceCriteria: string;
  status: string;
}

function adfToText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as Record<string, unknown>;
  if (n['type'] === 'text') return String(n['text'] ?? '');
  if (Array.isArray(n['content'])) {
    return (n['content'] as unknown[]).map(adfToText).join(' ');
  }
  return '';
}

export async function fetchIssue(issueKey: string): Promise<JiraIssue> {
  const res = await jiraFetch(`/issue/${issueKey}`);
  if (!res.ok) throw new Error(`Jira error ${res.status}: ${await res.text()}`);

  const data = (await res.json()) as {
    key: string;
    fields: {
      summary: string;
      description: unknown;
      status: { name: string };
      customfield_10016?: unknown;
    };
  };

  const description = adfToText(data.fields.description);
  const acField = data.fields.customfield_10016;
  const acceptanceCriteria = acField ? adfToText(acField) : '';

  return {
    key: data.key,
    summary: data.fields.summary,
    description,
    acceptanceCriteria,
    status: data.fields.status.name,
  };
}

export async function postComment(
  issueKey: string,
  plainText: string,
  adfBody?: object,
): Promise<void> {
  const body = adfBody ?? {
    type: 'doc',
    version: 1,
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: plainText }],
      },
    ],
  };

  const res = await jiraFetch(`/issue/${issueKey}/comment`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });

  if (!res.ok) throw new Error(`Jira comment error ${res.status}: ${await res.text()}`);
  console.log(`Comment posted to ${issueKey}`);
}

export async function transitionIssue(issueKey: string, targetStatus: string): Promise<void> {
  const res  = await jiraFetch(`/issue/${issueKey}/transitions`);
  const data = (await res.json()) as { transitions: Array<{ id: string; name: string }> };
  const transition = data.transitions.find(
    (t) => t.name.toLowerCase() === targetStatus.toLowerCase(),
  );
  if (!transition) {
    console.warn(`No transition "${targetStatus}" on ${issueKey}`);
    return;
  }
  await jiraFetch(`/issue/${issueKey}/transitions`, {
    method: 'POST',
    body: JSON.stringify({ transition: { id: transition.id } }),
  });
  console.log(`${issueKey} -> ${targetStatus}`);
}

/** Attach a local file to a Jira issue as an attachment. */
export async function attachFile(
  issueKey:    string,
  filePath:    string,
  displayName: string,
): Promise<void> {
  const fs       = require('fs');
  const FormData = require('form-data');
  const form     = new FormData();
  form.append('file', fs.createReadStream(filePath), { filename: displayName });

  const encoded = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');
  const res = await fetch(`https://${JIRA_HOST}/rest/api/3/issue/${issueKey}/attachments`, {
    method: 'POST',
    headers: {
      Authorization:       `Basic ${encoded}`,
      'X-Atlassian-Token': 'no-check',
      ...form.getHeaders(),
    },
    body: form,
  });

  if (!res.ok) throw new Error(`Jira attach error ${res.status}: ${await res.text()}`);
  console.log(`Attached ${displayName} to ${issueKey}`);
}
