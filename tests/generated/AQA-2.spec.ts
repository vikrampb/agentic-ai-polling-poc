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

  test('Each team has at least one active US_PERSON user available for login', async ({ request }) => {
    const users = await getUsers(request);
    const pbeUsers = users.filter(u => u.team_name === 'PBE' && u.export_status === 'US_PERSON');
    const dpsUsers = users.filter(u => u.team_name === 'DPS' && u.export_status === 'US_PERSON');

    expect(pbeUsers.length).toBeGreaterThan(0);
    expect(dpsUsers.length).toBeGreaterThan(0);
  });
});

test.describe('AQA-2 – Boundary Conditions', () => {
  test('NON_US_PERSON user is blocked regardless of team membership', async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUser = users.find(u => u.export_status === 'NON_US_PERSON');
    expect(nonUsUser).toBeDefined();

    const response = await login(request, nonUsUser!.username, nonUsUser!.password);
    expect(response.success).toBe(false);
    expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
  });

  test('Login attempt with missing username and password is rejected', async ({ request }) => {
    const response = await login(request, '', '');
    expect(response.success).toBe(false);
    expect(response.message).toBe('Missing credentials.');
  });

  test('Login attempt with missing password only is rejected', async ({ request }) => {
    const users = await getUsers(request);
    const anyUser = users.find(u => u.export_status === 'US_PERSON');
    expect(anyUser).toBeDefined();

    const response = await login(request, anyUser!.username, '');
    expect(response.success).toBe(false);
    expect(response.message).toBe('Missing credentials.');
  });
});

test.describe('AQA-2 – Negative Tests', () => {
  test('Valid user with incorrect password cannot log in', async ({ request }) => {
    const users = await getUsers(request);
    const anyUser = users.find(u => u.export_status === 'US_PERSON');
    expect(anyUser).toBeDefined();

    const response = await login(request, anyUser!.username, 'wrongPassword123!');
    expect(response.success).toBe(false);
    expect(response.message).toBe('Invalid UserID/Password combination. Please verify.');
  });

  test('Non-existent username with wrong password is rejected', async ({ request }) => {
    const response = await login(request, 'nonexistent_user_xyz', 'wrongPassword123!');
    expect(response.success).toBe(false);
    expect(response.message).toBe('Invalid UserID/Password combination. Please verify.');
  });

  test('NON_US_PERSON user from DPS team cannot access the application', async ({ request }) => {
    const users = await getUsers(request);
    const blockedDpsUser = users.find(u => u.team_name === 'DPS' && u.export_status === 'NON_US_PERSON');

    if (blockedDpsUser) {
      const response = await login(request, blockedDpsUser.username, blockedDpsUser.password);
      expect(response.success).toBe(false);
      expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
    } else {
      const blockedAnyUser = users.find(u => u.export_status === 'NON_US_PERSON');
      expect(blockedAnyUser).toBeDefined();
      const response = await login(request, blockedAnyUser!.username, blockedAnyUser!.password);
      expect(response.success).toBe(false);
      expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
    }
  });
});
