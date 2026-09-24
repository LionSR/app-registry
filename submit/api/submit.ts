// POST /api/submit  { release_url, relationship }  with  Authorization: Bearer <GitHub token>
//
// The one way to submit, for the website and for agents alike. The caller's token
// only proves who they are (GET /user); the issue itself is opened by the
// registry's GitHub App, so the review workflow can trust its contents.
import { createAppAuth } from '@octokit/auth-app';
import { request as github } from '@octokit/request';
import { env } from '../lib/env.ts';
import { buildIssue, corsHeaders, isRelationship, parseRelease, RELATIONSHIPS } from '../lib/submission.ts';

export function OPTIONS(request: Request): Response {
	return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin'), new URL(env().siteUrl).origin) });
}

export async function POST(request: Request): Promise<Response> {
	const config = env();
	const cors = corsHeaders(request.headers.get('Origin'), new URL(config.siteUrl).origin);
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

	const [owner, repo] = config.registryRepo.split('/');
	try {
		const auth = createAppAuth({ appId: config.appId, privateKey: config.privateKey });
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
