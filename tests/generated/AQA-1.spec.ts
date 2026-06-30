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

  test('All US_PERSON users can log in successfully', async ({ request }) => {
    const users = await getUsers(request);
    const usUsers = users.filter(u => u.export_status === 'US_PERSON');
    expect(usUsers.length, 'Expected at least one US_PERSON user').toBeGreaterThan(0);

    for (const user of usUsers) {
      const response = await login(request, user.username, user.password);
      expect(response.success).toBe(true);
      expect(response.message).toBe('Login successful. Welcome!');
    }
  });

  test('Login response for US_PERSON contains correct exportStatus', async ({ request }) => {
    const users = await getUsers(request);
    const usUser = users.find(u => u.export_status === 'US_PERSON');
    expect(usUser, 'Expected at least one US_PERSON user to exist').toBeTruthy();

    const response = await login(request, usUser!.username, usUser!.password);
    expect(response.success).toBe(true);
    expect(response.exportStatus).toBe('US_PERSON');
  });
});

test.describe('AQA-1 – Boundary Conditions', () => {
  test('Exactly one NON_US_PERSON user is blocked with correct message', async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUser = users.find(u => u.export_status === 'NON_US_PERSON');
    expect(nonUsUser, 'Expected at least one NON_US_PERSON user to exist').toBeTruthy();

    const response = await login(request, nonUsUser!.username, nonUsUser!.password);
    expect(response.success).toBe(false);
    expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
  });

  test('Every user in the system has a recognized export_status', async ({ request }) => {
    const users = await getUsers(request);
    expect(users.length, 'Expected users array to be non-empty').toBeGreaterThan(0);

    for (const user of users) {
      expect(
        ['US_PERSON', 'NON_US_PERSON'].includes(user.export_status),
        `User ${user.username} has unrecognized export_status: ${user.export_status}`
      ).toBe(true);
    }
  });

  test('API returns users list with required fields for each user', async ({ request }) => {
    const users = await getUsers(request);
    expect(users.length).toBeGreaterThan(0);

    for (const user of users) {
      expect(user.id).toBeDefined();
      expect(user.name).toBeDefined();
      expect(user.username).toBeDefined();
      expect(user.password).toBeDefined();
      expect(user.export_status).toBeDefined();
    }
  });
});

test.describe('AQA-1 – Negative Tests', () => {
  test('NON_US_PERSON user is denied access with correct error message', async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUsers = users.filter(u => u.export_status === 'NON_US_PERSON');
    expect(nonUsUsers.length, 'Expected at least one NON_US_PERSON user').toBeGreaterThan(0);

    for (const user of nonUsUsers) {
      const response = await login(request, user.username, user.password);
      expect(response.success).toBe(false);
      expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
    }
  });

  test('Login fails for a valid username with an incorrect password', async ({ request }) => {
    const users = await getUsers(request);
    const usUser = users.find(u => u.export_status === 'US_PERSON');
    expect(usUser, 'Expected at least one US_PERSON user to exist').toBeTruthy();

    const response = await login(request, usUser!.username, 'totally_wrong_password_123!');
    expect(response.success).toBe(false);
    expect(response.message).not.toBe('Login successful. Welcome!');
  });

  test('Login fails for a non-existent username and password', async ({ request }) => {
    const response = await login(request, 'nonexistent_user_xyz', 'nonexistent_password_xyz');
    expect(response.success).toBe(false);
    expect(response.message).not.toBe('Login successful. Welcome!');
  });
});
