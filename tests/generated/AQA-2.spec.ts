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
  test('PBE team US_PERSON user logs in successfully', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const user = users.find(u => u.team_name === 'PBE' && u.export_status === 'US_PERSON');
    expect(user).toBeDefined();
    const response = await login(request, user!.username, user!.password);
    expect(response.success).toBe(true);
    expect(response.message).toContain('Login successful');
  });

  test('DPS team US_PERSON user logs in successfully', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const user = users.find(u => u.team_name === 'DPS' && u.export_status === 'US_PERSON');
    expect(user).toBeDefined();
    const response = await login(request, user!.username, user!.password);
    expect(response.success).toBe(true);
    expect(response.message).toContain('Login successful');
  });

  test('all US_PERSON users across teams can log in successfully', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const usPersonUsers = users.filter(u => u.export_status === 'US_PERSON' && u.team_name !== null);
    expect(usPersonUsers.length).toBeGreaterThan(0);
    for (const user of usPersonUsers) {
      const response = await login(request, user.username, user.password);
      expect(response.success).toBe(true);
      expect(response.message).toContain('Login successful');
    }
  });
});

test.describe('AQA-2 – Boundary Conditions', () => {
  test('user with null team_name and US_PERSON status can still authenticate', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const user = users.find(u => u.team_name === null && u.export_status === 'US_PERSON');
    if (!user) {
      test.skip();
      return;
    }
    const response = await login(request, user.username, user.password);
    expect(response.success).toBe(true);
    expect(response.message).toContain('Login successful');
  });

  test('NON_US_PERSON user with a valid team is blocked regardless of team assignment', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const user = users.find(u => u.export_status === 'NON_US_PERSON' && (u.team_name === 'PBE' || u.team_name === 'DPS'));
    if (!user) {
      test.skip();
      return;
    }
    const response = await login(request, user.username, user.password);
    expect(response.success).toBe(false);
    expect(response.message).toContain('Only US Persons are allowed to watch this demo.');
  });

  test('login response for US_PERSON contains exportStatus field', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const user = users.find(u => u.export_status === 'US_PERSON');
    expect(user).toBeDefined();
    const response = await login(request, user!.username, user!.password);
    expect(response.success).toBe(true);
    expect(response.exportStatus).toBeDefined();
  });
});

test.describe('AQA-2 – Negative Tests', () => {
  test('NON_US_PERSON user is blocked from logging in', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const user = users.find(u => u.export_status === 'NON_US_PERSON');
    expect(user).toBeDefined();
    const response = await login(request, user!.username, user!.password);
    expect(response.success).toBe(false);
    expect(response.message).toContain('Only US Persons are allowed to watch this demo.');
  });

  test('all NON_US_PERSON users are blocked regardless of team', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const nonUsPersonUsers = users.filter(u => u.export_status === 'NON_US_PERSON');
    expect(nonUsPersonUsers.length).toBeGreaterThan(0);
    for (const user of nonUsPersonUsers) {
      const response = await login(request, user.username, user.password);
      expect(response.success).toBe(false);
      expect(response.message).toContain('Only US Persons are allowed to watch this demo.');
    }
  });

  test('login with incorrect password returns failure', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const user = users.find(u => u.export_status === 'US_PERSON');
    expect(user).toBeDefined();
    const response = await login(request, user!.username, 'invalid_wrong_password_xyz');
    expect(response.success).toBe(false);
  });
});
