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

  test('US_PERSON user login returns exportStatus indicating US_PERSON access', async ({ request }) => {
    const users = await getUsers(request);
    const usPersonUser = users.find(u => u.export_status === 'US_PERSON' && u.team_name !== null);
    expect(usPersonUser).toBeDefined();

    const response = await login(request, usPersonUser!.username, usPersonUser!.password);
    expect(response.success).toBe(true);
    expect(response.message).toContain("Login successful");
    expect(response.exportStatus).toBeDefined();
  });
});

test.describe('AQA-2 – Boundary Conditions', () => {
  test('user with null team_name but US_PERSON status can still log in', async ({ request }) => {
    const users = await getUsers(request);
    const nullTeamUser = users.find(u => u.team_name === null && u.export_status === 'US_PERSON');

    if (!nullTeamUser) {
      test.skip();
      return;
    }

    const response = await login(request, nullTeamUser.username, nullTeamUser.password);
    expect(response.success).toBe(true);
    expect(response.message).toContain("Login successful");
  });

  test('NON_US_PERSON user belonging to PBE team is blocked from login', async ({ request }) => {
    const users = await getUsers(request);
    const nonUsPersonPbe = users.find(u => u.team_name === 'PBE' && u.export_status === 'NON_US_PERSON');

    if (!nonUsPersonPbe) {
      test.skip();
      return;
    }

    const response = await login(request, nonUsPersonPbe.username, nonUsPersonPbe.password);
    expect(response.success).toBe(false);
    expect(response.message).toContain("Only US Persons are allowed to watch this demo.");
  });

  test('NON_US_PERSON user belonging to DPS team is blocked from login', async ({ request }) => {
    const users = await getUsers(request);
    const nonUsPersonDps = users.find(u => u.team_name === 'DPS' && u.export_status === 'NON_US_PERSON');

    if (!nonUsPersonDps) {
      test.skip();
      return;
    }

    const response = await login(request, nonUsPersonDps.username, nonUsPersonDps.password);
    expect(response.success).toBe(false);
    expect(response.message).toContain("Only US Persons are allowed to watch this demo.");
  });
});

test.describe('AQA-2 – Negative Tests', () => {
  test('login with incorrect password returns failure', async ({ request }) => {
    const users = await getUsers(request);
    const anyUser = users.find(u => u.export_status === 'US_PERSON');
    expect(anyUser).toBeDefined();

    const response = await login(request, anyUser!.username, 'wrongpassword_12345');
    expect(response.success).toBe(false);
  });

  test('login with non-existent username returns failure', async ({ request }) => {
    const response = await login(request, 'nonexistent_user_xyz', 'somepassword');
    expect(response.success).toBe(false);
  });

  test('all NON_US_PERSON users are blocked regardless of team', async ({ request }) => {
    const users = await getUsers(request);
    const nonUsPersonUsers = users.filter(u => u.export_status === 'NON_US_PERSON');

    if (nonUsPersonUsers.length === 0) {
      test.skip();
      return;
    }

    for (const user of nonUsPersonUsers) {
      const response = await login(request, user.username, user.password);
      expect(response.success).toBe(false);
      expect(response.message).toContain("Only US Persons are allowed to watch this demo.");
    }
  });
});
