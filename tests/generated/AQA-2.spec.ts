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
  test('PBE team user with US_PERSON status can login successfully', async ({ request }) => {
    const users = await getUsers(request);
    const pbeUser = users.find(u => u.team_name === 'PBE' && u.export_status === 'US_PERSON');
    if (!pbeUser) test.skip();

    const response = await login(request, pbeUser.username, pbeUser.password);
    expect(response.success).toBe(true);
    expect(response.message).toContain('Login successful');
  });

  test('DPS team user with US_PERSON status can login successfully', async ({ request }) => {
    const users = await getUsers(request);
    const dpsUser = users.find(u => u.team_name === 'DPS' && u.export_status === 'US_PERSON');
    if (!dpsUser) test.skip();

    const response = await login(request, dpsUser.username, dpsUser.password);
    expect(response.success).toBe(true);
    expect(response.message).toContain('Login successful');
  });

  test('US_PERSON user login returns exportStatus in response', async ({ request }) => {
    const users = await getUsers(request);
    const usUser = users.find(u => u.export_status === 'US_PERSON');
    if (!usUser) test.skip();

    const response = await login(request, usUser.username, usUser.password);
    expect(response.success).toBe(true);
    expect(response.exportStatus).toBeDefined();
    expect(response.exportStatus).toBe('US_PERSON');
  });
});

test.describe('AQA-2 – Boundary Conditions', () => {
  test('User with null team_name and US_PERSON status can still login successfully', async ({ request }) => {
    const users = await getUsers(request);
    const nullTeamUser = users.find(u => u.team_name === null && u.export_status === 'US_PERSON');
    if (!nullTeamUser) test.skip();

    const response = await login(request, nullTeamUser.username, nullTeamUser.password);
    expect(response.success).toBe(true);
    expect(response.message).toContain('Login successful');
  });

  test('NON_US_PERSON user belonging to PBE team is blocked from login', async ({ request }) => {
    const users = await getUsers(request);
    const blockedUser = users.find(u => u.team_name === 'PBE' && u.export_status === 'NON_US_PERSON');
    if (!blockedUser) test.skip();

    const response = await login(request, blockedUser.username, blockedUser.password);
    expect(response.success).toBe(false);
    expect(response.message).toContain('Only US Persons are allowed to watch this demo.');
  });

  test('NON_US_PERSON user belonging to DPS team is blocked from login', async ({ request }) => {
    const users = await getUsers(request);
    const blockedUser = users.find(u => u.team_name === 'DPS' && u.export_status === 'NON_US_PERSON');
    if (!blockedUser) test.skip();

    const response = await login(request, blockedUser.username, blockedUser.password);
    expect(response.success).toBe(false);
    expect(response.message).toContain('Only US Persons are allowed to watch this demo.');
  });
});

test.describe('AQA-2 – Negative Tests', () => {
  test('Login fails for NON_US_PERSON user regardless of team', async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUser = users.find(u => u.export_status === 'NON_US_PERSON');
    if (!nonUsUser) test.skip();

    const response = await login(request, nonUsUser.username, nonUsUser.password);
    expect(response.success).toBe(false);
    expect(response.message).toContain('Only US Persons are allowed to watch this demo.');
  });

  test('Login fails with incorrect password for a valid US_PERSON user', async ({ request }) => {
    const users = await getUsers(request);
    const validUser = users.find(u => u.export_status === 'US_PERSON');
    if (!validUser) test.skip();

    const response = await login(request, validUser.username, 'wrongpassword_xyz_123');
    expect(response.success).toBe(false);
    expect(response.message).not.toContain('Login successful');
  });

  test('Login fails with empty credentials', async ({ request }) => {
    const response = await login(request, '', '');
    expect(response.success).toBe(false);
    expect(response.message).not.toContain('Login successful');
  });
});
