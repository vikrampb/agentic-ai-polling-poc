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
  test('PBE team user with US_PERSON export status can log in successfully', async ({ request }) => {
    const users = await getUsers(request);
    const pbeUser = users.find(u => u.team_name === 'PBE' && u.export_status === 'US_PERSON');
    expect(pbeUser).toBeDefined();

    const response = await login(request, pbeUser!.username, pbeUser!.password);
    expect(response.success).toBe(true);
    expect(response.message).toBe('Login successful. Welcome!');
  });

  test('DPS team user with US_PERSON export status can log in successfully', async ({ request }) => {
    const users = await getUsers(request);
    const dpsUser = users.find(u => u.team_name === 'DPS' && u.export_status === 'US_PERSON');
    expect(dpsUser).toBeDefined();

    const response = await login(request, dpsUser!.username, dpsUser!.password);
    expect(response.success).toBe(true);
    expect(response.message).toBe('Login successful. Welcome!');
  });

  test('Login response contains export status for a successfully authenticated US_PERSON user', async ({ request }) => {
    const users = await getUsers(request);
    const usUser = users.find(u => u.export_status === 'US_PERSON' && u.team_name !== null);
    expect(usUser).toBeDefined();

    const response = await login(request, usUser!.username, usUser!.password);
    expect(response.success).toBe(true);
    expect(response.exportStatus).toBe('US_PERSON');
  });
});

test.describe('AQA-2 – Boundary Conditions', () => {
  test('NON_US_PERSON team user is blocked from logging in regardless of team assignment', async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUser = users.find(u => u.export_status === 'NON_US_PERSON' && u.team_name !== null);
    expect(nonUsUser).toBeDefined();

    const response = await login(request, nonUsUser!.username, nonUsUser!.password);
    expect(response.success).toBe(false);
    expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
  });

  test('User with null team_name and US_PERSON export status receives a successful login response', async ({ request }) => {
    const users = await getUsers(request);
    const noTeamUser = users.find(u => u.team_name === null && u.export_status === 'US_PERSON');
    expect(noTeamUser).toBeDefined();

    const response = await login(request, noTeamUser!.username, noTeamUser!.password);
    expect(response.success).toBe(true);
    expect(response.message).toBe('Login successful. Welcome!');
  });

  test('User with null team_name and NON_US_PERSON export status is blocked from logging in', async ({ request }) => {
    const users = await getUsers(request);
    const noTeamNonUsUser = users.find(u => u.team_name === null && u.export_status === 'NON_US_PERSON');
    expect(noTeamNonUsUser).toBeDefined();

    const response = await login(request, noTeamNonUsUser!.username, noTeamNonUsUser!.password);
    expect(response.success).toBe(false);
    expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
  });
});

test.describe('AQA-2 – Negative Tests', () => {
  test('Valid user cannot log in with an incorrect password', async ({ request }) => {
    const users = await getUsers(request);
    const anyUser = users.find(u => u.team_name !== null);
    expect(anyUser).toBeDefined();

    const response = await login(request, anyUser!.username, 'wrongPassword123!');
    expect(response.success).toBe(false);
    expect(response.message).toBe('Invalid UserID/Password combination. Please verify.');
  });

  test('Login attempt with empty username and empty password returns missing credentials error', async ({ request }) => {
    const response = await login(request, '', '');
    expect(response.success).toBe(false);
    expect(response.message).toBe('Missing credentials.');
  });

  test('Login attempt with valid password but empty username returns missing credentials error', async ({ request }) => {
    const users = await getUsers(request);
    const anyUser = users[0];
    expect(anyUser).toBeDefined();

    const response = await login(request, '', anyUser.password);
    expect(response.success).toBe(false);
    expect(response.message).toBe('Missing credentials.');
  });
});
