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
  test('PBE team user with US_PERSON export status can log in successfully', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const pbeUser = users.find(u => u.team_name === 'PBE' && u.export_status === 'US_PERSON');
    expect(pbeUser).toBeDefined();

    const response = await login(request, pbeUser!.username, pbeUser!.password);
    expect(response.success).toBe(true);
    expect(response.message).toBe('Login successful. Welcome!');
    expect(response.exportStatus).toBe('US_PERSON');
  });

  test('DPS team user with US_PERSON export status can log in successfully', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const dpsUser = users.find(u => u.team_name === 'DPS' && u.export_status === 'US_PERSON');
    expect(dpsUser).toBeDefined();

    const response = await login(request, dpsUser!.username, dpsUser!.password);
    expect(response.success).toBe(true);
    expect(response.message).toBe('Login successful. Welcome!');
    expect(response.exportStatus).toBe('US_PERSON');
  });

  test('All US_PERSON users across both PBE and DPS teams receive a successful login response', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const teamUsers = users.filter(u => (u.team_name === 'PBE' || u.team_name === 'DPS') && u.export_status === 'US_PERSON');
    expect(teamUsers.length).toBeGreaterThan(0);

    for (const user of teamUsers) {
      const response = await login(request, user.username, user.password);
      expect(response.success).toBe(true);
      expect(response.message).toBe('Login successful. Welcome!');
    }
  });
});

test.describe('AQA-2 – Boundary Conditions', () => {
  test('NON_US_PERSON user belonging to PBE team is blocked from logging in', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const blockedUser = users.find(u => u.team_name === 'PBE' && u.export_status === 'NON_US_PERSON');
    expect(blockedUser).toBeDefined();

    const response = await login(request, blockedUser!.username, blockedUser!.password);
    expect(response.success).toBe(false);
    expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
  });

  test('NON_US_PERSON user belonging to DPS team is blocked from logging in', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const blockedUser = users.find(u => u.team_name === 'DPS' && u.export_status === 'NON_US_PERSON');
    expect(blockedUser).toBeDefined();

    const response = await login(request, blockedUser!.username, blockedUser!.password);
    expect(response.success).toBe(false);
    expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
  });

  test('Users with no team assigned are present in the system and their export status is still valid', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const noTeamUsers = users.filter(u => u.team_name === null);
    expect(noTeamUsers.length).toBeGreaterThan(0);

    for (const user of noTeamUsers) {
      expect(['US_PERSON', 'NON_US_PERSON']).toContain(user.export_status);
    }
  });
});

test.describe('AQA-2 – Negative Tests', () => {
  test('User from PBE team cannot log in with an incorrect password', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const pbeUser = users.find(u => u.team_name === 'PBE');
    expect(pbeUser).toBeDefined();

    const response = await login(request, pbeUser!.username, 'wrongPassword123!');
    expect(response.success).toBe(false);
    expect(response.message).toBe('Invalid UserID/Password combination. Please verify.');
  });

  test('User from DPS team cannot log in with an incorrect password', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const dpsUser = users.find(u => u.team_name === 'DPS');
    expect(dpsUser).toBeDefined();

    const response = await login(request, dpsUser!.username, 'wrongPassword123!');
    expect(response.success).toBe(false);
    expect(response.message).toBe('Invalid UserID/Password combination. Please verify.');
  });

  test('Login attempt with missing credentials returns an appropriate error message', { tag: ['@regression'] }, async ({ request }) => {
    const response = await login(request, '', '');
    expect(response.success).toBe(false);
    expect(response.message).toBe('Missing credentials.');
  });
});
