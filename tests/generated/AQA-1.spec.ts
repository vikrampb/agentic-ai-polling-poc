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

import { test, expect, request as playwrightRequest } from '@playwright/test';

interface User {
  id: string | number;
  name: string;
  export_status: 'US_PERSON' | 'NON_US_PERSON';
  username: string;
  password: string;
}

interface UsersResponse {
  users: User[];
}

interface LoginResponse {
  success: boolean;
  message: string;
  exportStatus?: string;
}

async function getUsers(requestContext: Awaited<ReturnType<typeof playwrightRequest.newContext>>): Promise<User[]> {
  const response = await requestContext.get('/api/users');
  expect(response.ok()).toBeTruthy();
  const body: UsersResponse = await response.json();
  expect(body.users).toBeDefined();
  expect(Array.isArray(body.users)).toBeTruthy();
  return body.users;
}

async function performLogin(
  requestContext: Awaited<ReturnType<typeof playwrightRequest.newContext>>,
  username: string,
  password: string
): Promise<LoginResponse> {
  const response = await requestContext.get(`/api/login?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`);
  const body: LoginResponse = await response.json();
  return body;
}

test.describe('AQA-1 – Happy Path', () => {
  test('US_PERSON user should log in successfully and receive welcome message', async ({ request }) => {
    const users = await getUsers(request);
    const usUser = users.find((u) => u.export_status === 'US_PERSON');
    expect(usUser, 'At least one US_PERSON user must exist').toBeDefined();

    const result = await performLogin(request, usUser!.username, usUser!.password);

    expect(result.success).toBe(true);
    expect(result.message).toBe('Login successful. Welcome!');
  });

  test('All US_PERSON users should be able to log in successfully', async ({ request }) => {
    const users = await getUsers(request);
    const usUsers = users.filter((u) => u.export_status === 'US_PERSON');
    expect(usUsers.length, 'At least one US_PERSON user must exist').toBeGreaterThan(0);

    for (const user of usUsers) {
      const result = await performLogin(request, user.username, user.password);
      expect(result.success, `User ${user.username} should log in successfully`).toBe(true);
      expect(result.message, `User ${user.username} should receive welcome message`).toBe('Login successful. Welcome!');
    }
  });

  test('US_PERSON login response should optionally include exportStatus reflecting US_PERSON', async ({ request }) => {
    const users = await getUsers(request);
    const usUser = users.find((u) => u.export_status === 'US_PERSON');
    expect(usUser, 'At least one US_PERSON user must exist').toBeDefined();

    const result = await performLogin(request, usUser!.username, usUser!.password);

    expect(result.success).toBe(true);
    if (result.exportStatus !== undefined) {
      expect(result.exportStatus).toBe('US_PERSON');
    }
  });
});

test.describe('AQA-1 – Boundary Conditions', () => {
  test('Login with empty username and empty password should not succeed', async ({ request }) => {
    const result = await performLogin(request, '', '');

    expect(result.success).toBe(false);
  });

  test('Login with valid username but empty password should not succeed', async ({ request }) => {
    const users = await getUsers(request);
    const usUser = users.find((u) => u.export_status === 'US_PERSON');
    expect(usUser, 'At least one US_PERSON user must exist').toBeDefined();

    const result = await performLogin(request, usUser!.username, '');

    expect(result.success).toBe(false);
  });

  test('Login with empty username but valid password should not succeed', async ({ request }) => {
    const users = await getUsers(request);
    const usUser = users.find((u) => u.export_status === 'US_PERSON');
    expect(usUser, 'At least one US_PERSON user must exist').toBeDefined();

    const result = await performLogin(request, '', usUser!.password);

    expect(result.success).toBe(false);
  });
});

test.describe('AQA-1 – Negative Tests', () => {
  test('NON_US_PERSON user should be denied login with correct error message', async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUser = users.find((u) => u.export_status === 'NON_US_PERSON');
    expect(nonUsUser, 'At least one NON_US_PERSON user must exist').toBeDefined();

    const result = await performLogin(request, nonUsUser!.username, nonUsUser!.password);

    expect(result.success).toBe(false);
    expect(result.message).toBe('Only US Persons are allowed to watch this demo.');
  });

  test('All NON_US_PERSON users should be denied login with correct error message', async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUsers = users.filter((u) => u.export_status === 'NON_US_PERSON');
    expect(nonUsUsers.length, 'At least one NON_US_PERSON user must exist').toBeGreaterThan(0);

    for (const user of nonUsUsers) {
      const result = await performLogin(request, user.username, user.password);
      expect(result.success, `User ${user.username} should be denied login`).toBe(false);
      expect(result.message, `User ${user.username} should receive access denied message`).toBe(
        'Only US Persons are allowed to watch this demo.'
      );
    }
  });

  test('Login with completely invalid credentials should not succeed', async ({ request }) => {
    const result = await performLogin(request, 'invalid_user_xyz_123', 'wrong_password_abc_456');

    expect(result.success).toBe(false);
  });
});
