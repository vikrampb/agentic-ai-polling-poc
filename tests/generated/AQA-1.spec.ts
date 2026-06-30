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

test.describe('AQA-1 – Happy Path', () => {
  test('US_PERSON user can log in successfully', async ({ request }) => {
    const users = await getUsers(request);
    const usUser = users.find(u => u.export_status === 'US_PERSON');
    expect(usUser, 'Expected at least one US_PERSON user to exist').toBeTruthy();

    const response = await login(request, usUser!.username, usUser!.password);
    expect(response.success).toBe(true);
    expect(response.message).toBe('Login successful. Welcome!');
  });

  test('US_PERSON login response contains correct exportStatus', async ({ request }) => {
    const users = await getUsers(request);
    const usUser = users.find(u => u.export_status === 'US_PERSON');
    expect(usUser, 'Expected at least one US_PERSON user to exist').toBeTruthy();

    const response = await login(request, usUser!.username, usUser!.password);
    expect(response.success).toBe(true);
    expect(response.exportStatus).toBe('US_PERSON');
  });

  test('all US_PERSON users can log in successfully', async ({ request }) => {
    const users = await getUsers(request);
    const usUsers = users.filter(u => u.export_status === 'US_PERSON');
    expect(usUsers.length, 'Expected at least one US_PERSON user').toBeGreaterThan(0);

    for (const user of usUsers) {
      const response = await login(request, user.username, user.password);
      expect(response.success).toBe(true);
      expect(response.message).toBe('Login successful. Welcome!');
    }
  });
});

test.describe('AQA-1 – Boundary Conditions', () => {
  test('login response message is exactly the expected success string for US_PERSON', async ({ request }) => {
    const users = await getUsers(request);
    const usUser = users.find(u => u.export_status === 'US_PERSON');
    expect(usUser, 'Expected at least one US_PERSON user to exist').toBeTruthy();

    const response = await login(request, usUser!.username, usUser!.password);
    expect(response.message).toBe('Login successful. Welcome!');
    expect(response.message).not.toBe('Only US Persons are allowed to watch this demo.');
  });

  test('login response message is exactly the expected block string for NON_US_PERSON', async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUser = users.find(u => u.export_status === 'NON_US_PERSON');
    expect(nonUsUser, 'Expected at least one NON_US_PERSON user to exist').toBeTruthy();

    const response = await login(request, nonUsUser!.username, nonUsUser!.password);
    expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
    expect(response.message).not.toBe('Login successful. Welcome!');
  });

  test('GET /api/users returns users with valid export_status values only', async ({ request }) => {
    const users = await getUsers(request);
    expect(users.length).toBeGreaterThan(0);

    for (const user of users) {
      expect(['US_PERSON', 'NON_US_PERSON']).toContain(user.export_status);
      expect(user.username).toBeTruthy();
      expect(user.password).toBeTruthy();
    }
  });
});

test.describe('AQA-1 – Negative Tests', () => {
  test('NON_US_PERSON user is blocked from logging in', async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUser = users.find(u => u.export_status === 'NON_US_PERSON');
    expect(nonUsUser, 'Expected at least one NON_US_PERSON user to exist').toBeTruthy();

    const response = await login(request, nonUsUser!.username, nonUsUser!.password);
    expect(response.success).toBe(false);
    expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
  });

  test('all NON_US_PERSON users are blocked from logging in', async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUsers = users.filter(u => u.export_status === 'NON_US_PERSON');
    expect(nonUsUsers.length, 'Expected at least one NON_US_PERSON user').toBeGreaterThan(0);

    for (const user of nonUsUsers) {
      const response = await login(request, user.username, user.password);
      expect(response.success).toBe(false);
      expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
    }
  });

  test('login with invalid credentials returns unsuccessful response', async ({ request }) => {
    const response = await login(request, 'invalid_user_xyz', 'wrong_password_123');
    expect(response.success).toBe(false);
    expect(response.message).not.toBe('Login successful. Welcome!');
  });
});
