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
    expect(pbeUser).toBeDefined();

    const response = await login(request, pbeUser!.username, pbeUser!.password);
    expect(response.success).toBe(true);
    expect(response.message).toContain('Login successful');
  });

  test('DPS team user logs in successfully and receives login successful message', async ({ request }) => {
    const users = await getUsers(request);
    const dpsUser = users.find(u => u.team_name === 'DPS' && u.export_status === 'US_PERSON');
    expect(dpsUser).toBeDefined();

    const response = await login(request, dpsUser!.username, dpsUser!.password);
    expect(response.success).toBe(true);
    expect(response.message).toContain('Login successful');
  });

  test('US_PERSON user receives exportStatus in login response', async ({ request }) => {
    const users = await getUsers(request);
    const usPersonUser = users.find(u => u.export_status === 'US_PERSON');
    expect(usPersonUser).toBeDefined();

    const response = await login(request, usPersonUser!.username, usPersonUser!.password);
    expect(response.success).toBe(true);
    expect(response.exportStatus).toBeDefined();
    expect(response.message).toContain('Login successful');
  });
});

test.describe('AQA-2 – Boundary Conditions', () => {
  test('User with null team_name and US_PERSON export status can still log in', async ({ request }) => {
    const users = await getUsers(request);
    const nullTeamUser = users.find(u => u.team_name === null && u.export_status === 'US_PERSON');

    if (!nullTeamUser) {
      test.skip();
      return;
    }

    const response = await login(request, nullTeamUser.username, nullTeamUser.password);
    expect(response.success).toBe(true);
    expect(response.message).toContain('Login successful');
  });

  test('NON_US_PERSON user regardless of team is blocked from logging in', async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUser = users.find(u => u.export_status === 'NON_US_PERSON');
    expect(nonUsUser).toBeDefined();

    const response = await login(request, nonUsUser!.username, nonUsUser!.password);
    expect(response.success).toBe(false);
    expect(response.message).toContain('Only US Persons are allowed to watch this demo.');
  });

  test('All users belonging to PBE or DPS team are US_PERSON export status', async ({ request }) => {
    const users = await getUsers(request);
    const teamUsers = users.filter(u => u.team_name === 'PBE' || u.team_name === 'DPS');

    for (const user of teamUsers) {
      expect(user.export_status).toBe('US_PERSON');
    }
  });
});

test.describe('AQA-2 – Negative Tests', () => {
  test('NON_US_PERSON user from PBE team is blocked from logging in', async ({ request }) => {
    const users = await getUsers(request);
    const blockedUser = users.find(u => u.team_name === 'PBE' && u.export_status === 'NON_US_PERSON');

    if (!blockedUser) {
      test.skip();
      return;
    }

    const response = await login(request, blockedUser.username, blockedUser.password);
    expect(response.success).toBe(false);
    expect(response.message).toContain('Only US Persons are allowed to watch this demo.');
  });

  test('NON_US_PERSON user from DPS team is blocked from logging in', async ({ request }) => {
    const users = await getUsers(request);
    const blockedUser = users.find(u => u.team_name === 'DPS' && u.export_status === 'NON_US_PERSON');

    if (!blockedUser) {
      test.skip();
      return;
    }

    const response = await login(request, blockedUser.username, blockedUser.password);
    expect(response.success).toBe(false);
    expect(response.message).toContain('Only US Persons are allowed to watch this demo.');
  });

  test('Login with wrong password returns unsuccessful response', async ({ request }) => {
    const users = await getUsers(request);
    const anyUser = users.find(u => u.export_status === 'US_PERSON');
    expect(anyUser).toBeDefined();

    const response = await login(request, anyUser!.username, 'totally_wrong_password_xyz_123');
    expect(response.success).toBe(false);
  });
});
