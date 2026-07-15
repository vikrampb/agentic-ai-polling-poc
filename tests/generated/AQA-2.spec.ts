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
  test('PBE team user can log in and receives a successful login response', async ({ request }) => {
    const users = await getUsers(request);
    const pbeUser = users.find(u => u.team_name === 'PBE' && u.export_status === 'US_PERSON');
    expect(pbeUser).toBeDefined();

    const response = await login(request, pbeUser!.username, pbeUser!.password);
    expect(response.success).toBe(true);
    expect(response.message).toBe('Login successful. Welcome!');
  });

  test('DPS team user can log in and receives a successful login response', async ({ request }) => {
    const users = await getUsers(request);
    const dpsUser = users.find(u => u.team_name === 'DPS' && u.export_status === 'US_PERSON');
    expect(dpsUser).toBeDefined();

    const response = await login(request, dpsUser!.username, dpsUser!.password);
    expect(response.success).toBe(true);
    expect(response.message).toBe('Login successful. Welcome!');
  });

  test('US_PERSON user belonging to a team receives a welcome message upon login', async ({ request }) => {
    const users = await getUsers(request);
    const teamUser = users.find(u => u.team_name !== null && u.export_status === 'US_PERSON');
    expect(teamUser).toBeDefined();

    const response = await login(request, teamUser!.username, teamUser!.password);
    expect(response.success).toBe(true);
    expect(response.message).toBe('Login successful. Welcome!');
    expect(response.exportStatus).toBeDefined();
  });
});

test.describe('AQA-2 – Boundary Conditions', () => {
  test('NON_US_PERSON user who belongs to a team is blocked from logging in', async ({ request }) => {
    const users = await getUsers(request);
    const blockedUser = users.find(u => u.team_name !== null && u.export_status === 'NON_US_PERSON');
    expect(blockedUser).toBeDefined();

    const response = await login(request, blockedUser!.username, blockedUser!.password);
    expect(response.success).toBe(false);
    expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
  });

  test('User with no team assignment who is a US_PERSON can still log in successfully', async ({ request }) => {
    const users = await getUsers(request);
    const noTeamUser = users.find(u => u.team_name === null && u.export_status === 'US_PERSON');
    expect(noTeamUser).toBeDefined();

    const response = await login(request, noTeamUser!.username, noTeamUser!.password);
    expect(response.success).toBe(true);
    expect(response.message).toBe('Login successful. Welcome!');
  });

  test('Login attempt with missing credentials returns an appropriate error', async ({ request }) => {
    const response = await login(request, '', '');
    expect(response.success).toBe(false);
    expect(response.message).toBe('Missing credentials.');
  });
});

test.describe('AQA-2 – Negative Tests', () => {
  test('PBE team user cannot log in with an incorrect password', async ({ request }) => {
    const users = await getUsers(request);
    const pbeUser = users.find(u => u.team_name === 'PBE');
    expect(pbeUser).toBeDefined();

    const response = await login(request, pbeUser!.username, 'wrongPassword123!');
    expect(response.success).toBe(false);
    expect(response.message).toBe('Invalid UserID/Password combination. Please verify.');
  });

  test('DPS team user cannot log in with an incorrect password', async ({ request }) => {
    const users = await getUsers(request);
    const dpsUser = users.find(u => u.team_name === 'DPS');
    expect(dpsUser).toBeDefined();

    const response = await login(request, dpsUser!.username, 'wrongPassword123!');
    expect(response.success).toBe(false);
    expect(response.message).toBe('Invalid UserID/Password combination. Please verify.');
  });

  test('NON_US_PERSON user without a team assignment is blocked from accessing the application', async ({ request }) => {
    const users = await getUsers(request);
    const blockedNoTeamUser = users.find(u => u.team_name === null && u.export_status === 'NON_US_PERSON');
    expect(blockedNoTeamUser).toBeDefined();

    const response = await login(request, blockedNoTeamUser!.username, blockedNoTeamUser!.password);
    expect(response.success).toBe(false);
    expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
  });
});
