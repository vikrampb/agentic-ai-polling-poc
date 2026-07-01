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
  test('US_PERSON user can log in successfully', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const usUser = users.find(user => user.export_status === 'US_PERSON');
    expect(usUser).toBeDefined();

    const response = await login(request, usUser!.username, usUser!.password);
    expect(response.success).toBe(true);
    expect(response.message).toContain('Login successful');
  });

  test('US_PERSON user login response contains correct exportStatus', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const usUser = users.find(user => user.export_status === 'US_PERSON');
    expect(usUser).toBeDefined();

    const response = await login(request, usUser!.username, usUser!.password);
    expect(response.exportStatus).toBe('US_PERSON');
  });

  test('all US_PERSON users can log in successfully', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const usUsers = users.filter(user => user.export_status === 'US_PERSON');
    expect(usUsers.length).toBeGreaterThan(0);

    for (const user of usUsers) {
      const response = await login(request, user.username, user.password);
      expect(response.success).toBe(true);
      expect(response.message).toContain('Login successful');
    }
  });
});

test.describe('AQA-1 – Boundary Conditions', () => {
  test('NON_US_PERSON user is blocked from logging in', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUser = users.find(user => user.export_status === 'NON_US_PERSON');
    expect(nonUsUser).toBeDefined();

    const response = await login(request, nonUsUser!.username, nonUsUser!.password);
    expect(response.success).toBe(false);
    expect(response.message).toContain('Only US Persons are allowed to watch this demo.');
  });

  test('user list contains both US_PERSON and NON_US_PERSON export statuses', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const usUsers = users.filter(user => user.export_status === 'US_PERSON');
    const nonUsUsers = users.filter(user => user.export_status === 'NON_US_PERSON');

    expect(usUsers.length).toBeGreaterThan(0);
    expect(nonUsUsers.length).toBeGreaterThan(0);
  });

  test('login response success field is strictly false for NON_US_PERSON', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUser = users.find(user => user.export_status === 'NON_US_PERSON');
    expect(nonUsUser).toBeDefined();

    const response = await login(request, nonUsUser!.username, nonUsUser!.password);
    expect(response.success).toStrictEqual(false);
    expect(response.message).toContain('Only US Persons are allowed to watch this demo.');
  });
});

test.describe('AQA-1 – Negative Tests', () => {
  test('all NON_US_PERSON users are blocked from logging in', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUsers = users.filter(user => user.export_status === 'NON_US_PERSON');
    expect(nonUsUsers.length).toBeGreaterThan(0);

    for (const user of nonUsUsers) {
      const response = await login(request, user.username, user.password);
      expect(response.success).toBe(false);
      expect(response.message).toContain('Only US Persons are allowed to watch this demo.');
    }
  });

  test('NON_US_PERSON user does not receive a successful login message', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUser = users.find(user => user.export_status === 'NON_US_PERSON');
    expect(nonUsUser).toBeDefined();

    const response = await login(request, nonUsUser!.username, nonUsUser!.password);
    expect(response.message).not.toContain('Login successful');
    expect(response.message).toContain('Only US Persons are allowed to watch this demo.');
  });

  test('US_PERSON user does not receive a blocked login message', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const usUser = users.find(user => user.export_status === 'US_PERSON');
    expect(usUser).toBeDefined();

    const response = await login(request, usUser!.username, usUser!.password);
    expect(response.message).not.toContain('Only US Persons are allowed to watch this demo.');
    expect(response.message).toContain('Login successful');
  });
});
