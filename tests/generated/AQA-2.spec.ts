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
  test('PBE team user can log in and receives a successful welcome message', async ({ request }) => {
    const users = await getUsers(request);
    const pbeUser = users.find(u => u.team_name === 'PBE' && u.export_status === 'US_PERSON');
    expect(pbeUser).toBeDefined();

    const response = await login(request, pbeUser!.username, pbeUser!.password);
    expect(response.success).toBe(true);
    expect(response.message).toBe('Login successful. Welcome!');
  });

  test('DPS team user can log in and receives a successful welcome message', async ({ request }) => {
    const users = await getUsers(request);
    const dpsUser = users.find(u => u.team_name === 'DPS' && u.export_status === 'US_PERSON');
    expect(dpsUser).toBeDefined();

    const response = await login(request, dpsUser!.username, dpsUser!.password);
    expect(response.success).toBe(true);
    expect(response.message).toBe('Login successful. Welcome!');
  });

  test('US_PERSON user receives exportStatus in the login response upon successful login', async ({ request }) => {
    const users = await getUsers(request);
    const usPersonUser = users.find(u => u.export_status === 'US_PERSON' && u.team_name !== null);
    expect(usPersonUser).toBeDefined();

    const response = await login(request, usPersonUser!.username, usPersonUser!.password);
    expect(response.success).toBe(true);
    expect(response.exportStatus).toBe('US_PERSON');
    expect(response.message).toBe('Login successful. Welcome!');
  });
});

test.describe('AQA-2 – Boundary Conditions', () => {
  test('NON_US_PERSON user is blocked from logging in regardless of team membership', async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUser = users.find(u => u.export_status === 'NON_US_PERSON');
    expect(nonUsUser).toBeDefined();

    const response = await login(request, nonUsUser!.username, nonUsUser!.password);
    expect(response.success).toBe(false);
    expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
  });

  test('User with no team assigned but valid US_PERSON status receives a successful login response', async ({ request }) => {
    const users = await getUsers(request);
    const noTeamUsUser = users.find(u => u.team_name === null && u.export_status === 'US_PERSON');
    expect(noTeamUsUser).toBeDefined();

    const response = await login(request, noTeamUsUser!.username, noTeamUsUser!.password);
    expect(response.success).toBe(true);
    expect(response.message).toBe('Login successful. Welcome!');
  });

  test('Each team has at least one user assigned so that team-based routing is possible', async ({ request }) => {
    const users = await getUsers(request);
    const pbeUsers = users.filter(u => u.team_name === 'PBE');
    const dpsUsers = users.filter(u => u.team_name === 'DPS');

    expect(pbeUsers.length).toBeGreaterThanOrEqual(1);
    expect(dpsUsers.length).toBeGreaterThanOrEqual(1);
  });
});

test.describe('AQA-2 – Negative Tests', () => {
  test('User cannot log in with an incorrect password and receives an invalid credentials message', async ({ request }) => {
    const users = await getUsers(request);
    const anyUser = users.find(u => u.export_status === 'US_PERSON');
    expect(anyUser).toBeDefined();

    const response = await login(request, anyUser!.username, 'wrongPassword123!');
    expect(response.success).toBe(false);
    expect(response.message).toBe('Invalid UserID/Password combination. Please verify.');
  });

  test('Login attempt with empty username and password returns a missing credentials message', async ({ request }) => {
    const response = await login(request, '', '');
    expect(response.success).toBe(false);
    expect(response.message).toBe('Missing credentials.');
  });

  test('NON_US_PERSON user belonging to a specific team is still blocked from accessing the application', async ({ request }) => {
    const users = await getUsers(request);
    const blockedTeamUser = users.find(u => u.export_status === 'NON_US_PERSON' && u.team_name !== null);

    if (blockedTeamUser) {
      const response = await login(request, blockedTeamUser.username, blockedTeamUser.password);
      expect(response.success).toBe(false);
      expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
    } else {
      const nonUsUser = users.find(u => u.export_status === 'NON_US_PERSON');
      expect(nonUsUser).toBeDefined();
      const response = await login(request, nonUsUser!.username, nonUsUser!.password);
      expect(response.success).toBe(false);
      expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
    }
  });
});
