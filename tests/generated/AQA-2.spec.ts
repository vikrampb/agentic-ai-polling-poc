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

    const response = await login(request, pbeUser.username, pbeUser.password);
    expect(response.success).toBe(true);
    expect(response.message).toBe('Login successful. Welcome!');
  });

  test('DPS team user can log in and receives a successful welcome message', async ({ request }) => {
    const users = await getUsers(request);
    const dpsUser = users.find(u => u.team_name === 'DPS' && u.export_status === 'US_PERSON');
    expect(dpsUser).toBeDefined();

    const response = await login(request, dpsUser.username, dpsUser.password);
    expect(response.success).toBe(true);
    expect(response.message).toBe('Login successful. Welcome!');
  });

  test('All US_PERSON users with a team assignment receive a successful login response', async ({ request }) => {
    const users = await getUsers(request);
    const teamUsers = users.filter(u => u.team_name !== null && u.export_status === 'US_PERSON');
    expect(teamUsers.length).toBeGreaterThan(0);

    for (const user of teamUsers) {
      const response = await login(request, user.username, user.password);
      expect(response.success).toBe(true);
      expect(response.message).toBe('Login successful. Welcome!');
    }
  });
});

test.describe('AQA-2 – Boundary Conditions', () => {
  test('NON_US_PERSON user with a team assignment is blocked from logging in', async ({ request }) => {
    const users = await getUsers(request);
    const blockedUser = users.find(u => u.team_name !== null && u.export_status === 'NON_US_PERSON');
    expect(blockedUser).toBeDefined();

    const response = await login(request, blockedUser.username, blockedUser.password);
    expect(response.success).toBe(false);
    expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
  });

  test('US_PERSON user with no team assignment still receives a successful login response', async ({ request }) => {
    const users = await getUsers(request);
    const noTeamUser = users.find(u => u.team_name === null && u.export_status === 'US_PERSON');
    expect(noTeamUser).toBeDefined();

    const response = await login(request, noTeamUser.username, noTeamUser.password);
    expect(response.success).toBe(true);
    expect(response.message).toBe('Login successful. Welcome!');
  });

  test('NON_US_PERSON user with no team assignment is blocked from logging in', async ({ request }) => {
    const users = await getUsers(request);
    const blockedNoTeamUser = users.find(u => u.team_name === null && u.export_status === 'NON_US_PERSON');
    expect(blockedNoTeamUser).toBeDefined();

    const response = await login(request, blockedNoTeamUser.username, blockedNoTeamUser.password);
    expect(response.success).toBe(false);
    expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
  });
});

test.describe('AQA-2 – Negative Tests', () => {
  test('Login attempt with a correct username but wrong password is rejected', async ({ request }) => {
    const users = await getUsers(request);
    const anyUser = users.find(u => u.team_name !== null);
    expect(anyUser).toBeDefined();

    const response = await login(request, anyUser.username, 'wrongPassword123!');
    expect(response.success).toBe(false);
    expect(response.message).toBe('Invalid UserID/Password combination. Please verify.');
  });

  test('Login attempt with empty username and empty password is rejected', async ({ request }) => {
    const response = await login(request, '', '');
    expect(response.success).toBe(false);
    expect(response.message).toBe('Missing credentials.');
  });

  test('Login attempt with a valid password but empty username is rejected', async ({ request }) => {
    const users = await getUsers(request);
    const anyUser = users.find(u => u.team_name !== null);
    expect(anyUser).toBeDefined();

    const response = await login(request, '', anyUser.password);
    expect(response.success).toBe(false);
    expect(response.message).toBe('Missing credentials.');
  });
});
