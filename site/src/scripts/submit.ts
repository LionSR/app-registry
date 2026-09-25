// The submit page: sign in with GitHub, choose the repository and release, confirm, submit.
// One status box above the Submit button always says what can happen next.
// Parsing is shared with the submit endpoint so both accept exactly the same input,
// and the endpoint repeats every check that matters (write access, terms), so nothing here is trusted.
import type { z } from 'zod';
import { parseRepo, release } from '../../../submit/supabase/functions/_shared/submission.ts';
import { ContributedRepos, Failed, GitHubRelease, GitHubRepo, GitHubUser, Listing, Submitted } from './schemas';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const root = document.querySelector<HTMLElement>('.submit')!;
const api = root.dataset.api!;
const clientId = root.dataset.clientId!;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const signinStep = $('signin-step');
const signinStatus = $('signin-status');
const form = $<HTMLFormElement>('form');
const who = $('who');
const repoInput = $<HTMLInputElement>('repo');
const suggestions = $('repo-suggestions');
const tagSelect = $<HTMLSelectElement>('tag');
const preview = $('preview');
const permissionRow = $('permission-row');
const permission = $<HTMLInputElement>('permission');
const permissionWhy = $('permission-why');
const terms = $<HTMLInputElement>('terms');
const statusBox = $('status');
const send = $<HTMLButtonElement>('send');

// sessionStorage can throw (private mode, blocked storage); the page still works without it.
const TOKEN = 'app-registry-token';
const OAUTH_STATE = 'app-registry-oauth-state';
const store = {
	get: (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } },
	set: (k: string, v: string) => { try { sessionStorage.setItem(k, v); } catch { /* ignore */ } },
	del: (k: string) => { try { sessionStorage.removeItem(k); } catch { /* ignore */ } },
};

/** Fetch JSON and validate it. `status` is 0 when the request failed or the reply had the wrong shape. */
async function getJson<S extends z.ZodType>(url: string, schema: S, init?: RequestInit): Promise<{ ok: true; data: z.infer<S> } | { ok: false; status: number }> {
	const res = await fetch(url, init).catch(() => null);
	if (!res?.ok) return { ok: false, status: res?.status ?? 0 };
	const parsed = schema.safeParse(await res.json().catch(() => undefined));
	return parsed.success ? { ok: true, data: parsed.data } : { ok: false, status: 0 };
}
const gh = <S extends z.ZodType>(path: string, schema: S) => {
	const token = store.get(TOKEN);
	return getJson(`https://api.github.com${path}`, schema, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
};

// ---- State ----

const state = {
	configured: Boolean(api && clientId),
	login: '',
	signinError: '',
	repo: null as ReturnType<typeof parseRepo>,
	lookup: 'idle' as 'idle' | 'loading' | 'not-found' | 'rate-limited' | 'failed' | 'done',
	eligible: 0, // releases carrying APP_PUBLICATION.json
	forkOf: '',
	canWrite: false, // GitHub reports push access for the signed-in account
	tag: '',
	listedAs: '', // registry ID if this repository is already listed
	tagListed: false,
	agentsMd: 'unknown' as 'unknown' | 'found' | 'missing',
	authorsPermission: false,
	termsAccepted: false,
	sending: false,
	sent: null as { url: string; number: number } | null,
	sendError: '',
};
type State = typeof state;

// ---- The status box: the first matching rule decides what it says and whether Submit is enabled ----

type Part = string | { text: string; href: string } | { text: string; onClick: () => void };
type Status = { tone: 'info' | 'ok' | 'warn' | 'error'; say: Part[]; ready?: boolean };
const name = (s: State) => (s.repo ? `${s.repo.owner}/${s.repo.repo}` : '');
const what = (s: State) => (s.listedAs ? `a new version of ${s.listedAs}` : 'a new paper');
const needsPermission = (s: State) => s.lookup === 'done' && s.eligible > 0 && !s.tagListed && !s.canWrite && !s.sent;

const RULES: [when: (s: State) => boolean, status: (s: State) => Status][] = [
	[(s) => Boolean(s.sent), (s) => ({ tone: 'ok', say: ['Submitted. The checks and the review happen in ', { text: `issue #${s.sent!.number}`, href: s.sent!.url }, ', where you are mentioned and can reply.'] })],
	[(s) => s.sending, () => ({ tone: 'info', say: ['Submitting…'] })],
	[(s) => !s.repo, () => ({ tone: 'info', say: ['Choose the repository of your paper.'] })],
	[(s) => s.lookup === 'loading', (s) => ({ tone: 'info', say: [`Looking up ${name(s)}…`] })],
	[(s) => s.lookup === 'not-found', (s) => ({ tone: 'error', say: [`${name(s)} was not found. The repository must exist and be public. Check the spelling, or paste its GitHub URL.`] })],
	[(s) => s.lookup === 'rate-limited', () => ({ tone: 'error', say: ['GitHub is limiting requests from this browser. Wait a minute and try again.'] })],
	[(s) => s.lookup === 'failed', (s) => ({ tone: 'error', say: [`GitHub could not be reached for ${name(s)}. Try again in a minute.`] })],
	[
		(s) => !s.eligible && Boolean(s.forkOf),
		(s) => ({ tone: 'warn', say: [`${name(s)} is a fork of ${s.forkOf} and has no release to submit. The paper is usually released from the original repository. `, { text: `Use ${s.forkOf}`, onClick: () => chooseRepo(s.forkOf) }] }),
	],
	[(s) => !s.eligible, (s) => ({ tone: 'warn', say: [`${name(s)} has no release with an APP_PUBLICATION.json file, so there is nothing to submit yet. `, { text: 'Publish the paper first', href: `${BASE}/publish/` }, '.'] })],
	[(s) => s.tagListed, (s) => ({ tone: 'info', say: [`This release is already in the registry as ${s.listedAs}. `, { text: 'View the paper', href: `${BASE}/papers/${s.listedAs}/` }, '.'] })],
	[(s) => needsPermission(s) && !s.authorsPermission, (s) => ({ tone: 'warn', say: [`@${s.login} cannot write to ${name(s)}. Sign in with an account that can, or confirm above that you have the authors' permission.`] })],
	[(s) => !s.termsAccepted, () => ({ tone: 'info', say: ['Agree to the terms of use to submit.'] })],
	// From here on the release can be submitted; a failed attempt can be retried.
	[(s) => Boolean(s.sendError), (s) => ({ tone: 'error', say: [s.sendError], ready: true })],
	[(s) => s.agentsMd === 'missing', (s) => ({ tone: 'warn', say: [`Ready to submit ${name(s)}@${s.tag} as ${what(s)}. There is no AGENTS.md at this tag, so the checks will likely fail.`], ready: true })],
	[() => true, (s) => ({ tone: 'ok', say: [`Ready to submit ${name(s)}@${s.tag} as ${what(s)}.`], ready: true })],
];

function show(el: HTMLElement, parts: Part[]) {
	el.replaceChildren(
		...parts.map((p) => {
			if (typeof p === 'string') return document.createTextNode(p);
			if ('href' in p) return Object.assign(document.createElement('a'), { href: p.href, textContent: p.text });
			const button = Object.assign(document.createElement('button'), { type: 'button', className: 'link', textContent: p.text });
			button.addEventListener('click', p.onClick);
			return button;
		}),
	);
}

function render() {
	// Signed out: only the sign-in step. Signed in: only the form.
	signinStep.hidden = Boolean(state.login);
	form.hidden = !state.login;
	const signinMessage = !state.configured ? 'Sign-in is temporarily unavailable, so submissions are paused. Please try again later.' : state.signinError;
	signinStatus.hidden = !signinMessage;
	signinStatus.dataset.tone = state.configured ? 'error' : 'warn';
	signinStatus.textContent = signinMessage;
	$('signin').hidden = !state.configured;
	who.textContent = `Signed in as @${state.login}`;

	permissionRow.hidden = !needsPermission(state);
	permissionWhy.textContent = `@${state.login} cannot write to ${name(state)}, so an editor will confirm this with the authors.`;

	const { tone, say, ready = false } = RULES.find(([when]) => when(state))![1](state);
	statusBox.dataset.tone = tone;
	show(statusBox, say);
	send.disabled = !ready || state.sending;
}

const update = (patch: Partial<State>) => {
	Object.assign(state, patch);
	render();
};

// ---- Sign-in ----

// Back from GitHub: the callback put the token (or an error) in the URL fragment.
const back = new URLSearchParams(location.hash.slice(1));
if (back.has('state')) {
	history.replaceState(null, '', location.pathname);
	if (back.get('state') !== store.get(OAUTH_STATE)) state.signinError = 'Sign-in could not be verified. Sign in again from this page.';
	else if (back.get('error')) state.signinError = back.get('error')!;
	else if (back.get('token')) store.set(TOKEN, back.get('token')!);
	store.del(OAUTH_STATE);
}

async function loadAccount() {
	if (!store.get(TOKEN)) return render();
	const user = await gh('/user', GitHubUser);
	if (!user.ok) {
		store.del(TOKEN);
		return update({ signinError: 'Your GitHub sign-in has expired. Sign in again.' });
	}
	update({ login: user.data.login, signinError: '' });
	suggestRepos(user.data.login);
	suggestContributed();
}

$('signin').addEventListener('click', () => {
	const nonce = crypto.randomUUID();
	store.set(OAUTH_STATE, nonce);
	const q = new URLSearchParams({ client_id: clientId, redirect_uri: `${api}/auth/callback`, state: nonce });
	location.href = `https://github.com/login/oauth/authorize?${q}`;
});
$('signout').addEventListener('click', () => {
	store.del(TOKEN);
	location.reload();
});

// ---- Repository and release pickers (public GitHub data read with the signed-in account) ----

let listing: z.infer<typeof Listing> = [];
const listingReady = getJson(`${BASE}/papers/index.json`, Listing).then((r) => r.ok && (listing = r.data));

// Suggestions: an owner's public repositories (forks labelled), and, once signed in, the public
// repositories the user contributed to, which covers papers they co-author in someone else's repository.
const suggested = new Set<string>();
function suggest(fullName: string, fork: boolean) {
	if (suggested.has(fullName.toLowerCase())) return;
	suggested.add(fullName.toLowerCase());
	suggestions.append(Object.assign(document.createElement('option'), { value: fullName, label: fork ? `${fullName} (fork)` : fullName }));
}
const listedOwners = new Set<string>();
async function suggestRepos(owner: string) {
	if (listedOwners.has(owner.toLowerCase())) return;
	listedOwners.add(owner.toLowerCase());
	const repos = await gh(`/users/${encodeURIComponent(owner)}/repos?per_page=100&sort=updated&type=owner`, GitHubRepo.array());
	if (repos.ok) for (const r of repos.data.filter((r) => !r.private)) suggest(r.full_name, r.fork);
}
async function suggestContributed() {
	const token = store.get(TOKEN);
	if (!token) return;
	const query = '{ viewer { repositoriesContributedTo(first: 100, privacy: PUBLIC, includeUserRepositories: false, contributionTypes: [COMMIT, PULL_REQUEST, REPOSITORY]) { nodes { nameWithOwner isFork } } } }';
	const res = await getJson('https://api.github.com/graphql', ContributedRepos, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ query }) });
	if (res.ok) for (const r of res.data.data.viewer.repositoriesContributedTo.nodes) if (r) suggest(r.nameWithOwner, r.isFork);
}

function setOptions(options: { value?: string; text: string; disabled?: boolean }[]) {
	tagSelect.replaceChildren(...options.map((o) => Object.assign(document.createElement('option'), { value: o.value ?? '', textContent: o.text, disabled: o.disabled ?? false })));
}

function chooseRepo(fullName: string) {
	repoInput.value = fullName;
	loadReleases();
}

let current = ''; // the repository being looked up; later lookups win
async function loadReleases() {
	const text = repoInput.value.trim();
	const owner = text.match(/^(?:https:\/\/github\.com\/)?([\w.-]+)\/$/)?.[1];
	if (owner) suggestRepos(owner);
	const r = parseRepo(text);
	const key = r ? `${r.owner}/${r.repo}`.toLowerCase() : '';
	if (r && key === current) {
		// Same repository (e.g. a pasted URL for it): keep the lookup, switch release if one is named.
		if (r.tag && r.tag !== tagSelect.value && [...tagSelect.options].some((o) => o.value === r.tag && !o.disabled)) {
			tagSelect.value = r.tag;
			selectRelease();
		}
		return;
	}
	current = key;
	tagSelect.disabled = true;
	preview.hidden = true;
	permission.checked = false;
	const reset = { repo: r, sent: null, sendError: '', eligible: 0, forkOf: '', canWrite: false, tag: '', listedAs: '', tagListed: false, agentsMd: 'unknown', authorsPermission: false } as const;
	if (!r) {
		setOptions([{ text: 'Choose a repository first' }]);
		return update({ ...reset, lookup: 'idle' });
	}
	update({ ...reset, lookup: 'loading' });

	const [found, meta] = await Promise.all([gh(`/repos/${r.owner}/${r.repo}/releases?per_page=100`, GitHubRelease.array()), gh(`/repos/${r.owner}/${r.repo}`, GitHubRepo)]);
	if (current !== key) return;
	if (!found.ok) {
		setOptions([{ text: 'No releases' }]);
		return update({ lookup: found.status === 404 ? 'not-found' : found.status === 403 || found.status === 429 ? 'rate-limited' : 'failed' });
	}
	const releases = found.data.filter((x) => !x.draft);
	const eligible = releases.filter((x) => x.assets.some((a) => a.name === 'APP_PUBLICATION.json')).map((x) => x.tag_name);
	const repoInfo = meta.ok ? meta.data : null;
	const facts = { eligible: eligible.length, canWrite: Boolean(repoInfo?.permissions?.push), forkOf: repoInfo?.fork ? (repoInfo.parent?.full_name ?? '') : '' };

	if (!eligible.length) {
		setOptions([{ text: releases.length ? 'No release can be submitted yet' : 'No releases yet' }]);
		return update({ ...facts, lookup: 'done' });
	}
	setOptions(releases.map((x) => (eligible.includes(x.tag_name) ? { value: x.tag_name, text: x.tag_name } : { value: x.tag_name, text: `${x.tag_name} (no APP_PUBLICATION.json)`, disabled: true })));
	tagSelect.disabled = false;
	tagSelect.value = r.tag && eligible.includes(r.tag) ? r.tag : eligible[0];
	Object.assign(state, facts, { lookup: 'done' });
	selectRelease();
}

async function selectRelease() {
	const r = state.repo;
	const tag = tagSelect.value;
	if (!r || !tag) return;
	await listingReady;
	const entry = listing.find((e) => e.repo_url.toLowerCase() === `https://github.com/${r.owner}/${r.repo}`.toLowerCase());
	update({ tag, listedAs: entry?.id ?? '', tagListed: Boolean(entry?.versions.some((v) => v.tag === tag)), agentsMd: 'unknown', sent: null, sendError: '' });

	// Preview what the release says about itself. The real checks run after submission.
	preview.hidden = false;
	preview.textContent = `Reading AGENTS.md at ${tag}…`;
	const res = await fetch(`https://raw.githubusercontent.com/${r.owner}/${r.repo}/${encodeURIComponent(tag)}/AGENTS.md`).catch(() => null);
	if (tagSelect.value !== tag || state.repo !== r) return;
	if (res?.ok) {
		const text = await res.text();
		const title = text.match(/^title:\s*["']?(.*?)["']?\s*$/m)?.[1];
		const names = [...text.matchAll(/^\s*-\s+name:\s*["']?(.*?)["']?\s*$/gm)].map((m) => m[1]);
		preview.textContent = title ? `${title}${names.length ? `, by ${names.join(', ')}` : ''}` : `Found AGENTS.md at ${tag}.`;
	} else preview.hidden = true;
	update({ agentsMd: res?.ok ? 'found' : 'missing' });
}

repoInput.addEventListener('input', loadReleases);
tagSelect.addEventListener('change', selectRelease);
permission.addEventListener('change', () => update({ authorsPermission: permission.checked, sendError: '' }));
terms.addEventListener('change', () => update({ termsAccepted: terms.checked, sendError: '' }));

// ---- Submit ----

form.addEventListener('submit', async (e) => {
	e.preventDefault();
	const token = store.get(TOKEN);
	if (!state.repo || !state.tag || !token) return;
	update({ sending: true, sendError: '' });
	const res = await fetch(`${api}/submit`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ release_url: release(state.repo.owner, state.repo.repo, state.tag).url, accept_terms: state.termsAccepted, authors_permission: state.authorsPermission }),
	}).catch(() => null);
	const body = await res?.json().catch(() => undefined);
	if (!res) return update({ sending: false, sendError: 'The registry could not be reached. Check your connection and try again.' });
	if (res.status === 401) {
		store.del(TOKEN);
		return update({ sending: false, login: '', signinError: 'Your GitHub sign-in has expired. Sign in again, then submit.' });
	}
	const sent = Submitted.safeParse(body);
	if (res.ok && sent.success) return update({ sending: false, sent: { url: sent.data.issue_url, number: sent.data.issue_number } });
	const failed = Failed.safeParse(body);
	update({ sending: false, sendError: failed.success ? failed.data.error : `The registry could not accept the submission (error ${res.status}). Try again in a minute.` });
});

loadAccount();
