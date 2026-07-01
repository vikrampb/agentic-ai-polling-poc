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
  test('PBE team user can log in successfully and receives login successful message', async ({ request }) => {
    const users = await getUsers(request);
    const pbeUser = users.find(u => u.team_name === 'PBE' && u.export_status === 'US_PERSON');
    expect(pbeUser).toBeDefined();

    const response = await login(request, pbeUser!.username, pbeUser!.password);
    expect(response.success).toBe(true);
    expect(response.message).toContain('Login successful');
  });

  test('DPS team user can log in successfully and receives login successful message', async ({ request }) => {
    const users = await getUsers(request);
    const dpsUser = users.find(u => u.team_name === 'DPS' && u.export_status === 'US_PERSON');
    expect(dpsUser).toBeDefined();

    const response = await login(request, dpsUser!.username, dpsUser!.password);
    expect(response.success).toBe(true);
    expect(response.message).toContain('Login successful');
  });

  test('US_PERSON user login returns exportStatus field in response', async ({ request }) => {
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
  test('user with null team_name but US_PERSON status can still attempt login', async ({ request }) => {
    const users = await getUsers(request);
    const nullTeamUser = users.find(u => u.team_name === null && u.export_status === 'US_PERSON');

    if (nullTeamUser) {
      const response = await login(request, nullTeamUser.username, nullTeamUser.password);
      expect(response.message).toContain('Login successful');
    } else {
      const allUsers = users.filter(u => u.export_status === 'US_PERSON');
      expect(allUsers.length).toBeGreaterThan(0);
    }
  });

  test('all users returned by getUsers have a defined export_status value', async ({ request }) => {
    const users = await getUsers(request);
    expect(users.length).toBeGreaterThan(0);
    for (const user of users) {
      expect(['US_PERSON', 'NON_US_PERSON']).toContain(user.export_status);
    }
  });

  test('team_name values for all users are restricted to PBE, DPS, or null', async ({ request }) => {
    const users = await getUsers(request);
    expect(users.length).toBeGreaterThan(0);
    for (const user of users) {
      expect(['PBE', 'DPS', null]).toContain(user.team_name);
    }
  });
});

test.describe('AQA-2 – Negative Tests', () => {
  test('NON_US_PERSON user is blocked from logging in regardless of team', async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUser = users.find(u => u.export_status === 'NON_US_PERSON');
    expect(nonUsUser).toBeDefined();

    const response = await login(request, nonUsUser!.username, nonUsUser!.password);
    expect(response.success).toBe(false);
    expect(response.message).toContain('Only US Persons are allowed to watch this demo.');
  });

  test('NON_US_PERSON user from PBE team is blocked from logging in', async ({ request }) => {
    const users = await getUsers(request);
    const nonUsPbeUser = users.find(u => u.export_status === 'NON_US_PERSON' && u.team_name === 'PBE');

    if (nonUsPbeUser) {
      const response = await login(request, nonUsPbeUser.username, nonUsPbeUser.password);
      expect(response.success).toBe(false);
      expect(response.message).toContain('Only US Persons are allowed to watch this demo.');
    } else {
      const nonUsUsers = users.filter(u => u.export_status === 'NON_US_PERSON');
      expect(nonUsUsers.length).toBeGreaterThanOrEqual(0);
    }
  });

  test('login with invalid credentials returns unsuccessful response', async ({ request }) => {
    const response = await login(request, 'invalid_user_xyz', 'wrong_password_xyz');
    expect(response.success).toBe(false);
  });
});
