// Calls the real POST handler with GitHub's API faked, and checks what it would send.
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { test } from 'node:test';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
Object.assign(process.env, {
	GITHUB_APP_ID: '123',
	GITHUB_APP_PRIVATE_KEY: privateKey.export({ type: 'pkcs1', format: 'pem' }).toString(),
	GITHUB_APP_CLIENT_ID: 'Iv1.test',
	GITHUB_APP_CLIENT_SECRET: 'secret',
	REGISTRY_REPO: 'LionSR/app-registry',
	SITE_URL: 'https://site.example',
});

const calls: { method: string; url: string; auth: string; body?: any }[] = [];
globalThis.fetch = (async (input: any, init: any = {}) => {
	const url = String(input instanceof Request ? input.url : input);
	const method = init.method ?? 'GET';
	const auth = new Headers(init.headers).get('authorization') ?? '';
	const body = init.body ? JSON.parse(init.body) : undefined;
	calls.push({ method, url, auth, body });
	const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
	if (url.endsWith('/user')) return auth === 'token good-user-token' ? json({ login: 'shoaibphysics' }) : json({ message: 'Bad credentials' }, 401);
	if (url.endsWith('/repos/LionSR/app-registry/installation')) return json({ id: 42 });
	if (url.endsWith('/app/installations/42/access_tokens')) return json({ token: 'bot-token', expires_at: new Date(Date.now() + 3600e3).toISOString(), permissions: {}, repository_selection: 'selected' }, 201);
	if (url.endsWith('/repos/LionSR/app-registry/issues') && method === 'POST') return json({ number: 9, html_url: 'https://github.com/LionSR/app-registry/issues/9' }, 201);
	return json({ message: `unexpected ${method} ${url}` }, 500);
}) as typeof fetch;

const { handle } = await import('./handler.ts');
const post = (body: unknown, headers: Record<string, string> = {}) =>
	handle(new Request('https://ref.supabase.co/functions/v1/registry/submit', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }));

test('opens the issue as the app, naming the verified submitter', async () => {
	calls.length = 0;
	const res = await post(
		{ release_url: 'https://github.com/shoaibphysics/blast-freezing-black-hole/releases/tag/v1.0.1', relationship: 'author' },
		{ authorization: 'Bearer good-user-token', origin: 'https://site.example' },
	);
	assert.equal(res.status, 201);
	assert.equal(res.headers.get('access-control-allow-origin'), 'https://site.example');
	assert.deepEqual(await res.json(), { issue_url: 'https://github.com/LionSR/app-registry/issues/9', issue_number: 9, submitter: 'shoaibphysics' });
	const issue = calls.find((c) => c.url.endsWith('/issues'))!;
	assert.equal(issue.auth, 'token bot-token', 'issue is opened with the app installation token, not the user token');
	assert.equal(issue.body.title, 'Submit shoaibphysics/blast-freezing-black-hole@v1.0.1');
	writeFileSync(process.env.ISSUE_BODY_OUT ?? '/dev/null', issue.body.body);
});

test('rejects a missing or bad token before touching the registry', async () => {
	calls.length = 0;
	assert.equal((await post({ release_url: 'a/b@v1', relationship: 'author' })).status, 401);
	assert.equal((await post({ release_url: 'a/b@v1', relationship: 'author' }, { authorization: 'Bearer nope' })).status, 401);
	assert.ok(!calls.some((c) => c.url.endsWith('/issues')));
});

test('rejects bad input with a readable error', async () => {
	const bad = await post({ release_url: 'https://github.com/a/b', relationship: 'author' }, { authorization: 'Bearer good-user-token' });
	assert.equal(bad.status, 400);
	assert.match((await bad.json()).error, /must be a GitHub release/);
	assert.equal((await post({ release_url: 'a/b@v1', relationship: 'reviewer' }, { authorization: 'Bearer good-user-token' })).status, 400);
});

test('CORS preflight only for the site', async () => {
	assert.equal((await handle(new Request('https://ref.supabase.co/functions/v1/registry/submit', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }))).headers.get('access-control-allow-origin'), null);
});

test('unknown routes return 404', async () => {
	assert.equal((await handle(new Request('https://ref.supabase.co/functions/v1/registry/other'))).status, 404);
});
