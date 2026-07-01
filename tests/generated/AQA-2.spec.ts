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
    expect(response.message).toContain('Login successful');
  });

  test('DPS team user with US_PERSON status can log in successfully', async ({ request }) => {
    const users = await getUsers(request);
    const dpsUser = users.find(u => u.team_name === 'DPS' && u.export_status === 'US_PERSON');
    expect(dpsUser).toBeDefined();

    const response = await login(request, dpsUser!.username, dpsUser!.password);
    expect(response.message).toContain('Login successful');
  });

  test('all US_PERSON users regardless of team receive a successful login response', async ({ request }) => {
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
  test('user with null team_name and US_PERSON status receives login successful response', async ({ request }) => {
    const users = await getUsers(request);
    const nullTeamUser = users.find(u => u.team_name === null && u.export_status === 'US_PERSON');

    if (nullTeamUser) {
      const response = await login(request, nullTeamUser.username, nullTeamUser.password);
      expect(response.message).toContain('Login successful');
    } else {
      test.skip();
    }
  });

  test('user with null team_name and NON_US_PERSON status is blocked from logging in', async ({ request }) => {
    const users = await getUsers(request);
    const nullTeamBlockedUser = users.find(u => u.team_name === null && u.export_status === 'NON_US_PERSON');

    if (nullTeamBlockedUser) {
      const response = await login(request, nullTeamBlockedUser.username, nullTeamBlockedUser.password);
      expect(response.message).toContain('Only US Persons are allowed to watch this demo.');
    } else {
      test.skip();
    }
  });

  test('login response contains exportStatus field for US_PERSON users', async ({ request }) => {
    const users = await getUsers(request);
    const usPersonUser = users.find(u => u.export_status === 'US_PERSON');
    expect(usPersonUser).toBeDefined();

    const response = await login(request, usPersonUser!.username, usPersonUser!.password);
    expect(response.message).toContain('Login successful');
    expect(response.exportStatus).toBeDefined();
  });
});

test.describe('AQA-2 – Negative Tests', () => {
  test('NON_US_PERSON user on PBE team is blocked from logging in', async ({ request }) => {
    const users = await getUsers(request);
    const blockedPbeUser = users.find(u => u.team_name === 'PBE' && u.export_status === 'NON_US_PERSON');

    if (blockedPbeUser) {
      const response = await login(request, blockedPbeUser.username, blockedPbeUser.password);
      expect(response.message).toContain('Only US Persons are allowed to watch this demo.');
    } else {
      test.skip();
    }
  });

  test('NON_US_PERSON user on DPS team is blocked from logging in', async ({ request }) => {
    const users = await getUsers(request);
    const blockedDpsUser = users.find(u => u.team_name === 'DPS' && u.export_status === 'NON_US_PERSON');

    if (blockedDpsUser) {
      const response = await login(request, blockedDpsUser.username, blockedDpsUser.password);
      expect(response.message).toContain('Only US Persons are allowed to watch this demo.');
    } else {
      test.skip();
    }
  });

  test('all NON_US_PERSON users are blocked regardless of team assignment', async ({ request }) => {
    const users = await getUsers(request);
    const nonUsPersonUsers = users.filter(u => u.export_status === 'NON_US_PERSON');
    expect(nonUsPersonUsers.length).toBeGreaterThan(0);

    for (const user of nonUsPersonUsers) {
      const response = await login(request, user.username, user.password);
      expect(response.message).toContain('Only US Persons are allowed to watch this demo.');
    }
  });
});
