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
    expect(response.success).toBe(true);
    expect(response.message).toContain('Login successful');
  });

  test('DPS team user with US_PERSON status can login successfully', async ({ request }) => {
    const users = await getUsers(request);
    const dpsUser = users.find(u => u.team_name === 'DPS' && u.export_status === 'US_PERSON');
    expect(dpsUser).toBeDefined();

    const response = await login(request, dpsUser!.username, dpsUser!.password);
    expect(response.success).toBe(true);
    expect(response.message).toContain('Login successful');
  });

  test('all US_PERSON users regardless of team receive login successful message', async ({ request }) => {
    const users = await getUsers(request);
    const usPersonUsers = users.filter(u => u.export_status === 'US_PERSON');
    expect(usPersonUsers.length).toBeGreaterThan(0);

    for (const user of usPersonUsers) {
      const response = await login(request, user.username, user.password);
      expect(response.success).toBe(true);
      expect(response.message).toContain('Login successful');
    }
  });
});

test.describe('AQA-2 – Boundary Conditions', () => {
  test('user with null team_name and US_PERSON status receives login successful message', async ({ request }) => {
    const users = await getUsers(request);
    const nullTeamUser = users.find(u => u.team_name === null && u.export_status === 'US_PERSON');

    if (nullTeamUser) {
      const response = await login(request, nullTeamUser.username, nullTeamUser.password);
      expect(response.success).toBe(true);
      expect(response.message).toContain('Login successful');
    } else {
      test.skip();
    }
  });

  test('user with null team_name and NON_US_PERSON status is blocked', async ({ request }) => {
    const users = await getUsers(request);
    const nullTeamNonUsUser = users.find(u => u.team_name === null && u.export_status === 'NON_US_PERSON');

    if (nullTeamNonUsUser) {
      const response = await login(request, nullTeamNonUsUser.username, nullTeamNonUsUser.password);
      expect(response.success).toBe(false);
      expect(response.message).toContain('Only US Persons are allowed to watch this demo.');
    } else {
      test.skip();
    }
  });

  test('each team has at least one US_PERSON user available for login', async ({ request }) => {
    const users = await getUsers(request);
    const teams = ['PBE', 'DPS'];

    for (const team of teams) {
      const teamUsPersonUser = users.find(u => u.team_name === team && u.export_status === 'US_PERSON');
      expect(teamUsPersonUser, `Expected at least one US_PERSON user in team ${team}`).toBeDefined();
    }
  });
});

test.describe('AQA-2 – Negative Tests', () => {
  test('NON_US_PERSON user in PBE team is blocked from login', async ({ request }) => {
    const users = await getUsers(request);
    const pbeNonUsUser = users.find(u => u.team_name === 'PBE' && u.export_status === 'NON_US_PERSON');

    if (pbeNonUsUser) {
      const response = await login(request, pbeNonUsUser.username, pbeNonUsUser.password);
      expect(response.success).toBe(false);
      expect(response.message).toContain('Only US Persons are allowed to watch this demo.');
    } else {
      test.skip();
    }
  });

  test('NON_US_PERSON user in DPS team is blocked from login', async ({ request }) => {
    const users = await getUsers(request);
    const dpsNonUsUser = users.find(u => u.team_name === 'DPS' && u.export_status === 'NON_US_PERSON');

    if (dpsNonUsUser) {
      const response = await login(request, dpsNonUsUser.username, dpsNonUsUser.password);
      expect(response.success).toBe(false);
      expect(response.message).toContain('Only US Persons are allowed to watch this demo.');
    } else {
      test.skip();
    }
  });

  test('all NON_US_PERSON users are blocked regardless of team', async ({ request }) => {
    const users = await getUsers(request);
    const nonUsPersonUsers = users.filter(u => u.export_status === 'NON_US_PERSON');
    expect(nonUsPersonUsers.length).toBeGreaterThan(0);

    for (const user of nonUsPersonUsers) {
      const response = await login(request, user.username, user.password);
      expect(response.success).toBe(false);
      expect(response.message).toContain('Only US Persons are allowed to watch this demo.');
    }
  });
});
