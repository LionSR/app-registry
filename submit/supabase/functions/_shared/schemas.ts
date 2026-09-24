// What the endpoint accepts, declared once. Every error message here is shown to the caller.
import { z } from 'zod';
import { parseRelease, RELATIONSHIPS } from './submission.ts';

/** Function secrets (Supabase: `supabase secrets set …`). */
export const Env = z.object({
	GITHUB_APP_ID: z.string().min(1),
	// Accept keys stored with literal "\n" as well as real newlines.
	GITHUB_APP_PRIVATE_KEY: z.string().min(1).transform((key) => key.replace(/\\n/g, '\n')),
	GITHUB_APP_CLIENT_ID: z.string().min(1),
	GITHUB_APP_CLIENT_SECRET: z.string().min(1),
	REGISTRY_REPO: z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'REGISTRY_REPO must be owner/repo'),
	SITE_URL: z.url().transform((url) => url.replace(/\/$/, '')),
});
export type Env = z.infer<typeof Env>;

/** POST /submit body. */
export const SubmitBody = z.object({
	release_url: z
		.string({ error: 'Send a release_url.' })
		.refine((s) => parseRelease(s) !== null, 'release_url must be a GitHub release, like https://github.com/owner/repo/releases/tag/v1.0.0 or owner/repo@v1.0.0.')
		.transform((s) => parseRelease(s)!),
	relationship: z.enum(RELATIONSHIPS, { error: `relationship must be one of: ${RELATIONSHIPS.join(', ')}.` }),
});

/** Authorization: Bearer <GitHub token>. */
export const Bearer = z
	.string({ error: 'Sign in with GitHub first. Agents: send Authorization: Bearer $(gh auth token).' })
	.regex(/^Bearer\s+\S+$/i, 'Sign in with GitHub first. Agents: send Authorization: Bearer $(gh auth token).')
	.transform((h) => h.split(/\s+/)[1]);
