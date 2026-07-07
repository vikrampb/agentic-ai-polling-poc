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
    expect(response.success).toBe(true);
    expect(response.message).toBe('Login successful. Welcome!');
    expect(response.exportStatus).toBe('US_PERSON');
  });

  test('DPS team user with US_PERSON status can log in successfully', async ({ request }) => {
    const users = await getUsers(request);
    const dpsUser = users.find(u => u.team_name === 'DPS' && u.export_status === 'US_PERSON');
    expect(dpsUser).toBeDefined();

    const response = await login(request, dpsUser!.username, dpsUser!.password);
    expect(response.success).toBe(true);
    expect(response.message).toBe('Login successful. Welcome!');
    expect(response.exportStatus).toBe('US_PERSON');
  });

  test('Each US_PERSON user belonging to a known team receives a successful login response', async ({ request }) => {
    const users = await getUsers(request);
    const eligibleUsers = users.filter(u => u.export_status === 'US_PERSON' && (u.team_name === 'PBE' || u.team_name === 'DPS'));
    expect(eligibleUsers.length).toBeGreaterThan(0);

    for (const user of eligibleUsers) {
      const response = await login(request, user.username, user.password);
      expect(response.success).toBe(true);
      expect(response.message).toBe('Login successful. Welcome!');
    }
  });
});

test.describe('AQA-2 – Boundary Conditions', () => {
  test('NON_US_PERSON user is blocked from logging in regardless of team', async ({ request }) => {
    const users = await getUsers(request);
    const blockedUser = users.find(u => u.export_status === 'NON_US_PERSON');
    expect(blockedUser).toBeDefined();

    const response = await login(request, blockedUser!.username, blockedUser!.password);
    expect(response.success).toBe(false);
    expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
  });

  test('All NON_US_PERSON users across all teams are blocked from logging in', async ({ request }) => {
    const users = await getUsers(request);
    const blockedUsers = users.filter(u => u.export_status === 'NON_US_PERSON');
    expect(blockedUsers.length).toBeGreaterThan(0);

    for (const user of blockedUsers) {
      const response = await login(request, user.username, user.password);
      expect(response.success).toBe(false);
      expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
    }
  });

  test('Login attempt with empty username and empty password returns missing credentials message', async ({ request }) => {
    const response = await login(request, '', '');
    expect(response.success).toBe(false);
    expect(response.message).toBe('Missing credentials.');
  });
});

test.describe('AQA-2 – Negative Tests', () => {
  test('Valid user submitting a wrong password receives an invalid credentials error', async ({ request }) => {
    const users = await getUsers(request);
    const user = users.find(u => u.export_status === 'US_PERSON');
    expect(user).toBeDefined();

    const response = await login(request, user!.username, 'wrongPassword123!');
    expect(response.success).toBe(false);
    expect(response.message).toBe('Invalid UserID/Password combination. Please verify.');
  });

  test('Non-existent username with any password returns an invalid credentials error', async ({ request }) => {
    const response = await login(request, 'nonexistent_user_xyz', 'wrongPassword123!');
    expect(response.success).toBe(false);
    expect(response.message).toBe('Invalid UserID/Password combination. Please verify.');
  });

  test('Valid password submitted with an empty username returns missing credentials message', async ({ request }) => {
    const users = await getUsers(request);
    const user = users.find(u => u.export_status === 'US_PERSON');
    expect(user).toBeDefined();

    const response = await login(request, '', user!.password);
    expect(response.success).toBe(false);
    expect(response.message).toBe('Missing credentials.');
  });
});
