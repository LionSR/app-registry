// The registry's submit endpoint: two routes, no state.
//
//   GET  …/registry/auth/callback   GitHub redirects here after "Sign in with GitHub" on the site.
//                                   Swaps the code for a user token and hands it back to the page in
//                                   the URL fragment (never sent to a server, never logged).
//   POST …/registry/submit          { release_url, accept_terms: true, authors_permission? }
//                                   with Authorization: Bearer <token>. The one way to submit, for the
//                                   website and for agents alike. The token must come from the registry's
//                                   own GitHub App, through the website or the device flow, so everyone signs
//                                   in the same way and nobody hands the registry a broader token. It is used
//                                   only to read who the caller is and whether they can push to the paper
//                                   repository; the issue itself is opened by the registry's GitHub App, so
//                                   the review workflow can trust what it records.
//
// Runs on Supabase Edge Functions (Deno) and under Node for tests.
import process from 'node:process';
import { createAppAuth } from '@octokit/auth-app';
import { checkToken, exchangeWebFlowCode } from '@octokit/oauth-methods';
import { request as github } from '@octokit/request';
import { Bearer, Env, SubmitBody } from './schemas.ts';
import { buildIssue, corsHeaders } from './submission.ts';

type Handler = (request: Request, env: Env) => Promise<Response> | Response;

const ROUTES: { method: string; path: string; handler: Handler }[] = [
	{ method: 'GET', path: '/auth/callback', handler: callback },
	{ method: 'OPTIONS', path: '/submit', handler: preflight },
	{ method: 'POST', path: '/submit', handler: submit },
];

export async function handle(request: Request): Promise<Response> {
	const path = new URL(request.url).pathname.replace(/\/$/, '');
	const route = ROUTES.find((r) => r.method === request.method && path.endsWith(r.path));
	if (!route) return Response.json({ error: 'Not found. Use POST /submit.' }, { status: 404 });
	return route.handler(request, Env.parse(process.env));
}

async function callback(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state') ?? '';
	const back = (fragment: Record<string, string>) =>
		new Response(null, { status: 302, headers: { Location: `${env.SITE_URL}/submit/#${new URLSearchParams({ ...fragment, state })}` } });

	if (!code) return back({ error: url.searchParams.get('error_description') ?? 'Sign-in was cancelled.' });
	if (!env.GITHUB_APP_CLIENT_ID || !env.GITHUB_APP_CLIENT_SECRET) return back({ error: 'Sign-in is not configured yet.' });
	try {
		const { authentication } = await exchangeWebFlowCode({ clientType: 'github-app', clientId: env.GITHUB_APP_CLIENT_ID, clientSecret: env.GITHUB_APP_CLIENT_SECRET, code });
		return back({ token: authentication.token });
	} catch (err) {
		// GitHub's reason (e.g. "The client_id and/or client_secret passed are incorrect.") is safe to show.
		const reason = err instanceof Error ? err.message.replace(/^\[@octokit\/oauth-methods\]\s*/, '') : '';
		console.error('GitHub code exchange failed:', reason);
		return back({ error: `GitHub sign-in failed${reason ? `: ${reason}` : '.'} Try again.` });
	}
}

function preflight(request: Request, env: Env): Response {
	return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin'), new URL(env.SITE_URL).origin) });
}

async function submit(request: Request, env: Env): Promise<Response> {
	const cors = corsHeaders(request.headers.get('Origin'), new URL(env.SITE_URL).origin);
	const reply = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: cors });

	const token = Bearer.safeParse(request.headers.get('Authorization') ?? undefined);
	if (!token.success) return reply(401, { error: token.error.issues[0].message });
	const body = SubmitBody.safeParse(await request.json().catch(() => undefined));
	if (!body.success) {
		const issue = body.error.issues[0];
		return reply(400, { error: issue.path.length ? issue.message : 'Send a JSON body: {"release_url": "...", "accept_terms": true}.' });
	}
	const { release_url: release, authors_permission: authorsPermission } = body.data;
	const asUser = { headers: { authorization: `token ${token.data}` } };

	if (!env.GITHUB_APP_CLIENT_ID || !env.GITHUB_APP_CLIENT_SECRET) {
		return reply(503, { error: 'Submissions are paused while sign-in is being set up. Please try again later.' });
	}
	// Only tokens issued by the registry's GitHub App are accepted; GitHub also says whose token it is.
	let login: string;
	try {
		const { data } = await checkToken({ clientType: 'github-app', clientId: env.GITHUB_APP_CLIENT_ID, clientSecret: env.GITHUB_APP_CLIENT_SECRET, token: token.data });
		login = data.user!.login;
	} catch {
		return reply(401, { error: `Sign in through the registry first, on ${env.SITE_URL}/submit/ or with the device flow for agents (${env.SITE_URL}/agents/). Other GitHub tokens are not accepted.` });
	}

	// Write access is read from GitHub with the submitter's own token, never taken from the caller.
	let writeAccess = false;
	try {
		const { data } = await github('GET /repos/{owner}/{repo}', { owner: release.owner, repo: release.repo, ...asUser });
		writeAccess = Boolean(data.permissions?.push);
	} catch {
		return reply(404, { error: `${release.owner}/${release.repo} was not found. The repository must be public.` });
	}
	if (!writeAccess && !authorsPermission) {
		return reply(403, {
			error: `@${login} does not have write access to ${release.owner}/${release.repo}. Submit from an account that does, or confirm you have the authors' permission (send "authors_permission": true).`,
		});
	}

	const [owner, repo] = env.REGISTRY_REPO.split('/');
	try {
		const auth = createAppAuth({ appId: env.GITHUB_APP_ID, privateKey: env.GITHUB_APP_PRIVATE_KEY });
		const app = await auth({ type: 'app' });
		const { data: installation } = await github('GET /repos/{owner}/{repo}/installation', { owner, repo, headers: { authorization: `bearer ${app.token}` } });
		const { token: botToken } = await auth({ type: 'installation', installationId: installation.id });
		const { data: issue } = await github('POST /repos/{owner}/{repo}/issues', {
			owner,
			repo,
			...buildIssue(release, { login, writeAccess, authorsPermission }),
			headers: { authorization: `token ${botToken}` },
		});
		return reply(201, { issue_url: issue.html_url, issue_number: issue.number, submitter: login, write_access: writeAccess });
	} catch {
		return reply(502, { error: 'Could not open the submission on GitHub. Try again in a minute.' });
	}
}
