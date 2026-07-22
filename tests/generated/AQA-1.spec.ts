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

test.describe('AQA-1 – Acceptance Criteria Tests', () => {
  test('If the export_status of the user says “US_PERSON”, the user is allowed to log in and should be pr…', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const usPerson = users.find(user => user.export_status === 'US_PERSON');
    const response = await login(request, usPerson.username, usPerson.password);
    expect(response.success).toBe(true);
    expect(response.message).toBe('Login successful. Welcome!');
  });
  test('If the export_status of the user says “NON_US_PERSON”, the user is not allowed to log in and is i…', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const nonUsUser = users.find(user => user.export_status === 'NON_US_PERSON');
    const response = await login(request, nonUsUser.username, nonUsUser.password);
    expect(response.success).toBe(false);
    expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
  });
  test('If an invalid password is used, regardless of export_status, the user instead presented with an e…', { tag: ['@regression'] }, async ({ request }) => {
    const users = await getUsers(request);
    const user = users[0];
    const response = await login(request, user.username, 'wrongPassword123!');
    expect(response.success).toBe(false);
    expect(response.message).toBe("Invalid UserID/Password combination. Please verify.");
  });
});
