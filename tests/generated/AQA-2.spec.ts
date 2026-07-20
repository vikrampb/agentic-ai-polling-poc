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
  test('PBE team user is authenticated and receives a successful login response', async ({ request }) => {
    const users = await getUsers(request);
    const pbeUser = users.find(u => u.team_name === 'PBE' && u.export_status === 'US_PERSON');
    expect(pbeUser).toBeDefined();

    const response = await login(request, pbeUser.username, pbeUser.password);
    expect(response.success).toBe(true);
    expect(response.message).toBe('Login successful. Welcome!');
  });

  test('DPS team user is authenticated and receives a successful login response', async ({ request }) => {
    const users = await getUsers(request);
    const dpsUser = users.find(u => u.team_name === 'DPS' && u.export_status === 'US_PERSON');
    expect(dpsUser).toBeDefined();

    const response = await login(request, dpsUser.username, dpsUser.password);
    expect(response.success).toBe(true);
    expect(response.message).toBe('Login successful. Welcome!');
  });

  test('US_PERSON user belonging to a team receives the welcome message upon successful login', async ({ request }) => {
    const users = await getUsers(request);
    const teamUser = users.find(u => u.team_name !== null && u.export_status === 'US_PERSON');
    expect(teamUser).toBeDefined();

    const response = await login(request, teamUser.username, teamUser.password);
    expect(response.success).toBe(true);
    expect(response.message).toBe('Login successful. Welcome!');
    expect(response.exportStatus).toBe('US_PERSON');
  });
});

test.describe('AQA-2 – Boundary Conditions', () => {
  test('NON_US_PERSON team user is blocked from accessing the application', async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUser = users.find(u => u.team_name !== null && u.export_status === 'NON_US_PERSON');
    expect(nonUsUser).toBeDefined();

    const response = await login(request, nonUsUser.username, nonUsUser.password);
    expect(response.success).toBe(false);
    expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
  });

  test('User with no team assignment who is a US_PERSON can still log in successfully', async ({ request }) => {
    const users = await getUsers(request);
    const noTeamUsUser = users.find(u => u.team_name === null && u.export_status === 'US_PERSON');
    expect(noTeamUsUser).toBeDefined();

    const response = await login(request, noTeamUsUser.username, noTeamUsUser.password);
    expect(response.success).toBe(true);
    expect(response.message).toBe('Login successful. Welcome!');
  });

  test('User with no team assignment who is NON_US_PERSON is blocked from the application', async ({ request }) => {
    const users = await getUsers(request);
    const noTeamNonUsUser = users.find(u => u.team_name === null && u.export_status === 'NON_US_PERSON');
    expect(noTeamNonUsUser).toBeDefined();

    const response = await login(request, noTeamNonUsUser.username, noTeamNonUsUser.password);
    expect(response.success).toBe(false);
    expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
  });
});

test.describe('AQA-2 – Negative Tests', () => {
  test('User attempting to log in with an incorrect password receives an invalid credentials error', async ({ request }) => {
    const users = await getUsers(request);
    const anyUser = users.find(u => u.team_name !== null);
    expect(anyUser).toBeDefined();

    const response = await login(request, anyUser.username, 'wrongPassword123!');
    expect(response.success).toBe(false);
    expect(response.message).toBe('Invalid UserID/Password combination. Please verify.');
  });

  test('Login attempt with both username and password missing returns a missing credentials error', async ({ request }) => {
    const response = await login(request, '', '');
    expect(response.success).toBe(false);
    expect(response.message).toBe('Missing credentials.');
  });

  test('Login attempt with username provided but password missing returns a missing credentials error', async ({ request }) => {
    const users = await getUsers(request);
    const anyUser = users[0];
    expect(anyUser).toBeDefined();

    const response = await login(request, anyUser.username, '');
    expect(response.success).toBe(false);
    expect(response.message).toBe('Missing credentials.');
  });
});
