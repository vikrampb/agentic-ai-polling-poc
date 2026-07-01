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
    expect(response.message).toContain("Login successful");
  });

  test('DPS team US_PERSON user can log in successfully', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const dpsUser = users.find(u => u.team_name === 'DPS' && u.export_status === 'US_PERSON');
    expect(dpsUser).toBeDefined();
    const response = await login(request, dpsUser!.username, dpsUser!.password);
    expect(response.success).toBe(true);
    expect(response.message).toContain("Login successful");
  });

  test('US_PERSON user login response contains exportStatus field', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const usPersonUser = users.find(u => u.export_status === 'US_PERSON');
    expect(usPersonUser).toBeDefined();
    const response = await login(request, usPersonUser!.username, usPersonUser!.password);
    expect(response.success).toBe(true);
    expect(response.exportStatus).toBeDefined();
  });
});

test.describe('AQA-2 – Boundary Conditions', () => {
  test('user with null team but US_PERSON export status login response is handled', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const nullTeamUser = users.find(u => u.team_name === null && u.export_status === 'US_PERSON');
    if (!nullTeamUser) {
      test.skip();
      return;
    }
    const response = await login(request, nullTeamUser.username, nullTeamUser.password);
    expect(typeof response.success).toBe('boolean');
    expect(typeof response.message).toBe('string');
  });

  test('all US_PERSON users across teams receive login successful message', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const usPersonUsers = users.filter(u => u.export_status === 'US_PERSON');
    expect(usPersonUsers.length).toBeGreaterThan(0);
    for (const user of usPersonUsers) {
      const response = await login(request, user.username, user.password);
      expect(response.message).toContain("Login successful");
    }
  });

  test('both PBE and DPS teams have at least one US_PERSON user available', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const pbeUsers = users.filter(u => u.team_name === 'PBE' && u.export_status === 'US_PERSON');
    const dpsUsers = users.filter(u => u.team_name === 'DPS' && u.export_status === 'US_PERSON');
    expect(pbeUsers.length).toBeGreaterThan(0);
    expect(dpsUsers.length).toBeGreaterThan(0);
  });
});

test.describe('AQA-2 – Negative Tests', () => {
  test('NON_US_PERSON user is blocked from logging in regardless of team', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const nonUsPersonUser = users.find(u => u.export_status === 'NON_US_PERSON');
    expect(nonUsPersonUser).toBeDefined();
    const response = await login(request, nonUsPersonUser!.username, nonUsPersonUser!.password);
    expect(response.success).toBe(false);
    expect(response.message).toContain("Only US Persons are allowed to watch this demo.");
  });

  test('PBE team NON_US_PERSON user is blocked from logging in', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const pbeNonUsUser = users.find(u => u.team_name === 'PBE' && u.export_status === 'NON_US_PERSON');
    if (!pbeNonUsUser) {
      test.skip();
      return;
    }
    const response = await login(request, pbeNonUsUser.username, pbeNonUsUser.password);
    expect(response.success).toBe(false);
    expect(response.message).toContain("Only US Persons are allowed to watch this demo.");
  });

  test('DPS team NON_US_PERSON user is blocked from logging in', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const dpsNonUsUser = users.find(u => u.team_name === 'DPS' && u.export_status === 'NON_US_PERSON');
    if (!dpsNonUsUser) {
      test.skip();
      return;
    }
    const response = await login(request, dpsNonUsUser.username, dpsNonUsUser.password);
    expect(response.success).toBe(false);
    expect(response.message).toContain("Only US Persons are allowed to watch this demo.");
  });
});
