// The registry's submit endpoint: two routes, no state.
//
//   GET  …/registry/auth/callback   GitHub redirects here after "Sign in with GitHub" on the site.
//                                   Swaps the code for a user token and hands it back to the page in
//                                   the URL fragment (never sent to a server, never logged).
//   POST …/registry/submit          { release_url, relationship } with Authorization: Bearer <GitHub token>.
//                                   The one way to submit, for the website and for agents alike. The
//                                   token only proves who the caller is (GET /user); the issue itself is
//                                   opened by the registry's GitHub App, so the review workflow can trust it.
//
// Runs on Supabase Edge Functions (Deno) and under Node for tests.
import process from 'node:process';
import { createAppAuth } from '@octokit/auth-app';
import { exchangeWebFlowCode } from '@octokit/oauth-methods';
import { request as github } from '@octokit/request';
import { buildIssue, corsHeaders, isRelationship, parseRelease, RELATIONSHIPS } from './submission.ts';

function need(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is not set`);
	return value;
}

const config = () => ({
	appId: need('GITHUB_APP_ID'),
	// Accept keys stored with literal "\n" as well as real newlines.
	privateKey: need('GITHUB_APP_PRIVATE_KEY').replace(/\\n/g, '\n'),
	clientId: need('GITHUB_APP_CLIENT_ID'),
	clientSecret: need('GITHUB_APP_CLIENT_SECRET'),
	registryRepo: need('REGISTRY_REPO'), // e.g. LionSR/app-registry
	siteUrl: need('SITE_URL').replace(/\/$/, ''), // e.g. https://lionsr.github.io/app-registry
});

export async function handle(request: Request): Promise<Response> {
	const path = new URL(request.url).pathname.replace(/\/$/, '');
	if (path.endsWith('/auth/callback') && request.method === 'GET') return callback(request);
	if (path.endsWith('/submit')) {
		if (request.method === 'OPTIONS') return preflight(request);
		if (request.method === 'POST') return submit(request);
	}
	return Response.json({ error: 'Not found. Use POST /submit.' }, { status: 404 });
}

async function callback(request: Request): Promise<Response> {
	const { clientId, clientSecret, siteUrl } = config();
	const url = new URL(request.url);
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state') ?? '';
	const back = (fragment: Record<string, string>) =>
		new Response(null, { status: 302, headers: { Location: `${siteUrl}/submit/#${new URLSearchParams({ ...fragment, state })}` } });

	if (!code) return back({ error: url.searchParams.get('error_description') ?? 'Sign-in was cancelled.' });
	try {
		const { authentication } = await exchangeWebFlowCode({ clientType: 'github-app', clientId, clientSecret, code });
		return back({ token: authentication.token });
	} catch {
		return back({ error: 'GitHub sign-in failed. Try again.' });
	}
}

function preflight(request: Request): Response {
	return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin'), new URL(config().siteUrl).origin) });
}

async function submit(request: Request): Promise<Response> {
	const cfg = config();
	const cors = corsHeaders(request.headers.get('Origin'), new URL(cfg.siteUrl).origin);
	const reply = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: cors });

	const token = request.headers.get('Authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
	if (!token) return reply(401, { error: 'Sign in with GitHub first. Agents: send Authorization: Bearer $(gh auth token).' });

	let input: { release_url?: unknown; relationship?: unknown };
	try {
		input = await request.json();
	} catch {
		return reply(400, { error: 'Send a JSON body: {"release_url": "...", "relationship": "author"}.' });
	}
	const release = typeof input.release_url === 'string' ? parseRelease(input.release_url) : null;
	if (!release) {
		return reply(400, { error: 'release_url must be a GitHub release, like https://github.com/owner/repo/releases/tag/v1.0.0 or owner/repo@v1.0.0.' });
	}
	if (!isRelationship(input.relationship)) {
		return reply(400, { error: `relationship must be one of: ${RELATIONSHIPS.join(', ')}.` });
	}

	let submitter: string;
	try {
		const { data } = await github('GET /user', { headers: { authorization: `token ${token}` } });
		submitter = data.login;
	} catch {
		return reply(401, { error: 'GitHub did not accept this token. Sign in again.' });
	}

	const [owner, repo] = cfg.registryRepo.split('/');
	try {
		const auth = createAppAuth({ appId: cfg.appId, privateKey: cfg.privateKey });
		const app = await auth({ type: 'app' });
		const { data: installation } = await github('GET /repos/{owner}/{repo}/installation', {
			owner,
			repo,
			headers: { authorization: `bearer ${app.token}` },
		});
		const { token: botToken } = await auth({ type: 'installation', installationId: installation.id });
		const { data: issue } = await github('POST /repos/{owner}/{repo}/issues', {
			owner,
			repo,
			...buildIssue(release, submitter, input.relationship),
			headers: { authorization: `token ${botToken}` },
		});
		return reply(201, { issue_url: issue.html_url, issue_number: issue.number, submitter });
	} catch {
		return reply(502, { error: 'Could not open the submission on GitHub. Try again in a minute.' });
	}
}
