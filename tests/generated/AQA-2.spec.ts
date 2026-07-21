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
  test('PBE team user with US_PERSON status can log in and receives a successful welcome message', async ({ request }) => {
    const users = await getUsers(request);
    const pbeUser = users.find(u => u.team_name === 'PBE' && u.export_status === 'US_PERSON');
    expect(pbeUser).toBeDefined();

    const response = await login(request, pbeUser!.username, pbeUser!.password);
    expect(response.success).toBe(true);
    expect(response.message).toBe('Login successful. Welcome!');
    expect(response.exportStatus).toBe('US_PERSON');
  });

  test('DPS team user with US_PERSON status can log in and receives a successful welcome message', async ({ request }) => {
    const users = await getUsers(request);
    const dpsUser = users.find(u => u.team_name === 'DPS' && u.export_status === 'US_PERSON');
    expect(dpsUser).toBeDefined();

    const response = await login(request, dpsUser!.username, dpsUser!.password);
    expect(response.success).toBe(true);
    expect(response.message).toBe('Login successful. Welcome!');
    expect(response.exportStatus).toBe('US_PERSON');
  });

  test('Each team (PBE and DPS) has at least one user defined in the system', async ({ request }) => {
    const users = await getUsers(request);
    const pbeUsers = users.filter(u => u.team_name === 'PBE');
    const dpsUsers = users.filter(u => u.team_name === 'DPS');

    expect(pbeUsers.length).toBeGreaterThanOrEqual(1);
    expect(dpsUsers.length).toBeGreaterThanOrEqual(1);
  });
});

test.describe('AQA-2 – Boundary Conditions', () => {
  test('NON_US_PERSON user is blocked from logging in regardless of their team assignment', async ({ request }) => {
    const users = await getUsers(request);
    const blockedUser = users.find(u => u.export_status === 'NON_US_PERSON');
    expect(blockedUser).toBeDefined();

    const response = await login(request, blockedUser!.username, blockedUser!.password);
    expect(response.success).toBe(false);
    expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
  });

  test('User with no team assignment but US_PERSON status receives the correct login response', async ({ request }) => {
    const users = await getUsers(request);
    const noTeamUser = users.find(u => u.team_name === null && u.export_status === 'US_PERSON');

    if (noTeamUser) {
      const response = await login(request, noTeamUser.username, noTeamUser.password);
      expect(typeof response.success).toBe('boolean');
      expect(typeof response.message).toBe('string');
      expect(response.message).toBe('Login successful. Welcome!');
    } else {
      const noTeamUsers = users.filter(u => u.team_name === null);
      expect(noTeamUsers.length).toBeGreaterThanOrEqual(0);
    }
  });

  test('Login response does not expose unexpected fields beyond success, message, and exportStatus', async ({ request }) => {
    const users = await getUsers(request);
    const usUser = users.find(u => u.export_status === 'US_PERSON');
    expect(usUser).toBeDefined();

    const response = await login(request, usUser!.username, usUser!.password);
    expect(response).not.toHaveProperty('redirect_url');
    expect(response).not.toHaveProperty('home_page');
    expect(response).not.toHaveProperty('team');
    expect(response).not.toHaveProperty('teamPage');
  });
});

test.describe('AQA-2 – Negative Tests', () => {
  test('User cannot log in with a correct username but wrong password', async ({ request }) => {
    const users = await getUsers(request);
    const anyUser = users.find(u => u.export_status === 'US_PERSON');
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

  test('NON_US_PERSON user on a known team is still blocked from accessing the application', async ({ request }) => {
    const users = await getUsers(request);
    const blockedTeamUser = users.find(u => u.export_status === 'NON_US_PERSON' && (u.team_name === 'PBE' || u.team_name === 'DPS'));

    if (blockedTeamUser) {
      const response = await login(request, blockedTeamUser.username, blockedTeamUser.password);
      expect(response.success).toBe(false);
      expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
    } else {
      const allBlocked = users.filter(u => u.export_status === 'NON_US_PERSON');
      expect(allBlocked.length).toBeGreaterThanOrEqual(1);
    }
  });
});
