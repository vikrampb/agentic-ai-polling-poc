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
    expect(response.message).toContain("Login successful");
  });

  test('DPS team user logs in successfully and receives login successful message', async ({ request }) => {
    const users = await getUsers(request);
    const dpsUser = users.find(u => u.team_name === 'DPS' && u.export_status === 'US_PERSON');
    expect(dpsUser).toBeDefined();

    const response = await login(request, dpsUser!.username, dpsUser!.password);
    expect(response.success).toBe(true);
    expect(response.message).toContain("Login successful");
  });

  test('All US_PERSON users regardless of team receive login successful message', async ({ request }) => {
    const users = await getUsers(request);
    const usPersonUsers = users.filter(u => u.export_status === 'US_PERSON');
    expect(usPersonUsers.length).toBeGreaterThan(0);

    for (const user of usPersonUsers) {
      const response = await login(request, user.username, user.password);
      expect(response.success).toBe(true);
      expect(response.message).toContain("Login successful");
    }
  });
});

test.describe('AQA-2 – Boundary Conditions', () => {
  test('User with null team_name but US_PERSON export status still gets login successful message', async ({ request }) => {
    const users = await getUsers(request);
    const nullTeamUser = users.find(u => u.team_name === null && u.export_status === 'US_PERSON');

    if (nullTeamUser) {
      const response = await login(request, nullTeamUser.username, nullTeamUser.password);
      expect(response.success).toBe(true);
      expect(response.message).toContain("Login successful");
    } else {
      test.skip();
    }
  });

  test('NON_US_PERSON user with PBE team is blocked from logging in', async ({ request }) => {
    const users = await getUsers(request);
    const nonUsPbeUser = users.find(u => u.team_name === 'PBE' && u.export_status === 'NON_US_PERSON');

    if (nonUsPbeUser) {
      const response = await login(request, nonUsPbeUser.username, nonUsPbeUser.password);
      expect(response.success).toBe(false);
      expect(response.message).toContain("Only US Persons are allowed to watch this demo.");
    } else {
      test.skip();
    }
  });

  test('NON_US_PERSON user with DPS team is blocked from logging in', async ({ request }) => {
    const users = await getUsers(request);
    const nonUsDpsUser = users.find(u => u.team_name === 'DPS' && u.export_status === 'NON_US_PERSON');

    if (nonUsDpsUser) {
      const response = await login(request, nonUsDpsUser.username, nonUsDpsUser.password);
      expect(response.success).toBe(false);
      expect(response.message).toContain("Only US Persons are allowed to watch this demo.");
    } else {
      test.skip();
    }
  });
});

test.describe('AQA-2 – Negative Tests', () => {
  test('NON_US_PERSON user is blocked with correct error message regardless of team', async ({ request }) => {
    const users = await getUsers(request);
    const nonUsPersonUsers = users.filter(u => u.export_status === 'NON_US_PERSON');
    expect(nonUsPersonUsers.length).toBeGreaterThan(0);

    for (const user of nonUsPersonUsers) {
      const response = await login(request, user.username, user.password);
      expect(response.success).toBe(false);
      expect(response.message).toContain("Only US Persons are allowed to watch this demo.");
    }
  });

  test('Login with incorrect password returns unsuccessful response', async ({ request }) => {
    const users = await getUsers(request);
    const anyUser = users[0];
    expect(anyUser).toBeDefined();

    const response = await login(request, anyUser.username, 'wrong_password_12345');
    expect(response.success).toBe(false);
  });

  test('Login with non-existent username returns unsuccessful response', async ({ request }) => {
    const response = await login(request, 'nonexistent_user_xyz', 'somepassword');
    expect(response.success).toBe(false);
  });
});
