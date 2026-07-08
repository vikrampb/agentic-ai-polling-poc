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
  test('PBE team user who is a US Person can log in successfully', async ({ request }) => {
    const users = await getUsers(request);
    const pbeUser = users.find(u => u.team_name === 'PBE' && u.export_status === 'US_PERSON');
    expect(pbeUser).toBeDefined();

    const response = await login(request, pbeUser!.username, pbeUser!.password);
    expect(response.success).toBe(true);
    expect(response.message).toBe('Login successful. Welcome!');
    expect(response.exportStatus).toBe('US_PERSON');
  });

  test('DPS team user who is a US Person can log in successfully', async ({ request }) => {
    const users = await getUsers(request);
    const dpsUser = users.find(u => u.team_name === 'DPS' && u.export_status === 'US_PERSON');
    expect(dpsUser).toBeDefined();

    const response = await login(request, dpsUser!.username, dpsUser!.password);
    expect(response.success).toBe(true);
    expect(response.message).toBe('Login successful. Welcome!');
    expect(response.exportStatus).toBe('US_PERSON');
  });

  test('Each team has at least one US Person user available for login', async ({ request }) => {
    const users = await getUsers(request);
    const pbeUsUser = users.find(u => u.team_name === 'PBE' && u.export_status === 'US_PERSON');
    const dpsUsUser = users.find(u => u.team_name === 'DPS' && u.export_status === 'US_PERSON');

    expect(pbeUsUser).toBeDefined();
    expect(dpsUsUser).toBeDefined();
    expect(pbeUsUser!.team_name).toBe('PBE');
    expect(dpsUsUser!.team_name).toBe('DPS');
  });
});

test.describe('AQA-2 – Boundary Conditions', () => {
  test('Non-US Person user belonging to PBE team is blocked from logging in', async ({ request }) => {
    const users = await getUsers(request);
    const pbeNonUsUser = users.find(u => u.team_name === 'PBE' && u.export_status === 'NON_US_PERSON');
    expect(pbeNonUsUser).toBeDefined();

    const response = await login(request, pbeNonUsUser!.username, pbeNonUsUser!.password);
    expect(response.success).toBe(false);
    expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
  });

  test('Non-US Person user belonging to DPS team is blocked from logging in', async ({ request }) => {
    const users = await getUsers(request);
    const dpsNonUsUser = users.find(u => u.team_name === 'DPS' && u.export_status === 'NON_US_PERSON');
    expect(dpsNonUsUser).toBeDefined();

    const response = await login(request, dpsNonUsUser!.username, dpsNonUsUser!.password);
    expect(response.success).toBe(false);
    expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
  });

  test('All users in the system belong to either PBE or DPS team', async ({ request }) => {
    const users = await getUsers(request);
    expect(users.length).toBeGreaterThan(0);

    for (const user of users) {
      expect(['PBE', 'DPS']).toContain(user.team_name);
    }
  });
});

test.describe('AQA-2 – Negative Tests', () => {
  test('User cannot log in with an incorrect password', async ({ request }) => {
    const users = await getUsers(request);
    const anyUser = users.find(u => u.export_status === 'US_PERSON');
    expect(anyUser).toBeDefined();

    const response = await login(request, anyUser!.username, 'wrongPassword123!');
    expect(response.success).toBe(false);
    expect(response.message).toBe('Invalid UserID/Password combination. Please verify.');
  });

  test('User cannot log in when both username and password are missing', async ({ request }) => {
    const response = await login(request, '', '');
    expect(response.success).toBe(false);
    expect(response.message).toBe('Missing credentials.');
  });

  test('User cannot log in when only the username is provided and password is missing', async ({ request }) => {
    const users = await getUsers(request);
    const anyUser = users.find(u => u.export_status === 'US_PERSON');
    expect(anyUser).toBeDefined();

    const response = await login(request, anyUser!.username, '');
    expect(response.success).toBe(false);
    expect(response.message).toBe('Missing credentials.');
  });
});
