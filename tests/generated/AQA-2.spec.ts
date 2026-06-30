import { test, expect, APIRequestContext } from '@playwright/test';

interface User {
  id:            number;
  name:          string;
  export_status: 'US_PERSON' | 'NON_US_PERSON';
  username:      string;
  password:      string;
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
  test('Captain America user is redirected to the correct website', async ({ page, request }) => {
    const users = await getUsers(request);
    const captainAmerica = users.find(u => u.name.includes('Captain America'));
    expect(captainAmerica).toBeDefined();

    const loginResponse = await login(request, captainAmerica!.username, captainAmerica!.password);
    expect(loginResponse.success).toBe(true);
    expect(loginResponse.message).toBe('Login successful. Welcome!');

    await page.goto(`/api/login?username=${encodeURIComponent(captainAmerica!.username)}&password=${encodeURIComponent(captainAmerica!.password)}`);
    const body = await page.locator('body').innerText();
    const parsed = JSON.parse(body);
    expect(parsed.success).toBe(true);
    expect(parsed.message).toBe('Login successful. Welcome!');
  });

  test('Iron Man user is redirected to the correct website', async ({ page, request }) => {
    const users = await getUsers(request);
    const ironMan = users.find(u => u.name.includes('Iron Man'));
    expect(ironMan).toBeDefined();

    const loginResponse = await login(request, ironMan!.username, ironMan!.password);
    expect(loginResponse.success).toBe(true);
    expect(loginResponse.message).toBe('Login successful. Welcome!');

    await page.goto(`/api/login?username=${encodeURIComponent(ironMan!.username)}&password=${encodeURIComponent(ironMan!.password)}`);
    const body = await page.locator('body').innerText();
    const parsed = JSON.parse(body);
    expect(parsed.success).toBe(true);
    expect(parsed.message).toBe('Login successful. Welcome!');
  });

  test('US_PERSON user receives a welcome message on successful login', async ({ page, request }) => {
    const users = await getUsers(request);
    const usPerson = users.find(u => u.export_status === 'US_PERSON');
    expect(usPerson).toBeDefined();

    const loginResponse = await login(request, usPerson!.username, usPerson!.password);
    expect(loginResponse.success).toBe(true);
    expect(loginResponse.message).toBe('Login successful. Welcome!');

    await page.goto(`/api/login?username=${encodeURIComponent(usPerson!.username)}&password=${encodeURIComponent(usPerson!.password)}`);
    const body = await page.locator('body').innerText();
    const parsed = JSON.parse(body);
    expect(parsed.exportStatus).toBeDefined();
  });
});

test.describe('AQA-2 – Boundary Conditions', () => {
  test('User with name that is neither Captain America nor Iron Man is redirected to the fallback website', async ({ page, request }) => {
    const users = await getUsers(request);
    const otherUser = users.find(u => !u.name.includes('Captain America') && !u.name.includes('Iron Man'));
    expect(otherUser).toBeDefined();

    const loginResponse = await login(request, otherUser!.username, otherUser!.password);

    if (otherUser!.export_status === 'US_PERSON') {
      expect(loginResponse.success).toBe(true);
      expect(loginResponse.message).toBe('Login successful. Welcome!');
    } else {
      expect(loginResponse.success).toBe(false);
      expect(loginResponse.message).toBe('Only US Persons are allowed to watch this demo.');
    }
  });

  test('NON_US_PERSON user is blocked regardless of name', async ({ request }) => {
    const users = await getUsers(request);
    const nonUsPerson = users.find(u => u.export_status === 'NON_US_PERSON');
    expect(nonUsPerson).toBeDefined();

    const loginResponse = await login(request, nonUsPerson!.username, nonUsPerson!.password);
    expect(loginResponse.success).toBe(false);
    expect(loginResponse.message).toBe('Only US Persons are allowed to watch this demo.');
  });

  test('All users returned by /api/users have required fields', async ({ request }) => {
    const users = await getUsers(request);
    expect(users.length).toBeGreaterThan(0);

    for (const user of users) {
      expect(user.id).toBeDefined();
      expect(user.name).toBeDefined();
      expect(user.username).toBeDefined();
      expect(user.password).toBeDefined();
      expect(['US_PERSON', 'NON_US_PERSON']).toContain(user.export_status);
    }
  });
});

test.describe('AQA-2 – Negative Tests', () => {
  test('Login fails with an incorrect password', async ({ request }) => {
    const users = await getUsers(request);
    const user = users[0];
    expect(user).toBeDefined();

    const loginResponse = await login(request, user.username, 'totally_wrong_password_12345');
    expect(loginResponse.success).toBe(false);
  });

  test('Login fails with an empty username and password', async ({ request }) => {
    const loginResponse = await login(request, '', '');
    expect(loginResponse.success).toBe(false);
  });

  test('NON_US_PERSON named Captain America is still blocked from accessing the demo', async ({ request }) => {
    const users = await getUsers(request);
    const blockedCaptain = users.find(u => u.name.includes('Captain America') && u.export_status === 'NON_US_PERSON');

    if (blockedCaptain) {
      const loginResponse = await login(request, blockedCaptain.username, blockedCaptain.password);
      expect(loginResponse.success).toBe(false);
      expect(loginResponse.message).toBe('Only US Persons are allowed to watch this demo.');
    } else {
      const nonUsPerson = users.find(u => u.export_status === 'NON_US_PERSON');
      expect(nonUsPerson).toBeDefined();
      const loginResponse = await login(request, nonUsPerson!.username, nonUsPerson!.password);
      expect(loginResponse.success).toBe(false);
      expect(loginResponse.message).toBe('Only US Persons are allowed to watch this demo.');
    }
  });
});
