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
  test('US_PERSON user can log in and receives success message', async ({ request }) => {
    const users = await getUsers(request);
    const usUser = users.find(u => u.export_status === 'US_PERSON');
    expect(usUser).toBeDefined();
    const response = await login(request, usUser!.username, usUser!.password);
    expect(response.message).toBe('Login successful. Welcome!');
  });

  test('All US_PERSON users receive the correct success message on login', async ({ request }) => {
    const users = await getUsers(request);
    const usUsers = users.filter(u => u.export_status === 'US_PERSON');
    expect(usUsers.length).toBeGreaterThan(0);
    for (const user of usUsers) {
      const response = await login(request, user.username, user.password);
      expect(response.message).toBe('Login successful. Welcome!');
    }
  });

  test('US_PERSON user login response does not contain a non-US error message', async ({ request }) => {
    const users = await getUsers(request);
    const usUser = users.find(u => u.export_status === 'US_PERSON');
    expect(usUser).toBeDefined();
    const response = await login(request, usUser!.username, usUser!.password);
    expect(response.message).not.toBe('Only US Persons are allowed to watch this demo.');
  });
});

test.describe('AQA-1 – Boundary Conditions', () => {
  test('First US_PERSON user in the list can log in successfully', async ({ request }) => {
    const users = await getUsers(request);
    const usUsers = users.filter(u => u.export_status === 'US_PERSON');
    expect(usUsers.length).toBeGreaterThan(0);
    const firstUser = usUsers[0];
    const response = await login(request, firstUser.username, firstUser.password);
    expect(response.message).toBe('Login successful. Welcome!');
  });

  test('Last US_PERSON user in the list can log in successfully', async ({ request }) => {
    const users = await getUsers(request);
    const usUsers = users.filter(u => u.export_status === 'US_PERSON');
    expect(usUsers.length).toBeGreaterThan(0);
    const lastUser = usUsers[usUsers.length - 1];
    const response = await login(request, lastUser.username, lastUser.password);
    expect(response.message).toBe('Login successful. Welcome!');
  });

  test('First NON_US_PERSON user in the list is denied login', async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUsers = users.filter(u => u.export_status === 'NON_US_PERSON');
    expect(nonUsUsers.length).toBeGreaterThan(0);
    const firstNonUsUser = nonUsUsers[0];
    const response = await login(request, firstNonUsUser.username, firstNonUsUser.password);
    expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
  });
});

test.describe('AQA-1 – Negative Tests', () => {
  test('NON_US_PERSON user cannot log in and receives the correct error message', async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUser = users.find(u => u.export_status === 'NON_US_PERSON');
    expect(nonUsUser).toBeDefined();
    const response = await login(request, nonUsUser!.username, nonUsUser!.password);
    expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
  });

  test('All NON_US_PERSON users are denied login with the correct error message', async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUsers = users.filter(u => u.export_status === 'NON_US_PERSON');
    expect(nonUsUsers.length).toBeGreaterThan(0);
    for (const user of nonUsUsers) {
      const response = await login(request, user.username, user.password);
      expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
    }
  });

  test('NON_US_PERSON user login response does not contain the success message', async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUser = users.find(u => u.export_status === 'NON_US_PERSON');
    expect(nonUsUser).toBeDefined();
    const response = await login(request, nonUsUser!.username, nonUsUser!.password);
    expect(response.message).not.toBe('Login successful. Welcome!');
  });
});
