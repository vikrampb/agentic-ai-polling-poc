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

test.describe('AQA-2 – Happy Path', () => {
  test('PBE team user logs in successfully and receives login successful message', async ({ request }) => {
    const users = await getUsers(request);
    const pbeUser = users.find(u => u.team_name === 'PBE' && u.export_status === 'US_PERSON');
    if (!pbeUser) throw new Error('No PBE US_PERSON user found');

    const response = await login(request, pbeUser.username, pbeUser.password);
    expect(response.success).toBe(true);
    expect(response.message).toContain('Login successful');
  });

  test('DPS team user logs in successfully and receives login successful message', async ({ request }) => {
    const users = await getUsers(request);
    const dpsUser = users.find(u => u.team_name === 'DPS' && u.export_status === 'US_PERSON');
    if (!dpsUser) throw new Error('No DPS US_PERSON user found');

    const response = await login(request, dpsUser.username, dpsUser.password);
    expect(response.success).toBe(true);
    expect(response.message).toContain('Login successful');
  });

  test('US_PERSON user login response contains exportStatus field', async ({ request }) => {
    const users = await getUsers(request);
    const usUser = users.find(u => u.export_status === 'US_PERSON');
    if (!usUser) throw new Error('No US_PERSON user found');

    const response = await login(request, usUser.username, usUser.password);
    expect(response.success).toBe(true);
    expect(response.exportStatus).toBeDefined();
    expect(response.message).toContain('Login successful');
  });
});

test.describe('AQA-2 – Boundary Conditions', () => {
  test('NON_US_PERSON user is blocked regardless of team membership', async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUser = users.find(u => u.export_status === 'NON_US_PERSON');
    if (!nonUsUser) throw new Error('No NON_US_PERSON user found');

    const response = await login(request, nonUsUser.username, nonUsUser.password);
    expect(response.success).toBe(false);
    expect(response.message).toContain('Only US Persons are allowed to watch this demo.');
  });

  test('all PBE users with US_PERSON status can log in successfully', async ({ request }) => {
    const users = await getUsers(request);
    const pbeUsUsers = users.filter(u => u.team_name === 'PBE' && u.export_status === 'US_PERSON');
    if (pbeUsUsers.length === 0) throw new Error('No PBE US_PERSON users found');

    for (const user of pbeUsUsers) {
      const response = await login(request, user.username, user.password);
      expect(response.success).toBe(true);
      expect(response.message).toContain('Login successful');
    }
  });

  test('all DPS users with NON_US_PERSON status are blocked', async ({ request }) => {
    const users = await getUsers(request);
    const dpsNonUsUsers = users.filter(u => u.team_name === 'DPS' && u.export_status === 'NON_US_PERSON');
    if (dpsNonUsUsers.length === 0) throw new Error('No DPS NON_US_PERSON users found');

    for (const user of dpsNonUsUsers) {
      const response = await login(request, user.username, user.password);
      expect(response.success).toBe(false);
      expect(response.message).toContain('Only US Persons are allowed to watch this demo.');
    }
  });
});

test.describe('AQA-2 – Negative Tests', () => {
  test('login fails with incorrect password for a valid user', async ({ request }) => {
    const users = await getUsers(request);
    const anyUser = users.find(u => u.export_status === 'US_PERSON');
    if (!anyUser) throw new Error('No US_PERSON user found');

    const response = await login(request, anyUser.username, 'wrong_password_12345');
    expect(response.success).toBe(false);
  });

  test('login fails with empty username and empty password', async ({ request }) => {
    const response = await login(request, '', '');
    expect(response.success).toBe(false);
  });

  test('NON_US_PERSON user with PBE team is still blocked from logging in', async ({ request }) => {
    const users = await getUsers(request);
    const blockedPbeUser = users.find(u => u.team_name === 'PBE' && u.export_status === 'NON_US_PERSON');
    if (!blockedPbeUser) throw new Error('No PBE NON_US_PERSON user found');

    const response = await login(request, blockedPbeUser.username, blockedPbeUser.password);
    expect(response.success).toBe(false);
    expect(response.message).toContain('Only US Persons are allowed to watch this demo.');
  });
});
