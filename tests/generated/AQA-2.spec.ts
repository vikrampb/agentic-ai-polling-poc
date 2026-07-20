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
  test('PBE team user with US_PERSON export status can log in successfully', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const pbeUser = users.find(u => u.team_name === 'PBE' && u.export_status === 'US_PERSON');
    expect(pbeUser).toBeDefined();

    const response = await login(request, pbeUser.username, pbeUser.password);
    expect(response.success).toBe(true);
    expect(response.message).toBe('Login successful. Welcome!');
    expect(response.exportStatus).toBe('US_PERSON');
  });

  test('DPS team user with US_PERSON export status can log in successfully', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const dpsUser = users.find(u => u.team_name === 'DPS' && u.export_status === 'US_PERSON');
    expect(dpsUser).toBeDefined();

    const response = await login(request, dpsUser.username, dpsUser.password);
    expect(response.success).toBe(true);
    expect(response.message).toBe('Login successful. Welcome!');
    expect(response.exportStatus).toBe('US_PERSON');
  });

  test('Each team type (PBE and DPS) has at least one user available in the system', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const pbeUsers = users.filter(u => u.team_name === 'PBE');
    const dpsUsers = users.filter(u => u.team_name === 'DPS');

    expect(pbeUsers.length).toBeGreaterThan(0);
    expect(dpsUsers.length).toBeGreaterThan(0);
  });
});

test.describe('AQA-2 – Boundary Conditions', () => {
  test('NON_US_PERSON user is blocked from logging in regardless of team assignment', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUser = users.find(u => u.export_status === 'NON_US_PERSON' && u.team_name !== null);
    expect(nonUsUser).toBeDefined();

    const response = await login(request, nonUsUser.username, nonUsUser.password);
    expect(response.success).toBe(false);
    expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
  });

  test('User with null team name and US_PERSON export status receives a successful login response', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const nullTeamUser = users.find(u => u.team_name === null && u.export_status === 'US_PERSON');
    expect(nullTeamUser).toBeDefined();

    const response = await login(request, nullTeamUser.username, nullTeamUser.password);
    expect(response.success).toBe(true);
    expect(response.message).toBe('Login successful. Welcome!');
  });

  test('System returns the correct export status in the login response for all team-assigned users', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const teamUsers = users.filter(u => u.team_name !== null);

    for (const user of teamUsers) {
      const response = await login(request, user.username, user.password);
      if (user.export_status === 'US_PERSON') {
        expect(response.success).toBe(true);
        expect(response.message).toBe('Login successful. Welcome!');
      } else {
        expect(response.success).toBe(false);
        expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
      }
    }
  });
});

test.describe('AQA-2 – Negative Tests', () => {
  test('Login fails with incorrect password for a valid PBE team user', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const pbeUser = users.find(u => u.team_name === 'PBE');
    expect(pbeUser).toBeDefined();

    const response = await login(request, pbeUser.username, 'wrongPassword123!');
    expect(response.success).toBe(false);
    expect(response.message).toBe('Invalid UserID/Password combination. Please verify.');
  });

  test('Login fails with incorrect password for a valid DPS team user', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const dpsUser = users.find(u => u.team_name === 'DPS');
    expect(dpsUser).toBeDefined();

    const response = await login(request, dpsUser.username, 'wrongPassword123!');
    expect(response.success).toBe(false);
    expect(response.message).toBe('Invalid UserID/Password combination. Please verify.');
  });

  test('Login fails when credentials are missing entirely', { tag: ['@regression'] }, async ({ request }) => {
    const response = await login(request, '', '');
    expect(response.success).toBe(false);
    expect(response.message).toBe('Missing credentials.');
  });
});
