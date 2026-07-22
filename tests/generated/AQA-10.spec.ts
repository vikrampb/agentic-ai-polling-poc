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

test.describe('AQA-10 – Acceptance Criteria Tests', () => {
  test('When a US_PERSON user logs in successfully, the response message contains their full name, e.g', async ({ request }) => {
    const users = await getUsers(request);
    const usPerson = users.find(user => user.export_status === 'US_PERSON');
    const response = await login(request, usPerson.username, usPerson.password);
    expect(response.message).toContain(usPerson.name);
  });
  test('“Welcome, Captain America!” When a non US_PERSON user tried to log in, they are displayed an “Onl…', async ({ request }) => {
    const users = await getUsers(request);
    const nonUsPersonUser = users.find(user => user.export_status === 'NON_US_PERSON');
    const response = await login(request, nonUsPersonUser.username, nonUsPersonUser.password);
    expect(response.success).toBe(false);
    expect(response.message).toBe('Only US Persons are allowed to watch this demo.');
  });
});
