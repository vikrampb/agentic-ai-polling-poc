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
    const usUser = users.find(user => user.export_status === 'US_PERSON');
    expect(usUser, 'Expected at least one US_PERSON user to exist').toBeTruthy();

    const response = await login(request, usUser!.username, usUser!.password);

    expect(response.success).toBe(true);
    expect(response.message).toBe('Login successful. Welcome!');
  });

  test('US Person user login response contains correct export status', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const usUser = users.find(user => user.export_status === 'US_PERSON');
    expect(usUser, 'Expected at least one US_PERSON user to exist').toBeTruthy();

    const response = await login(request, usUser!.username, usUser!.password);

    expect(response.success).toBe(true);
    expect(response.exportStatus).toBe('US_PERSON');
    expect(response.message).toBe('Login successful. Welcome!');
  });

  test('All US Person users in the system can successfully log in', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const usUsers = users.filter(user => user.export_status === 'US_PERSON');
    expect(usUsers.length, 'Expected at least one US_PERSON user to exist').toBeGreaterThan(0);

    for (const usUser of usUsers) {
      const response = await login(request, usUser.username, usUser.password);
      expect(response.success, `Expected user ${usUser.username} to log in successfully`).toBe(true);
      expect(response.message).toBe('Login successful. Welcome!');
    }
  });
});

test.describe('AQA-1 – Boundary Conditions', () => {
  test('Non-US Person user is blocked from logging in with correct credentials', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUser = users.find(user => user.export_status === 'NON_US_PERSON');
    expect(nonUsUser, 'Expected at least one NON_US_PERSON user to exist').toBeTruthy();

    const response = await login(request, nonUsUser!.username, nonUsUser!.password);

    expect(response.success).toBe(false);
    expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
  });

  test('All Non-US Person users in the system are blocked from logging in', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUsers = users.filter(user => user.export_status === 'NON_US_PERSON');
    expect(nonUsUsers.length, 'Expected at least one NON_US_PERSON user to exist').toBeGreaterThan(0);

    for (const nonUsUser of nonUsUsers) {
      const response = await login(request, nonUsUser.username, nonUsUser.password);
      expect(response.success, `Expected user ${nonUsUser.username} to be blocked`).toBe(false);
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
  test('US Person user cannot log in with an invalid password', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const usUser = users.find(user => user.export_status === 'US_PERSON');
    expect(usUser, 'Expected at least one US_PERSON user to exist').toBeTruthy();

    const response = await login(request, usUser!.username, 'InvalidPassword123!');

    expect(response.success).toBe(false);
    expect(response.message).toBe('Invalid UserID/Password combination. Please verify.');
  });

  test('Non-US Person user with an invalid password receives invalid credentials error, not export status error', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUser = users.find(user => user.export_status === 'NON_US_PERSON');
    expect(nonUsUser, 'Expected at least one NON_US_PERSON user to exist').toBeTruthy();

    const response = await login(request, nonUsUser!.username, 'InvalidPassword123!');

    expect(response.success).toBe(false);
    expect(response.message).toBe('Invalid UserID/Password combination. Please verify.');
  });

  test('Login attempt with a non-existent username returns invalid credentials error', { tag: ['@regression'] }, async ({ request }) => {
    const response = await login(request, 'nonexistent_user_xyz', 'SomePassword123!');

    expect(response.success).toBe(false);
    expect(response.message).toBe('Invalid UserID/Password combination. Please verify.');
  });
});
