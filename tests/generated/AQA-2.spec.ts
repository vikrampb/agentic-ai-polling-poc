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

  test('Each team (PBE and DPS) has at least one US_PERSON user who can log in', async ({ request }) => {
    const users = await getUsers(request);

    const pbeUser = users.find(u => u.team_name === 'PBE' && u.export_status === 'US_PERSON');
    const dpsUser = users.find(u => u.team_name === 'DPS' && u.export_status === 'US_PERSON');

    expect(pbeUser).toBeDefined();
    expect(dpsUser).toBeDefined();

    const pbeResponse = await login(request, pbeUser!.username, pbeUser!.password);
    expect(pbeResponse.success).toBe(true);
    expect(pbeResponse.message).toBe('Login successful. Welcome!');

    const dpsResponse = await login(request, dpsUser!.username, dpsUser!.password);
    expect(dpsResponse.success).toBe(true);
    expect(dpsResponse.message).toBe('Login successful. Welcome!');
  });
});

test.describe('AQA-2 – Boundary Conditions', () => {
  test('NON_US_PERSON team user is blocked from logging in regardless of team membership', async ({ request }) => {
    const users = await getUsers(request);
    const blockedUser = users.find(u => u.team_name !== null && u.export_status === 'NON_US_PERSON');
    expect(blockedUser).toBeDefined();

    const response = await login(request, blockedUser!.username, blockedUser!.password);
    expect(response.success).toBe(false);
    expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
  });

  test('User with no team assigned and US_PERSON status receives a successful login response', async ({ request }) => {
    const users = await getUsers(request);
    const noTeamUser = users.find(u => u.team_name === null && u.export_status === 'US_PERSON');
    expect(noTeamUser).toBeDefined();

    const response = await login(request, noTeamUser!.username, noTeamUser!.password);
    expect(response.success).toBe(true);
    expect(response.message).toBe('Login successful. Welcome!');
  });

  test('User with no team assigned and NON_US_PERSON status is blocked from logging in', async ({ request }) => {
    const users = await getUsers(request);
    const noTeamBlockedUser = users.find(u => u.team_name === null && u.export_status === 'NON_US_PERSON');
    expect(noTeamBlockedUser).toBeDefined();

    const response = await login(request, noTeamBlockedUser!.username, noTeamBlockedUser!.password);
    expect(response.success).toBe(false);
    expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
  });
});

test.describe('AQA-2 – Negative Tests', () => {
  test('Login fails when a valid username is submitted with an incorrect password', async ({ request }) => {
    const users = await getUsers(request);
    const anyUser = users.find(u => u.username !== undefined);
    expect(anyUser).toBeDefined();

    const response = await login(request, anyUser!.username, 'wrongPassword123!');
    expect(response.success).toBe(false);
    expect(response.message).toBe('Invalid UserID/Password combination. Please verify.');
  });

  test('Login fails when both username and password fields are left empty', async ({ request }) => {
    const response = await login(request, '', '');
    expect(response.success).toBe(false);
    expect(response.message).toBe('Missing credentials.');
  });

  test('Login fails when only the username is provided and the password is missing', async ({ request }) => {
    const users = await getUsers(request);
    const anyUser = users.find(u => u.username !== undefined);
    expect(anyUser).toBeDefined();

    const response = await login(request, anyUser!.username, '');
    expect(response.success).toBe(false);
    expect(response.message).toBe('Missing credentials.');
  });
});
