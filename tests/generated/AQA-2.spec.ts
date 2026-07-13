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
  test('PBE team user with US_PERSON status can log in successfully', async ({ request }) => {
    const users = await getUsers(request);
    const pbeUser = users.find(u => u.team_name === 'PBE' && u.export_status === 'US_PERSON');
    expect(pbeUser).toBeDefined();

    const response = await login(request, pbeUser!.username, pbeUser!.password);
    expect(response.success).toBe(true);
    expect(response.message).toBe('Login successful. Welcome!');
    expect(response.exportStatus).toBe('US_PERSON');
  });

  test('DPS team user with US_PERSON status can log in successfully', async ({ request }) => {
    const users = await getUsers(request);
    const dpsUser = users.find(u => u.team_name === 'DPS' && u.export_status === 'US_PERSON');
    expect(dpsUser).toBeDefined();

    const response = await login(request, dpsUser!.username, dpsUser!.password);
    expect(response.success).toBe(true);
    expect(response.message).toBe('Login successful. Welcome!');
    expect(response.exportStatus).toBe('US_PERSON');
  });

  test('Each team (PBE and DPS) has at least one US_PERSON user available to log in', async ({ request }) => {
    const users = await getUsers(request);
    const pbeUsPersonUsers = users.filter(u => u.team_name === 'PBE' && u.export_status === 'US_PERSON');
    const dpsUsPersonUsers = users.filter(u => u.team_name === 'DPS' && u.export_status === 'US_PERSON');

    expect(pbeUsPersonUsers.length).toBeGreaterThan(0);
    expect(dpsUsPersonUsers.length).toBeGreaterThan(0);
  });
});

test.describe('AQA-2 – Boundary Conditions', () => {
  test('NON_US_PERSON user is blocked from logging in regardless of team membership', async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUser = users.find(u => u.export_status === 'NON_US_PERSON' && u.team_name !== null);
    expect(nonUsUser).toBeDefined();

    const response = await login(request, nonUsUser!.username, nonUsUser!.password);
    expect(response.success).toBe(false);
    expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
  });

  test('User with no team assignment and US_PERSON status receives a login response', async ({ request }) => {
    const users = await getUsers(request);
    const noTeamUser = users.find(u => u.team_name === null && u.export_status === 'US_PERSON');
    expect(noTeamUser).toBeDefined();

    const response = await login(request, noTeamUser!.username, noTeamUser!.password);
    expect(typeof response.success).toBe('boolean');
    expect(typeof response.message).toBe('string');
  });

  test('All users retrieved from the system have a defined export_status of either US_PERSON or NON_US_PERSON', async ({ request }) => {
    const users = await getUsers(request);
    expect(users.length).toBeGreaterThan(0);

    for (const user of users) {
      expect(['US_PERSON', 'NON_US_PERSON']).toContain(user.export_status);
    }
  });
});

test.describe('AQA-2 – Negative Tests', () => {
  test('User cannot log in with an incorrect password', async ({ request }) => {
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

  test('Login attempt with valid username but wrong password is rejected for both PBE and DPS team users', async ({ request }) => {
    const users = await getUsers(request);
    const pbeUser = users.find(u => u.team_name === 'PBE');
    const dpsUser = users.find(u => u.team_name === 'DPS');
    expect(pbeUser).toBeDefined();
    expect(dpsUser).toBeDefined();

    const pbeResponse = await login(request, pbeUser!.username, 'wrongPassword123!');
    expect(pbeResponse.success).toBe(false);
    expect(pbeResponse.message).toBe('Invalid UserID/Password combination. Please verify.');

    const dpsResponse = await login(request, dpsUser!.username, 'wrongPassword123!');
    expect(dpsResponse.success).toBe(false);
    expect(dpsResponse.message).toBe('Invalid UserID/Password combination. Please verify.');
  });
});
