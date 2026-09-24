import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildIssue, corsHeaders, isRelationship, MARKER, parseRelease } from './submission.ts';

test('parseRelease accepts release URLs and owner/repo@tag', () => {
	assert.deepEqual(parseRelease('https://github.com/shoaibphysics/blast-freezing-black-hole/releases/tag/v1.0.1'), {
		owner: 'shoaibphysics',
		repo: 'blast-freezing-black-hole',
		tag: 'v1.0.1',
		url: 'https://github.com/shoaibphysics/blast-freezing-black-hole/releases/tag/v1.0.1',
	});
	assert.equal(parseRelease('  valbert4/two-fold-transversal@v1.0.0-arxiv ')?.url, 'https://github.com/valbert4/two-fold-transversal/releases/tag/v1.0.0-arxiv');
	assert.equal(parseRelease('https://github.com/a/b.git/releases/tag/v1')?.repo, 'b');
});

test('parseRelease rejects anything that is not one release', () => {
	for (const bad of ['https://github.com/a/b', 'https://example.com/a/b/releases/tag/v1', 'a/b', '', 'https://github.com/a/b/releases/tag/v1?x=1', 'javascript:alert(1)']) {
		assert.equal(parseRelease(bad), null, bad);
	}
});

test('isRelationship', () => {
	assert.ok(isRelationship('author'));
	assert.ok(!isRelationship('reviewer'));
	assert.ok(!isRelationship(undefined));
});

test('buildIssue writes the marker and a parseable JSON block', () => {
	const r = parseRelease('owner/repo@v2.0.0')!;
	const { title, body } = buildIssue(r, 'someone', 'on-behalf');
	assert.equal(title, 'Submit owner/repo@v2.0.0');
	assert.ok(body.startsWith(MARKER));
	const m = body.match(/```json app-registry-submission\n(.*?)\n```/s)!;
	assert.deepEqual(JSON.parse(m[1]), { release_url: r.url, submitter: 'someone', relationship: 'on-behalf' });
});

test('corsHeaders only allows the site origin', () => {
	assert.equal(corsHeaders('https://site.example', 'https://site.example')['Access-Control-Allow-Origin'], 'https://site.example');
	assert.equal(corsHeaders('https://evil.example', 'https://site.example')['Access-Control-Allow-Origin'], undefined);
	assert.equal(corsHeaders(null, 'https://site.example')['Access-Control-Allow-Origin'], undefined);
});
