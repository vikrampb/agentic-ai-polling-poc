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
  test('US_PERSON user can log in and receives a welcome message', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const usUser = users.find(u => u.export_status === 'US_PERSON');
    expect(usUser, 'Expected at least one US_PERSON user to exist').toBeDefined();

    const response = await login(request, usUser!.username, usUser!.password);

    expect(response.success).toBe(true);
    expect(response.message).toBe('Login successful. Welcome!');
  });

  test('US_PERSON user login response contains the correct export status', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const usUser = users.find(u => u.export_status === 'US_PERSON');
    expect(usUser, 'Expected at least one US_PERSON user to exist').toBeDefined();

    const response = await login(request, usUser!.username, usUser!.password);

    expect(response.success).toBe(true);
    expect(response.exportStatus).toBe('US_PERSON');
  });

  test('All US_PERSON users in the system can successfully log in', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const usUsers = users.filter(u => u.export_status === 'US_PERSON');
    expect(usUsers.length, 'Expected at least one US_PERSON user to exist').toBeGreaterThan(0);

    for (const user of usUsers) {
      const response = await login(request, user.username, user.password);
      expect(response.success).toBe(true);
      expect(response.message).toBe('Login successful. Welcome!');
    }
  });
});

test.describe('AQA-1 – Boundary Conditions', () => {
  test('NON_US_PERSON user is blocked from logging in with a correct password', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUser = users.find(u => u.export_status === 'NON_US_PERSON');
    expect(nonUsUser, 'Expected at least one NON_US_PERSON user to exist').toBeDefined();

    const response = await login(request, nonUsUser!.username, nonUsUser!.password);

    expect(response.success).toBe(false);
    expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
  });

  test('All NON_US_PERSON users in the system are blocked from logging in', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUsers = users.filter(u => u.export_status === 'NON_US_PERSON');
    expect(nonUsUsers.length, 'Expected at least one NON_US_PERSON user to exist').toBeGreaterThan(0);

    for (const user of nonUsUsers) {
      const response = await login(request, user.username, user.password);
      expect(response.success).toBe(false);
      expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
    }
  });

  test('Login attempt with missing credentials returns an appropriate error', { tag: ['@regression'] }, async ({ request }) => {
    const response = await login(request, '', '');

    expect(response.success).toBe(false);
    expect(response.message).toBe('Missing credentials.');
  });
});

test.describe('AQA-1 – Negative Tests', () => {
  test('US_PERSON user with an incorrect password is denied access', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const usUser = users.find(u => u.export_status === 'US_PERSON');
    expect(usUser, 'Expected at least one US_PERSON user to exist').toBeDefined();

    const response = await login(request, usUser!.username, 'wrongPassword123!');

    expect(response.success).toBe(false);
    expect(response.message).toBe('Invalid UserID/Password combination. Please verify.');
  });

  test('NON_US_PERSON user with an incorrect password receives the US Person restriction error', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUser = users.find(u => u.export_status === 'NON_US_PERSON');
    expect(nonUsUser, 'Expected at least one NON_US_PERSON user to exist').toBeDefined();

    const response = await login(request, nonUsUser!.username, 'wrongPassword123!');

    expect(response.success).toBe(false);
    expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
  });

  test('Login attempt with a non-existent username is rejected', { tag: ['@regression'] }, async ({ request }) => {
    const response = await login(request, 'nonexistent_user_xyz', 'somePassword99!');

    expect(response.success).toBe(false);
    expect(response.message).toBe('Invalid UserID/Password combination. Please verify.');
  });
});
