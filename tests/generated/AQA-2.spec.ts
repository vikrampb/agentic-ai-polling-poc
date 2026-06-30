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

  test('US_PERSON user receives exportStatus in response upon successful login', async ({ request }) => {
    const users = await getUsers(request);
    const usPersonUser = users.find(u => u.export_status === 'US_PERSON');
    expect(usPersonUser).toBeDefined();

    const response = await login(request, usPersonUser!.username, usPersonUser!.password);
    expect(response.success).toBe(true);
    expect(response.message).toContain('Login successful');
    expect(response.exportStatus).toBeDefined();
  });
});

test.describe('AQA-2 – Boundary Conditions', () => {
  test('User with null team_name but US_PERSON export status can log in', async ({ request }) => {
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

  test('NON_US_PERSON user from PBE team is blocked from logging in', async ({ request }) => {
    const users = await getUsers(request);
    const nonUsPbeUser = users.find(u => u.team_name === 'PBE' && u.export_status === 'NON_US_PERSON');

    if (!nonUsPbeUser) {
      test.skip();
      return;
    }

    const response = await login(request, nonUsPbeUser.username, nonUsPbeUser.password);
    expect(response.success).toBe(false);
    expect(response.message).toContain('Only US Persons are allowed to watch this demo.');
  });

  test('NON_US_PERSON user from DPS team is blocked from logging in', async ({ request }) => {
    const users = await getUsers(request);
    const nonUsDpsUser = users.find(u => u.team_name === 'DPS' && u.export_status === 'NON_US_PERSON');

    if (!nonUsDpsUser) {
      test.skip();
      return;
    }

    const response = await login(request, nonUsDpsUser.username, nonUsDpsUser.password);
    expect(response.success).toBe(false);
    expect(response.message).toContain('Only US Persons are allowed to watch this demo.');
  });
});

test.describe('AQA-2 – Negative Tests', () => {
  test('Login fails with incorrect password for a valid US_PERSON user', async ({ request }) => {
    const users = await getUsers(request);
    const validUser = users.find(u => u.export_status === 'US_PERSON');
    expect(validUser).toBeDefined();

    const response = await login(request, validUser!.username, 'wrongpassword123!');
    expect(response.success).toBe(false);
    expect(response.message).not.toContain('Login successful');
  });

  test('Login fails with non-existent username', async ({ request }) => {
    const response = await login(request, 'nonexistent_user_xyz', 'somepassword');
    expect(response.success).toBe(false);
    expect(response.message).not.toContain('Login successful');
  });

  test('All NON_US_PERSON users are blocked regardless of team', async ({ request }) => {
    const users = await getUsers(request);
    const nonUsPersonUsers = users.filter(u => u.export_status === 'NON_US_PERSON');

    for (const user of nonUsPersonUsers) {
      const response = await login(request, user.username, user.password);
      expect(response.success).toBe(false);
      expect(response.message).toContain('Only US Persons are allowed to watch this demo.');
    }
  });
});
