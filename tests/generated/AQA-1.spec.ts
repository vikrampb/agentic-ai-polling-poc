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

test.describe('AQA-1 – Happy Path', () => {
  test('US_PERSON user with valid credentials can log in successfully', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const usUser = users.find(user => user.export_status === 'US_PERSON');
    expect(usUser).toBeDefined();

    const response = await login(request, usUser!.username, usUser!.password);
    expect(response.success).toBe(true);
    expect(response.message).toContain("Login successful");
  });

  test('US_PERSON user login response contains correct export status', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const usUser = users.find(user => user.export_status === 'US_PERSON');
    expect(usUser).toBeDefined();

    const response = await login(request, usUser!.username, usUser!.password);
    expect(response.success).toBe(true);
    expect(response.exportStatus).toBe('US_PERSON');
  });
});

test.describe('AQA-1 – Boundary', () => {
  test('NON_US_PERSON user is blocked from logging in with correct credentials', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUser = users.find(user => user.export_status === 'NON_US_PERSON');
    expect(nonUsUser).toBeDefined();

    const response = await login(request, nonUsUser!.username, nonUsUser!.password);
    expect(response.success).toBe(false);
    expect(response.message).toContain("Only US Persons are allowed to watch this demo.");
  });

  test('All NON_US_PERSON users are blocked from logging in', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUsers = users.filter(user => user.export_status === 'NON_US_PERSON');
    expect(nonUsUsers.length).toBeGreaterThan(0);

    for (const nonUsUser of nonUsUsers) {
      const response = await login(request, nonUsUser.username, nonUsUser.password);
      expect(response.success).toBe(false);
      expect(response.message).toContain("Only US Persons are allowed to watch this demo.");
    }
  });

  test('All US_PERSON users can log in successfully', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const usUsers = users.filter(user => user.export_status === 'US_PERSON');
    expect(usUsers.length).toBeGreaterThan(0);

    for (const usUser of usUsers) {
      const response = await login(request, usUser.username, usUser.password);
      expect(response.success).toBe(true);
      expect(response.message).toContain("Login successful");
    }
  });
});

test.describe('AQA-1 – Negative', () => {
  test('US_PERSON user with incorrect password is denied access', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const usUser = users.find(user => user.export_status === 'US_PERSON');
    expect(usUser).toBeDefined();

    const response = await login(request, usUser!.username, 'wrongPassword123!');
    expect(response.success).toBe(false);
    expect(response.message).toContain("Invalid username or password.");
  });

  test('Login attempt with missing username and password is rejected', { tag: ['@regression'] }, async ({ request }) => {
    const response = await login(request, '', '');
    expect(response.success).toBe(false);
  });

  test('US_PERSON user with another US_PERSON credentials cannot use mismatched username and password', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const usUsers = users.filter(user => user.export_status === 'US_PERSON');
    expect(usUsers.length).toBeGreaterThanOrEqual(2);

    const firstUser = usUsers[0];
    const secondUser = usUsers[1];

    const response = await login(request, firstUser.username, secondUser.password);
    expect(response.success).toBe(false);
    expect(response.message).toContain("Invalid username or password.");
  });
});
