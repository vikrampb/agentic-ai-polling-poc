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
  test('PBE team US_PERSON user can log in successfully', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const pbeUser = users.find(u => u.team_name === 'PBE' && u.export_status === 'US_PERSON');
    expect(pbeUser).toBeDefined();
    const response = await login(request, pbeUser!.username, pbeUser!.password);
    expect(response.success).toBe(true);
    expect(response.message).toContain('Login successful');
  });

  test('DPS team US_PERSON user can log in successfully', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const dpsUser = users.find(u => u.team_name === 'DPS' && u.export_status === 'US_PERSON');
    expect(dpsUser).toBeDefined();
    const response = await login(request, dpsUser!.username, dpsUser!.password);
    expect(response.success).toBe(true);
    expect(response.message).toContain('Login successful');
  });

  test('login response contains exportStatus for US_PERSON user', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const usUser = users.find(u => u.export_status === 'US_PERSON');
    expect(usUser).toBeDefined();
    const response = await login(request, usUser!.username, usUser!.password);
    expect(response.success).toBe(true);
    expect(response.exportStatus).toBeDefined();
    expect(response.message).toContain('Login successful');
  });
});

test.describe('AQA-2 – Boundary Conditions', () => {
  test('user with null team_name and US_PERSON status receives login successful message', { tag: ['@regression'] }, async ({ request }) => {
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

  test('NON_US_PERSON user from PBE team is blocked regardless of team membership', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const pbeNonUs = users.find(u => u.team_name === 'PBE' && u.export_status === 'NON_US_PERSON');
    if (!pbeNonUs) {
      test.skip();
      return;
    }
    const response = await login(request, pbeNonUs.username, pbeNonUs.password);
    expect(response.success).toBe(false);
    expect(response.message).toContain('Only US Persons are allowed to watch this demo.');
  });

  test('NON_US_PERSON user from DPS team is blocked regardless of team membership', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const dpsNonUs = users.find(u => u.team_name === 'DPS' && u.export_status === 'NON_US_PERSON');
    if (!dpsNonUs) {
      test.skip();
      return;
    }
    const response = await login(request, dpsNonUs.username, dpsNonUs.password);
    expect(response.success).toBe(false);
    expect(response.message).toContain('Only US Persons are allowed to watch this demo.');
  });
});

test.describe('AQA-2 – Negative Tests', () => {
  test('NON_US_PERSON user cannot log in and sees export restriction message', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUser = users.find(u => u.export_status === 'NON_US_PERSON');
    expect(nonUsUser).toBeDefined();
    const response = await login(request, nonUsUser!.username, nonUsUser!.password);
    expect(response.success).toBe(false);
    expect(response.message).toContain('Only US Persons are allowed to watch this demo.');
  });

  test('login with invalid password returns unsuccessful response', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const anyUser = users.find(u => u.export_status === 'US_PERSON');
    expect(anyUser).toBeDefined();
    const response = await login(request, anyUser!.username, 'invalid_wrong_password_xyz');
    expect(response.success).toBe(false);
  });

  test('login with invalid username returns unsuccessful response', { tag: ['@regression'] }, async ({ request }) => {
    const response = await login(request, 'nonexistent_user_xyz_123', 'somepassword');
    expect(response.success).toBe(false);
  });
});
