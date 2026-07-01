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
  test('user with null team_name and US_PERSON status attempts login', { tag: ['@regression'] }, async ({ request }) => {
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

  test('user with null team_name and NON_US_PERSON status is blocked', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const user = users.find(u => u.team_name === null && u.export_status === 'NON_US_PERSON');
    if (!user) {
      test.skip();
      return;
    }
    const response = await login(request, user.username, user.password);
    expect(response.success).toBe(false);
    expect(response.message).toContain('Only US Persons are allowed to watch this demo.');
  });

  test('each distinct team (PBE, DPS) has at least one US_PERSON user', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const teams = ['PBE', 'DPS'];
    for (const team of teams) {
      const teamUsPersonUsers = users.filter(u => u.team_name === team && u.export_status === 'US_PERSON');
      expect(teamUsPersonUsers.length).toBeGreaterThan(0);
    }
  });
});

test.describe('AQA-2 – Negative Tests', () => {
  test('NON_US_PERSON user in PBE team is blocked from login', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const user = users.find(u => u.team_name === 'PBE' && u.export_status === 'NON_US_PERSON');
    if (!user) {
      test.skip();
      return;
    }
    const response = await login(request, user.username, user.password);
    expect(response.success).toBe(false);
    expect(response.message).toContain('Only US Persons are allowed to watch this demo.');
  });

  test('NON_US_PERSON user in DPS team is blocked from login', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const user = users.find(u => u.team_name === 'DPS' && u.export_status === 'NON_US_PERSON');
    if (!user) {
      test.skip();
      return;
    }
    const response = await login(request, user.username, user.password);
    expect(response.success).toBe(false);
    expect(response.message).toContain('Only US Persons are allowed to watch this demo.');
  });

  test('all NON_US_PERSON users regardless of team are blocked from login', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const nonUsPersonUsers = users.filter(u => u.export_status === 'NON_US_PERSON');
    expect(nonUsPersonUsers.length).toBeGreaterThan(0);
    for (const user of nonUsPersonUsers) {
      const response = await login(request, user.username, user.password);
      expect(response.success).toBe(false);
      expect(response.message).toContain('Only US Persons are allowed to watch this demo.');
    }
  });
});
