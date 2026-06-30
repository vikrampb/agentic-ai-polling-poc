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
  test('PBE team user is redirected to PBE Application Home page after login', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const pbeUser = users.find(u => u.team_name === 'PBE');
    expect(pbeUser).toBeDefined();

    const response = await login(request, pbeUser!.username, pbeUser!.password);
    expect(response.message).toBe(US_PERSON);
    expect(response.redirect_url ?? response.home_page ?? response.team).toContain('PBE');
  });

  test('DPS team user is redirected to DPS Application Home page after login', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const dpsUser = users.find(u => u.team_name === 'DPS');
    expect(dpsUser).toBeDefined();

    const response = await login(request, dpsUser!.username, dpsUser!.password);
    expect(response.message).toBe(US_PERSON);
    expect(response.redirect_url ?? response.home_page ?? response.team).toContain('DPS');
  });

  test('each valid team user sees a home page specific to their team', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const teamUsers = users.filter(u => u.team_name === 'PBE' || u.team_name === 'DPS');
    expect(teamUsers.length).toBeGreaterThan(0);

    for (const user of teamUsers) {
      const response = await login(request, user.username, user.password);
      expect(response.message).toBe(US_PERSON);
      const destination = response.redirect_url ?? response.home_page ?? response.team ?? '';
      expect(destination).toContain(user.team_name);
    }
  });
});

test.describe('AQA-2 – Boundary Conditions', () => {
  test('user belonging to PBE team does not get redirected to DPS home page', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const pbeUser = users.find(u => u.team_name === 'PBE');
    expect(pbeUser).toBeDefined();

    const response = await login(request, pbeUser!.username, pbeUser!.password);
    expect(response.message).toBe(US_PERSON);
    const destination = response.redirect_url ?? response.home_page ?? response.team ?? '';
    expect(destination).not.toContain('DPS');
  });

  test('user belonging to DPS team does not get redirected to PBE home page', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const dpsUser = users.find(u => u.team_name === 'DPS');
    expect(dpsUser).toBeDefined();

    const response = await login(request, dpsUser!.username, dpsUser!.password);
    expect(response.message).toBe(US_PERSON);
    const destination = response.redirect_url ?? response.home_page ?? response.team ?? '';
    expect(destination).not.toContain('PBE');
  });

  test('all users have a team_name assigned and receive team-specific home page on login', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const usersWithTeam = users.filter(u => u.team_name && u.team_name.trim() !== '');
    expect(usersWithTeam.length).toBeGreaterThan(0);

    for (const user of usersWithTeam) {
      const response = await login(request, user.username, user.password);
      if (response.message === US_PERSON) {
        const destination = response.redirect_url ?? response.home_page ?? response.team ?? '';
        expect(destination).toContain(user.team_name);
      }
    }
  });
});

test.describe('AQA-2 – Negative Tests', () => {
  test('non-US person user cannot access team-specific home page and receives rejection message', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUser = users.find(u =>
      u.export_status !== undefined && u.export_status !== null && String(u.export_status).toUpperCase() !== 'US'
    );
    expect(nonUsUser).toBeDefined();

    const response = await login(request, nonUsUser!.username, nonUsUser!.password);
    expect(response.message).toBe(NON_US_PERSON);
    const destination = response.redirect_url ?? response.home_page ?? null;
    expect(destination).toBeFalsy();
  });

  test('login with invalid credentials does not grant access to any team home page', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const anyUser = users[0];
    expect(anyUser).toBeDefined();

    const response = await login(request, anyUser.username, 'InvalidPassword!999');
    expect(response.message).not.toBe(US_PERSON);
    const destination = response.redirect_url ?? response.home_page ?? null;
    expect(destination).toBeFalsy();
  });

  test('user with no team assignment does not receive a team-specific home page', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const noTeamUser = users.find(u => !u.team_name || u.team_name.trim() === '');

    if (!noTeamUser) {
      test.skip();
      return;
    }

    const response = await login(request, noTeamUser.username, noTeamUser.password);
    if (response.message === US_PERSON) {
      const destination = response.redirect_url ?? response.home_page ?? '';
      expect(destination === '' || (!destination.includes('PBE') && !destination.includes('DPS'))).toBeTruthy();
    } else {
      expect(response.message).not.toBe(US_PERSON);
    }
  });
});
