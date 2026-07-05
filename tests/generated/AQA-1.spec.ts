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
  test('US_PERSON user can log in successfully and receives welcome message', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const usUser = users.find(user => user.export_status === 'US_PERSON');
    expect(usUser).toBeDefined();

    const response = await login(request, usUser!.username, usUser!.password);

    expect(response.success).toBe(true);
    expect(response.message).toBe('Login successful. Welcome!');
  });

  test('US_PERSON user login response contains correct export status', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const usUser = users.find(user => user.export_status === 'US_PERSON');
    expect(usUser).toBeDefined();

    const response = await login(request, usUser!.username, usUser!.password);

    expect(response.success).toBe(true);
    expect(response.exportStatus).toBe('US_PERSON');
  });

  test('All US_PERSON users can log in successfully', { tag: ['@regression'] }, async ({ request }) => {
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
  test('NON_US_PERSON user is blocked and receives the correct denial message', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUser = users.find(user => user.export_status === 'NON_US_PERSON');
    expect(nonUsUser).toBeDefined();

    const response = await login(request, nonUsUser!.username, nonUsUser!.password);

    expect(response.success).toBe(false);
    expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
  });

  test('All NON_US_PERSON users are blocked from logging in', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUsers = users.filter(user => user.export_status === 'NON_US_PERSON');
    expect(nonUsUsers.length).toBeGreaterThan(0);

    for (const user of nonUsUsers) {
      const response = await login(request, user.username, user.password);
      expect(response.success).toBe(false);
      expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
    }
  });

  test('NON_US_PERSON user login response does not indicate success regardless of valid credentials', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUser = users.find(user => user.export_status === 'NON_US_PERSON');
    expect(nonUsUser).toBeDefined();

    const response = await login(request, nonUsUser!.username, nonUsUser!.password);

    expect(response.success).toBe(false);
    expect(response.message).not.toBe('Login successful. Welcome!');
  });
});

test.describe('AQA-1 – Negative Tests', () => {
  test('US_PERSON user with incorrect password is denied login and receives invalid credentials message', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const usUser = users.find(user => user.export_status === 'US_PERSON');
    expect(usUser).toBeDefined();

    const response = await login(request, usUser!.username, 'wrongPassword123!');

    expect(response.success).toBe(false);
    expect(response.message).toBe('Invalid UserID/Password combination. Please verify.');
  });

  test('US_PERSON user with incorrect username is denied login and receives invalid credentials message', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const usUser = users.find(user => user.export_status === 'US_PERSON');
    expect(usUser).toBeDefined();

    const response = await login(request, 'nonexistentuser_xyz', usUser!.password);

    expect(response.success).toBe(false);
    expect(response.message).toBe('Invalid UserID/Password combination. Please verify.');
  });

  test('Login attempt with empty username and password is denied with invalid credentials message', { tag: ['@regression'] }, async ({ request }) => {
    const response = await login(request, '', '');

    expect(response.success).toBe(false);
    expect(response.message).toBe('Invalid UserID/Password combination. Please verify.');
  });
});
