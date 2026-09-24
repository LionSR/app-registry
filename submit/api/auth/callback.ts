// GitHub redirects here after "Sign in with GitHub" on the submit page.
// Swaps the one-time code for a user token and hands it back to the page in the
// URL fragment (never sent to a server, never logged). Nothing is stored.
import { exchangeWebFlowCode } from '@octokit/oauth-methods';
import { env } from '../../lib/env.ts';

export async function GET(request: Request): Promise<Response> {
	const { clientId, clientSecret, siteUrl } = env();
	const url = new URL(request.url);
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state') ?? '';
	const back = (fragment: Record<string, string>) =>
		Response.redirect(`${siteUrl}/submit/#${new URLSearchParams({ ...fragment, state })}`, 302);

	if (!code) return back({ error: url.searchParams.get('error_description') ?? 'Sign-in was cancelled.' });
	try {
		const { authentication } = await exchangeWebFlowCode({ clientType: 'github-app', clientId, clientSecret, code });
		return back({ token: authentication.token });
	} catch {
		return back({ error: 'GitHub sign-in failed. Try again.' });
	}
}
