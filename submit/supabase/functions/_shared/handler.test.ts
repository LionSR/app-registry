// Calls the real handler with GitHub's API faked, and checks what it would send.
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { test } from 'node:test';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
Object.assign(process.env, {
	GITHUB_APP_ID: '123',
	GITHUB_APP_PRIVATE_KEY: privateKey.export({ type: 'pkcs1', format: 'pem' }).toString(),
	OAUTH_CLIENT_ID: 'Ov23test',
	OAUTH_CLIENT_SECRET: 'secret',
	REGISTRY_REPO: 'LionSR/app-registry',
	SITE_URL: 'https://site.example',
});

// Fake GitHub: "good-user-token" is shoaibphysics, who can push to their own repo only.
const calls: { method: string; url: string; auth: string; body?: any }[] = [];
globalThis.fetch = (async (input: any, init: any = {}) => {
	const url = String(input instanceof Request ? input.url : input);
	const method = init.method ?? 'GET';
	const auth = new Headers(init.headers).get('authorization') ?? '';
	const body = init.body ? JSON.parse(init.body) : undefined;
	calls.push({ method, url, auth, body });
	const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
	const user = auth === 'token good-user-token';
	if (url.endsWith('/user')) return user ? json({ login: 'shoaibphysics' }) : json({ message: 'Bad credentials' }, 401);
	if (url.endsWith('/repos/shoaibphysics/blast-freezing-black-hole')) return json({ permissions: { push: user } });
	if (url.endsWith('/repos/valbert4/two-fold-transversal')) return json({ permissions: { push: false } });
	if (url.endsWith('/repos/LionSR/app-registry/installation')) return json({ id: 42 });
	if (url.endsWith('/app/installations/42/access_tokens')) return json({ token: 'bot-token', expires_at: new Date(Date.now() + 3600e3).toISOString(), permissions: {}, repository_selection: 'selected' }, 201);
	if (url.endsWith('/repos/LionSR/app-registry/issues') && method === 'POST') return json({ number: 9, html_url: 'https://github.com/LionSR/app-registry/issues/9' }, 201);
	if (url.includes('/repos/')) return json({ message: 'Not Found' }, 404);
	return json({ message: `unexpected ${method} ${url}` }, 500);
}) as typeof fetch;

const { handle } = await import('./handler.ts');
const post = (body: unknown, headers: Record<string, string> = { authorization: 'Bearer good-user-token' }) =>
	handle(new Request('https://ref.supabase.co/functions/v1/registry/submit', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }));
const issueBody = () => calls.find((c) => c.url.endsWith('/issues'))?.body;
const MINE = 'https://github.com/shoaibphysics/blast-freezing-black-hole/releases/tag/v1.0.1';
const THEIRS = 'https://github.com/valbert4/two-fold-transversal/releases/tag/v1.0.0-arxiv';

test('with write access: opens the issue as the app and records the basis', async () => {
	calls.length = 0;
	const res = await post({ release_url: MINE, accept_terms: true }, { authorization: 'Bearer good-user-token', origin: 'https://site.example' });
	assert.equal(res.status, 201);
	assert.equal(res.headers.get('access-control-allow-origin'), 'https://site.example');
	assert.deepEqual(await res.json(), { issue_url: 'https://github.com/LionSR/app-registry/issues/9', issue_number: 9, submitter: 'shoaibphysics', write_access: true });
	const issue = calls.find((c) => c.url.endsWith('/issues'))!;
	assert.equal(issue.auth, 'token bot-token', 'issue is opened with the app installation token, not the user token');
	assert.equal(issue.body.title, 'Submit shoaibphysics/blast-freezing-black-hole@v1.0.1');
	assert.match(issue.body.body, /has write access to shoaibphysics\/blast-freezing-black-hole/);
	writeFileSync(process.env.ISSUE_BODY_OUT ?? '/dev/null', issue.body.body);
});

test("without write access: refused unless the submitter confirms the authors' permission", async () => {
	calls.length = 0;
	const refused = await post({ release_url: THEIRS, accept_terms: true });
	assert.equal(refused.status, 403);
	assert.match((await refused.json()).error, /does not have write access to valbert4\/two-fold-transversal/);
	assert.equal(issueBody(), undefined);

	const allowed = await post({ release_url: THEIRS, accept_terms: true, authors_permission: true });
	assert.equal(allowed.status, 201);
	assert.equal((await allowed.json()).write_access, false);
	assert.match(issueBody().body, /does not have write access .* confirms they have the authors' permission/);
});

test('the terms must be accepted', async () => {
	const res = await post({ release_url: MINE });
	assert.equal(res.status, 400);
	assert.match((await res.json()).error, /Accept the terms of use/);
	assert.equal((await post({ release_url: MINE, accept_terms: 'yes' })).status, 400);
});

test('rejects a missing or bad token before touching the registry', async () => {
	calls.length = 0;
	assert.equal((await post({ release_url: MINE, accept_terms: true }, {})).status, 401);
	assert.equal((await post({ release_url: MINE, accept_terms: true }, { authorization: 'Bearer nope' })).status, 401);
	assert.ok(!calls.some((c) => c.url.endsWith('/issues')));
});

test('rejects bad input with a readable error', async () => {
	const bad = await post({ release_url: 'https://github.com/a/b', accept_terms: true });
	assert.equal(bad.status, 400);
	assert.match((await bad.json()).error, /must be a GitHub release/);
	const missing = await post({ accept_terms: true });
	assert.match((await missing.json()).error, /release_url/);
	const raw = await handle(new Request('https://ref.supabase.co/functions/v1/registry/submit', { method: 'POST', headers: { authorization: 'Bearer good-user-token' }, body: 'not json' }));
	assert.equal(raw.status, 400);
	assert.match((await raw.json()).error, /Send a JSON body/);
	const gone = await post({ release_url: 'someone/missing@v1', accept_terms: true });
	assert.equal(gone.status, 404);
});

test('CORS preflight only for the site; unknown routes return 404', async () => {
	const pre = await handle(new Request('https://ref.supabase.co/functions/v1/registry/submit', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }));
	assert.equal(pre.headers.get('access-control-allow-origin'), null);
	assert.equal((await handle(new Request('https://ref.supabase.co/functions/v1/registry/other'))).status, 404);
});
