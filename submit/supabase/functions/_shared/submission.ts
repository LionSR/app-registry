// Pure helpers for the submit endpoint. No network access, so they are unit-tested.

export const MARKER = '<!-- app-registry-submission -->';
export const RELATIONSHIPS = ['author', 'coauthor', 'on-behalf'] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];

export interface Release {
	owner: string;
	repo: string;
	tag: string;
	url: string;
}

const NAME = '[A-Za-z0-9_.-]+';
const RELEASE_PATTERNS = [
	new RegExp(`^https://github\\.com/(${NAME})/(${NAME})/releases/tag/([^/\\s?#]+)/?$`),
	new RegExp(`^(${NAME})/(${NAME})@([^/\\s?#]+)$`),
];
// owner/repo, a repository URL, or a release or tree URL; the tag is optional.
const REPO_PATTERN = new RegExp(`^(?:https://github\\.com/)?(${NAME})/(${NAME})(?:/(?:releases/tag|tree)/([^\\s?#]+))?$`);

/** One release, with its canonical GitHub URL. */
export function release(owner: string, repo: string, tag: string): Release {
	repo = repo.replace(/\.git$/, '');
	return { owner, repo, tag, url: `https://github.com/${owner}/${repo}/releases/tag/${encodeURIComponent(tag)}` };
}

/** Accepts a release URL or owner/repo@tag. The tag is required: a submission is one release. */
export function parseRelease(input: string): Release | null {
	const text = input.trim();
	for (const re of RELEASE_PATTERNS) {
		const m = text.match(re);
		if (m) return release(m[1], m[2], decodeURIComponent(m[3]));
	}
	return null;
}

/** Looser, for the submit form: owner/repo or any GitHub repository, release, or tree URL. */
export function parseRepo(input: string): { owner: string; repo: string; tag?: string } | null {
	const m = input.trim().replace(/\/$/, '').replace(/\.git$/, '').match(REPO_PATTERN);
	return m ? { owner: m[1], repo: m[2].replace(/\.git$/, ''), tag: m[3] ? decodeURIComponent(m[3]) : undefined } : null;
}

const RELATION_TEXT: Record<Relationship, string> = {
	author: 'an author of the paper',
	coauthor: 'a co-author of the paper',
	'on-behalf': 'submitting on behalf of the authors',
};

/** The issue the registry app opens. registry/scripts/submission.py parses the JSON block. */
export function buildIssue(release: Release, submitter: string, relationship: Relationship) {
	const data = { release_url: release.url, submitter, relationship };
	return {
		title: `Submit ${release.owner}/${release.repo}@${release.tag}`,
		body: [
			MARKER,
			`@${submitter} submitted ${release.url} and is ${RELATION_TEXT[relationship]}.`,
			'',
			'The registry checks the release and replies here. Reply in this issue to respond to a review. ' +
				'The submitter can comment `/recheck` to run the checks again after fixing the release.',
			'',
			'```json app-registry-submission',
			JSON.stringify(data),
			'```',
		].join('\n'),
	};
}

/** CORS for the website; agents calling with curl do not need it. */
export function corsHeaders(origin: string | null, siteOrigin: string): Record<string, string> {
	const headers: Record<string, string> = { Vary: 'Origin' };
	if (origin && origin === siteOrigin) {
		headers['Access-Control-Allow-Origin'] = origin;
		headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
		headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
	}
	return headers;
}
