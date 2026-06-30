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
    expect(usUser, 'Expected at least one US_PERSON user').toBeDefined();

    const response = await login(request, usUser!.username, usUser!.password);
    expect(response.success).toBe(true);
    expect(response.message).toBe('Login successful. Welcome!');
  });

  test('All US_PERSON users receive success message on login', async ({ request }) => {
    const users = await getUsers(request);
    const usUsers = users.filter(u => u.export_status === 'US_PERSON');
    expect(usUsers.length, 'Expected at least one US_PERSON user').toBeGreaterThan(0);

    for (const user of usUsers) {
      const response = await login(request, user.username, user.password);
      expect(response.success).toBe(true);
      expect(response.message).toBe('Login successful. Welcome!');
    }
  });

  test('Login response for US_PERSON contains correct exportStatus field', async ({ request }) => {
    const users = await getUsers(request);
    const usUser = users.find(u => u.export_status === 'US_PERSON');
    expect(usUser, 'Expected at least one US_PERSON user').toBeDefined();

    const response = await login(request, usUser!.username, usUser!.password);
    expect(response.success).toBe(true);
    expect(response.exportStatus).toBe('US_PERSON');
  });
});

test.describe('AQA-1 – Boundary Conditions', () => {
  test('User list contains both US_PERSON and NON_US_PERSON users', async ({ request }) => {
    const users = await getUsers(request);
    const usUsers = users.filter(u => u.export_status === 'US_PERSON');
    const nonUsUsers = users.filter(u => u.export_status === 'NON_US_PERSON');

    expect(usUsers.length).toBeGreaterThan(0);
    expect(nonUsUsers.length).toBeGreaterThan(0);
  });

  test('Login with correct username but wrong password returns failure', async ({ request }) => {
    const users = await getUsers(request);
    const usUser = users.find(u => u.export_status === 'US_PERSON');
    expect(usUser, 'Expected at least one US_PERSON user').toBeDefined();

    const response = await login(request, usUser!.username, 'wrongpassword_xyz_123');
    expect(response.success).toBe(false);
  });

  test('Login with empty username and empty password returns failure', async ({ request }) => {
    const response = await login(request, '', '');
    expect(response.success).toBe(false);
  });
});

test.describe('AQA-1 – Negative Tests', () => {
  test('NON_US_PERSON user is blocked from logging in', async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUser = users.find(u => u.export_status === 'NON_US_PERSON');
    expect(nonUsUser, 'Expected at least one NON_US_PERSON user').toBeDefined();

    const response = await login(request, nonUsUser!.username, nonUsUser!.password);
    expect(response.success).toBe(false);
    expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
  });

  test('All NON_US_PERSON users are blocked with correct error message', async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUsers = users.filter(u => u.export_status === 'NON_US_PERSON');
    expect(nonUsUsers.length, 'Expected at least one NON_US_PERSON user').toBeGreaterThan(0);

    for (const user of nonUsUsers) {
      const response = await login(request, user.username, user.password);
      expect(response.success).toBe(false);
      expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
    }
  });

  test('Login with a completely unknown username returns failure', async ({ request }) => {
    const response = await login(request, 'nonexistent_user_00000', 'somepassword');
    expect(response.success).toBe(false);
  });
});
