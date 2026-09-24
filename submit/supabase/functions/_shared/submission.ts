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
const PATTERNS = [
	new RegExp(`^https://github\\.com/(${NAME})/(${NAME})/releases/tag/([^/\\s?#]+)/?$`),
	new RegExp(`^(${NAME})/(${NAME})@([^/\\s?#]+)$`),
];

/** Accepts a release URL or owner/repo@tag. The tag is required: a submission is one release. */
export function parseRelease(input: string): Release | null {
	const text = input.trim();
	for (const re of PATTERNS) {
		const m = text.match(re);
		if (m) {
			const [, owner, rawRepo, tag] = m;
			const repo = rawRepo.replace(/\.git$/, '');
			const decoded = decodeURIComponent(tag);
			return { owner, repo, tag: decoded, url: `https://github.com/${owner}/${repo}/releases/tag/${encodeURIComponent(decoded)}` };
		}
	}
	return null;
}

export function isRelationship(value: unknown): value is Relationship {
	return typeof value === 'string' && (RELATIONSHIPS as readonly string[]).includes(value);
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
