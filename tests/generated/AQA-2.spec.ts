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
  test('PBE team user is successfully logged in and receives a welcome message', async ({ request }) => {
    const users = await getUsers(request);
    const pbeUser = users.find(u => u.team_name === 'PBE' && u.export_status === 'US_PERSON');
    expect(pbeUser).toBeDefined();

    const response = await login(request, pbeUser!.username, pbeUser!.password);
    expect(response.success).toBe(true);
    expect(response.message).toBe('Login successful. Welcome!');
    expect(response.exportStatus).toBe('US_PERSON');
  });

  test('DPS team user is successfully logged in and receives a welcome message', async ({ request }) => {
    const users = await getUsers(request);
    const dpsUser = users.find(u => u.team_name === 'DPS' && u.export_status === 'US_PERSON');
    expect(dpsUser).toBeDefined();

    const response = await login(request, dpsUser!.username, dpsUser!.password);
    expect(response.success).toBe(true);
    expect(response.message).toBe('Login successful. Welcome!');
    expect(response.exportStatus).toBe('US_PERSON');
  });

  test('Each team (PBE and DPS) has at least one eligible US Person user available', async ({ request }) => {
    const users = await getUsers(request);
    const pbeUsers = users.filter(u => u.team_name === 'PBE' && u.export_status === 'US_PERSON');
    const dpsUsers = users.filter(u => u.team_name === 'DPS' && u.export_status === 'US_PERSON');

    expect(pbeUsers.length).toBeGreaterThanOrEqual(1);
    expect(dpsUsers.length).toBeGreaterThanOrEqual(1);
  });
});

test.describe('AQA-2 – Boundary Conditions', () => {
  test('A NON_US_PERSON user belonging to a team is blocked from logging in', async ({ request }) => {
    const users = await getUsers(request);
    const blockedUser = users.find(u => u.export_status === 'NON_US_PERSON' && (u.team_name === 'PBE' || u.team_name === 'DPS'));

    if (!blockedUser) {
      test.skip();
      return;
    }

    const response = await login(request, blockedUser.username, blockedUser.password);
    expect(response.success).toBe(false);
    expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
  });

  test('A user with no team assignment who is a US Person can still log in successfully', async ({ request }) => {
    const users = await getUsers(request);
    const noTeamUser = users.find(u => u.team_name === null && u.export_status === 'US_PERSON');

    if (!noTeamUser) {
      test.skip();
      return;
    }

    const response = await login(request, noTeamUser.username, noTeamUser.password);
    expect(response.success).toBe(true);
    expect(response.message).toBe('Login successful. Welcome!');
  });

  test('A user with no team assignment who is a NON_US_PERSON is blocked from logging in', async ({ request }) => {
    const users = await getUsers(request);
    const noTeamBlockedUser = users.find(u => u.team_name === null && u.export_status === 'NON_US_PERSON');

    if (!noTeamBlockedUser) {
      test.skip();
      return;
    }

    const response = await login(request, noTeamBlockedUser.username, noTeamBlockedUser.password);
    expect(response.success).toBe(false);
    expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
  });
});

test.describe('AQA-2 – Negative Tests', () => {
  test('A valid user attempting to log in with an incorrect password receives an error message', async ({ request }) => {
    const users = await getUsers(request);
    const anyUser = users[0];
    expect(anyUser).toBeDefined();

    const response = await login(request, anyUser.username, 'wrongPassword123!');
    expect(response.success).toBe(false);
    expect(response.message).toBe('Invalid UserID/Password combination. Please verify.');
  });

  test('Attempting to log in with empty username and password returns a missing credentials error', async ({ request }) => {
    const response = await login(request, '', '');
    expect(response.success).toBe(false);
    expect(response.message).toBe('Missing credentials.');
  });

  test('Attempting to log in with a non-existent username and wrong password returns an invalid credentials error', async ({ request }) => {
    const response = await login(request, 'nonexistentuser_xyz', 'wrongPassword123!');
    expect(response.success).toBe(false);
    expect(response.message).toBe('Invalid UserID/Password combination. Please verify.');
  });
});
