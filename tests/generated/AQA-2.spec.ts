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
    expect(pbeUser).toBeDefined();

    const response = await login(request, pbeUser!.username, pbeUser!.password);
    expect(response.message).toContain('Login successful');
  });

  test('DPS team user with US_PERSON status can login successfully', async ({ request }) => {
    const users = await getUsers(request);
    const dpsUser = users.find(u => u.team_name === 'DPS' && u.export_status === 'US_PERSON');
    expect(dpsUser).toBeDefined();

    const response = await login(request, dpsUser!.username, dpsUser!.password);
    expect(response.message).toContain('Login successful');
  });

  test('all US_PERSON users regardless of team receive login success message', async ({ request }) => {
    const users = await getUsers(request);
    const usPersonUsers = users.filter(u => u.export_status === 'US_PERSON');
    expect(usPersonUsers.length).toBeGreaterThan(0);

    for (const user of usPersonUsers) {
      const response = await login(request, user.username, user.password);
      expect(response.message).toContain('Login successful');
    }
  });
});

test.describe('AQA-2 – Boundary Conditions', () => {
  test('user with null team_name and US_PERSON status receives login success message', async ({ request }) => {
    const users = await getUsers(request);
    const nullTeamUser = users.find(u => u.team_name === null && u.export_status === 'US_PERSON');

    if (nullTeamUser) {
      const response = await login(request, nullTeamUser.username, nullTeamUser.password);
      expect(response.message).toContain('Login successful');
    } else {
      test.skip();
    }
  });

  test('NON_US_PERSON user with PBE team is blocked from login', async ({ request }) => {
    const users = await getUsers(request);
    const nonUsPersonPbe = users.find(u => u.team_name === 'PBE' && u.export_status === 'NON_US_PERSON');

    if (nonUsPersonPbe) {
      const response = await login(request, nonUsPersonPbe.username, nonUsPersonPbe.password);
      expect(response.message).toContain('Only US Persons are allowed to watch this demo.');
    } else {
      test.skip();
    }
  });

  test('NON_US_PERSON user with DPS team is blocked from login', async ({ request }) => {
    const users = await getUsers(request);
    const nonUsPersonDps = users.find(u => u.team_name === 'DPS' && u.export_status === 'NON_US_PERSON');

    if (nonUsPersonDps) {
      const response = await login(request, nonUsPersonDps.username, nonUsPersonDps.password);
      expect(response.message).toContain('Only US Persons are allowed to watch this demo.');
    } else {
      test.skip();
    }
  });
});

test.describe('AQA-2 – Negative Tests', () => {
  test('NON_US_PERSON user cannot login and receives restriction message', async ({ request }) => {
    const users = await getUsers(request);
    const nonUsPersonUser = users.find(u => u.export_status === 'NON_US_PERSON');
    expect(nonUsPersonUser).toBeDefined();

    const response = await login(request, nonUsPersonUser!.username, nonUsPersonUser!.password);
    expect(response.message).toContain('Only US Persons are allowed to watch this demo.');
  });

  test('all NON_US_PERSON users are blocked regardless of team', async ({ request }) => {
    const users = await getUsers(request);
    const nonUsPersonUsers = users.filter(u => u.export_status === 'NON_US_PERSON');
    expect(nonUsPersonUsers.length).toBeGreaterThan(0);

    for (const user of nonUsPersonUsers) {
      const response = await login(request, user.username, user.password);
      expect(response.message).toContain('Only US Persons are allowed to watch this demo.');
    }
  });

  test('login with wrong password returns unsuccessful response', async ({ request }) => {
    const users = await getUsers(request);
    const anyUser = users.find(u => u.export_status === 'US_PERSON');
    expect(anyUser).toBeDefined();

    const response = await login(request, anyUser!.username, 'wrongpassword123!');
    expect(response.success).toBe(false);
    expect(response.message).not.toContain('Login successful');
  });
});
