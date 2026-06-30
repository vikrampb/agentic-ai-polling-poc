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
import { APIRequestContext } from '@playwright/test';

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

async function getUsers(requestContext: APIRequestContext): Promise<User[]> {
  const response = await requestContext.get('/api/users');
  expect(response.ok()).toBeTruthy();
  const body: UsersResponse = await response.json();
  expect(body.users).toBeDefined();
  expect(Array.isArray(body.users)).toBeTruthy();
  return body.users;
}

test.describe('AQA-1 – Happy Path', () => {
  test('US_PERSON user can log in successfully and receives welcome message', async ({ request }) => {
    const users = await getUsers(request);
    const usUser = users.find((u) => u.export_status === 'US_PERSON');
    expect(usUser, 'Expected at least one US_PERSON user in the system').toBeDefined();

    const response = await request.get(
      `/api/login?username=${encodeURIComponent(usUser!.username)}&password=${encodeURIComponent(usUser!.password)}`
    );
    expect(response.ok()).toBeTruthy();

    const body: LoginResponse = await response.json();
    expect(body.success).toBe(true);
    expect(body.message).toBe('Login successful. Welcome!');
  });

  test('All US_PERSON users can log in successfully', async ({ request }) => {
    const users = await getUsers(request);
    const usUsers = users.filter((u) => u.export_status === 'US_PERSON');
    expect(usUsers.length, 'Expected at least one US_PERSON user').toBeGreaterThan(0);

    for (const user of usUsers) {
      const response = await request.get(
        `/api/login?username=${encodeURIComponent(user.username)}&password=${encodeURIComponent(user.password)}`
      );
      expect(response.ok()).toBeTruthy();

      const body: LoginResponse = await response.json();
      expect(body.success).toBe(true);
      expect(body.message).toBe('Login successful. Welcome!');
    }
  });

  test('US_PERSON login response optionally returns correct exportStatus', async ({ request }) => {
    const users = await getUsers(request);
    const usUser = users.find((u) => u.export_status === 'US_PERSON');
    expect(usUser, 'Expected at least one US_PERSON user').toBeDefined();

    const response = await request.get(
      `/api/login?username=${encodeURIComponent(usUser!.username)}&password=${encodeURIComponent(usUser!.password)}`
    );
    expect(response.ok()).toBeTruthy();

    const body: LoginResponse = await response.json();
    expect(body.success).toBe(true);
    if (body.exportStatus !== undefined) {
      expect(body.exportStatus).toBe('US_PERSON');
    }
  });
});

test.describe('AQA-1 – Boundary Conditions', () => {
  test('Login with correct username but wrong password returns failure', async ({ request }) => {
    const users = await getUsers(request);
    const usUser = users.find((u) => u.export_status === 'US_PERSON');
    expect(usUser, 'Expected at least one US_PERSON user').toBeDefined();

    const wrongPassword = usUser!.password + '_wrong';
    const response = await request.get(
      `/api/login?username=${encodeURIComponent(usUser!.username)}&password=${encodeURIComponent(wrongPassword)}`
    );

    const body: LoginResponse = await response.json();
    expect(body.success).toBe(false);
  });

  test('Login with empty username and empty password returns failure', async ({ request }) => {
    const response = await request.get(`/api/login?username=&password=`);

    const body: LoginResponse = await response.json();
    expect(body.success).toBe(false);
  });

  test('Login with swapped credentials (username as password and vice versa) returns failure', async ({ request }) => {
    const users = await getUsers(request);
    const usUser = users.find((u) => u.export_status === 'US_PERSON');
    expect(usUser, 'Expected at least one US_PERSON user').toBeDefined();

    const response = await request.get(
      `/api/login?username=${encodeURIComponent(usUser!.password)}&password=${encodeURIComponent(usUser!.username)}`
    );

    const body: LoginResponse = await response.json();
    expect(body.success).toBe(false);
  });
});

test.describe('AQA-1 – Negative Tests', () => {
  test('NON_US_PERSON user is blocked from logging in with correct error message', async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUser = users.find((u) => u.export_status === 'NON_US_PERSON');
    expect(nonUsUser, 'Expected at least one NON_US_PERSON user in the system').toBeDefined();

    const response = await request.get(
      `/api/login?username=${encodeURIComponent(nonUsUser!.username)}&password=${encodeURIComponent(nonUsUser!.password)}`
    );
    expect(response.ok()).toBeTruthy();

    const body: LoginResponse = await response.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe('Only US Persons are allowed to watch this demo.');
  });

  test('All NON_US_PERSON users are blocked and each receives the correct error message', async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUsers = users.filter((u) => u.export_status === 'NON_US_PERSON');
    expect(nonUsUsers.length, 'Expected at least one NON_US_PERSON user').toBeGreaterThan(0);

    for (const user of nonUsUsers) {
      const response = await request.get(
        `/api/login?username=${encodeURIComponent(user.username)}&password=${encodeURIComponent(user.password)}`
      );
      expect(response.ok()).toBeTruthy();

      const body: LoginResponse = await response.json();
      expect(body.success).toBe(false);
      expect(body.message).toBe('Only US Persons are allowed to watch this demo.');
    }
  });

  test('Login with a completely unknown username and password returns failure', async ({ request }) => {
    const response = await request.get(
      `/api/login?username=${encodeURIComponent('nonexistent_user_xyz')}&password=${encodeURIComponent('invalid_password_xyz')}`
    );

    const body: LoginResponse = await response.json();
    expect(body.success).toBe(false);
  });
});
