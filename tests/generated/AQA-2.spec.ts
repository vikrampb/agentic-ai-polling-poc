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

  test('US_PERSON user from any team receives a welcome message upon successful login', async ({ request }) => {
    const users = await getUsers(request);
    const usPersonUser = users.find(u => u.export_status === 'US_PERSON');
    expect(usPersonUser).toBeDefined();

    const response = await login(request, usPersonUser!.username, usPersonUser!.password);
    expect(response.success).toBe(true);
    expect(response.message).toBe('Login successful. Welcome!');
    expect(response.exportStatus).toBeDefined();
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

  test('User with no team assignment who is a US_PERSON can still log in successfully', async ({ request }) => {
    const users = await getUsers(request);
    const noTeamUsUser = users.find(u => u.team_name === null && u.export_status === 'US_PERSON');
    expect(noTeamUsUser).toBeDefined();

    const response = await login(request, noTeamUsUser!.username, noTeamUsUser!.password);
    expect(response.success).toBe(true);
    expect(response.message).toBe('Login successful. Welcome!');
  });

  test('User with no team assignment who is a NON_US_PERSON is blocked from logging in', async ({ request }) => {
    const users = await getUsers(request);
    const noTeamNonUsUser = users.find(u => u.team_name === null && u.export_status === 'NON_US_PERSON');
    expect(noTeamNonUsUser).toBeDefined();

    const response = await login(request, noTeamNonUsUser!.username, noTeamNonUsUser!.password);
    expect(response.success).toBe(false);
    expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
  });
});

test.describe('AQA-2 – Negative Tests', () => {
  test('Valid user is denied access when an incorrect password is provided', async ({ request }) => {
    const users = await getUsers(request);
    const anyUser = users.find(u => u.export_status === 'US_PERSON');
    expect(anyUser).toBeDefined();

    const response = await login(request, anyUser!.username, 'wrongPassword123!');
    expect(response.success).toBe(false);
    expect(response.message).toBe('Invalid UserID/Password combination. Please verify.');
  });

  test('Login attempt with empty username and empty password returns a missing credentials error', async ({ request }) => {
    const response = await login(request, '', '');
    expect(response.success).toBe(false);
    expect(response.message).toBe('Missing credentials.');
  });

  test('Login attempt with a valid password but no username returns a missing credentials error', async ({ request }) => {
    const users = await getUsers(request);
    const anyUser = users.find(u => u.export_status === 'US_PERSON');
    expect(anyUser).toBeDefined();

    const response = await login(request, '', anyUser!.password);
    expect(response.success).toBe(false);
    expect(response.message).toBe('Missing credentials.');
  });
});
