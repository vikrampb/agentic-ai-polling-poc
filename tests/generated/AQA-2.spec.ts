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
  test('PBE team user can log in successfully and receives login confirmation', async ({ request }) => {
    const users = await getUsers(request);
    const pbeUser = users.find(u => u.team_name === 'PBE' && u.export_status === 'US_PERSON');
    if (!pbeUser) test.skip();

    const response = await login(request, pbeUser.username, pbeUser.password);
    expect(response.success).toBe(true);
    expect(response.message).toContain('Login successful');
  });

  test('DPS team user can log in successfully and receives login confirmation', async ({ request }) => {
    const users = await getUsers(request);
    const dpsUser = users.find(u => u.team_name === 'DPS' && u.export_status === 'US_PERSON');
    if (!dpsUser) test.skip();

    const response = await login(request, dpsUser.username, dpsUser.password);
    expect(response.success).toBe(true);
    expect(response.message).toContain('Login successful');
  });

  test('US_PERSON user belonging to a team receives a successful login response', async ({ request }) => {
    const users = await getUsers(request);
    const teamUser = users.find(u => u.team_name !== null && u.export_status === 'US_PERSON');
    if (!teamUser) test.skip();

    const response = await login(request, teamUser.username, teamUser.password);
    expect(response.success).toBe(true);
    expect(response.message).toContain('Login successful');
    expect(response.exportStatus).toBeDefined();
  });
});

test.describe('AQA-2 – Boundary', () => {
  test('User with no team assigned but valid US_PERSON status can still log in', async ({ request }) => {
    const users = await getUsers(request);
    const noTeamUser = users.find(u => u.team_name === null && u.export_status === 'US_PERSON');
    if (!noTeamUser) test.skip();

    const response = await login(request, noTeamUser.username, noTeamUser.password);
    expect(response.success).toBe(true);
    expect(response.message).toContain('Login successful');
  });

  test('NON_US_PERSON user belonging to PBE team is blocked from logging in', async ({ request }) => {
    const users = await getUsers(request);
    const nonUsPbeUser = users.find(u => u.team_name === 'PBE' && u.export_status === 'NON_US_PERSON');
    if (!nonUsPbeUser) test.skip();

    const response = await login(request, nonUsPbeUser.username, nonUsPbeUser.password);
    expect(response.success).toBe(false);
    expect(response.message).toContain('Only US Persons are allowed to watch this demo.');
  });

  test('NON_US_PERSON user belonging to DPS team is blocked from logging in', async ({ request }) => {
    const users = await getUsers(request);
    const nonUsDpsUser = users.find(u => u.team_name === 'DPS' && u.export_status === 'NON_US_PERSON');
    if (!nonUsDpsUser) test.skip();

    const response = await login(request, nonUsDpsUser.username, nonUsDpsUser.password);
    expect(response.success).toBe(false);
    expect(response.message).toContain('Only US Persons are allowed to watch this demo.');
  });
});

test.describe('AQA-2 – Negative', () => {
  test('NON_US_PERSON user with no team is blocked from logging in', async ({ request }) => {
    const users = await getUsers(request);
    const nonUsNoTeamUser = users.find(u => u.team_name === null && u.export_status === 'NON_US_PERSON');
    if (!nonUsNoTeamUser) test.skip();

    const response = await login(request, nonUsNoTeamUser.username, nonUsNoTeamUser.password);
    expect(response.success).toBe(false);
    expect(response.message).toContain('Only US Persons are allowed to watch this demo.');
  });

  test('User cannot log in with incorrect credentials regardless of team', async ({ request }) => {
    const users = await getUsers(request);
    const anyUser = users.find(u => u.team_name !== null);
    if (!anyUser) test.skip();

    const response = await login(request, anyUser.username, 'wrong_password_xyz');
    expect(response.success).toBe(false);
  });

  test('All NON_US_PERSON users across all teams are denied access', async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUsers = users.filter(u => u.export_status === 'NON_US_PERSON');
    if (!nonUsUsers.length) test.skip();

    for (const user of nonUsUsers) {
      const response = await login(request, user.username, user.password);
      expect(response.success).toBe(false);
      expect(response.message).toContain('Only US Persons are allowed to watch this demo.');
    }
  });
});
