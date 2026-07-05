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
  test('US Person user can log in and receives a welcome message', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const usUser = users.find(u => u.export_status === 'US_PERSON');
    expect(usUser).toBeDefined();

    const response = await login(request, usUser!.username, usUser!.password);

    expect(response.success).toBe(true);
    expect(response.message).toBe('Login successful. Welcome!');
  });

  test('All US Person users can log in successfully', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const usUsers = users.filter(u => u.export_status === 'US_PERSON');
    expect(usUsers.length).toBeGreaterThan(0);

    for (const user of usUsers) {
      const response = await login(request, user.username, user.password);
      expect(response.success).toBe(true);
      expect(response.message).toBe('Login successful. Welcome!');
    }
  });

  test('Logged in US Person user export status is confirmed in the response', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const usUser = users.find(u => u.export_status === 'US_PERSON');
    expect(usUser).toBeDefined();

    const response = await login(request, usUser!.username, usUser!.password);

    expect(response.success).toBe(true);
    if (response.exportStatus !== undefined) {
      expect(response.exportStatus).toBe('US_PERSON');
    }
  });
});

test.describe('AQA-1 – Boundary Conditions', () => {
  test('Non-US Person user is blocked from logging in with the correct error message', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUser = users.find(u => u.export_status === 'NON_US_PERSON');
    expect(nonUsUser).toBeDefined();

    const response = await login(request, nonUsUser!.username, nonUsUser!.password);

    expect(response.success).toBe(false);
    expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
  });

  test('All Non-US Person users are blocked from logging in', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUsers = users.filter(u => u.export_status === 'NON_US_PERSON');
    expect(nonUsUsers.length).toBeGreaterThan(0);

    for (const user of nonUsUsers) {
      const response = await login(request, user.username, user.password);
      expect(response.success).toBe(false);
      expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
    }
  });

  test('Non-US Person user with wrong password still receives the invalid credentials error rather than the export status error', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUser = users.find(u => u.export_status === 'NON_US_PERSON');
    expect(nonUsUser).toBeDefined();

    const response = await login(request, nonUsUser!.username, 'wrongPassword123!');

    expect(response.success).toBe(false);
    expect(response.message).toBe('Invalid UserID/Password combination. Please verify.');
  });
});

test.describe('AQA-1 – Negative Tests', () => {
  test('US Person user with an incorrect password cannot log in and receives an invalid credentials error', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const usUser = users.find(u => u.export_status === 'US_PERSON');
    expect(usUser).toBeDefined();

    const response = await login(request, usUser!.username, 'wrongPassword123!');

    expect(response.success).toBe(false);
    expect(response.message).toBe('Invalid UserID/Password combination. Please verify.');
  });

  test('Login attempt with missing credentials returns the correct error message', { tag: ['@regression'] }, async ({ request }) => {
    const response = await login(request, '', '');

    expect(response.success).toBe(false);
    expect(response.message).toBe('Missing credentials.');
  });

  test('Invalid credentials error takes precedence over export status check for all user types', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const usUser = users.find(u => u.export_status === 'US_PERSON');
    const nonUsUser = users.find(u => u.export_status === 'NON_US_PERSON');
    expect(usUser).toBeDefined();
    expect(nonUsUser).toBeDefined();

    const usResponse = await login(request, usUser!.username, 'wrongPassword123!');
    expect(usResponse.success).toBe(false);
    expect(usResponse.message).toBe('Invalid UserID/Password combination. Please verify.');

    const nonUsResponse = await login(request, nonUsUser!.username, 'wrongPassword123!');
    expect(nonUsResponse.success).toBe(false);
    expect(nonUsResponse.message).toBe('Invalid UserID/Password combination. Please verify.');
  });
});
