import { test, expect, APIRequestContext } from '@playwright/test';

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

test.describe('AQA-1 – Happy Path', () => {
  test('US Person with valid credentials can log in successfully', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const usUser = users.find(user => user.export_status === 'US_PERSON');
    expect(usUser).toBeDefined();

    const response = await login(request, usUser!.username, usUser!.password);

    expect(response.success).toBe(true);
    expect(response.message).toBe('Login successful. Welcome!');
  });

  test('US Person login response includes correct export status', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const usUser = users.find(user => user.export_status === 'US_PERSON');
    expect(usUser).toBeDefined();

    const response = await login(request, usUser!.username, usUser!.password);

    expect(response.exportStatus).toBe('US_PERSON');
  });

  test('All US Person users can log in successfully', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const usUsers = users.filter(user => user.export_status === 'US_PERSON');
    expect(usUsers.length).toBeGreaterThan(0);

    for (const user of usUsers) {
      const response = await login(request, user.username, user.password);
      expect(response.success).toBe(true);
      expect(response.message).toBe('Login successful. Welcome!');
    }
  });
});

test.describe('AQA-1 – Boundary Conditions', () => {
  test('Non-US Person is blocked from logging in even with correct credentials', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUser = users.find(user => user.export_status === 'NON_US_PERSON');
    expect(nonUsUser).toBeDefined();

    const response = await login(request, nonUsUser!.username, nonUsUser!.password);

    expect(response.success).toBe(false);
    expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
  });

  test('All Non-US Person users are blocked from logging in', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUsers = users.filter(user => user.export_status === 'NON_US_PERSON');
    expect(nonUsUsers.length).toBeGreaterThan(0);

    for (const user of nonUsUsers) {
      const response = await login(request, user.username, user.password);
      expect(response.success).toBe(false);
      expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
    }
  });

  test('Login attempt with missing credentials returns appropriate error', { tag: ['@regression'] }, async ({ request }) => {
    const response = await login(request, '', '');

    expect(response.success).toBe(false);
    expect(response.message).toBe('Missing credentials.');
  });
});

test.describe('AQA-1 – Negative Tests', () => {
  test('US Person with incorrect password cannot log in', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const usUser = users.find(user => user.export_status === 'US_PERSON');
    expect(usUser).toBeDefined();

    const response = await login(request, usUser!.username, 'wrongpassword123');

    expect(response.success).toBe(false);
    expect(response.message).toBe('Invalid UserID/Password combination. Please verify.');
  });

  test('US Person with incorrect username cannot log in', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const usUser = users.find(user => user.export_status === 'US_PERSON');
    expect(usUser).toBeDefined();

    const response = await login(request, 'nonexistentuser', usUser!.password);

    expect(response.success).toBe(false);
    expect(response.message).toBe('Invalid UserID/Password combination. Please verify.');
  });

  test('Non-US Person with incorrect password receives export restriction error rather than credential error', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUser = users.find(user => user.export_status === 'NON_US_PERSON');
    expect(nonUsUser).toBeDefined();

    const response = await login(request, nonUsUser!.username, 'wrongpassword123');

    expect(response.success).toBe(false);
    expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
  });
});
