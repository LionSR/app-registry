// The KITP 2026 conference data (aggregate counts only, no message text) and the numbers derived from it.
import raw from '../data/kitp-2026.json';

export type Agent = (typeof raw.agents)[number];
export type Project = (typeof raw.projects)[number];
export type Pair = { a: string; b: string; w: number };

export const data = raw;
export const { agents, milestones, projects, network } = raw;
const mentions = raw.mentions as [string, string, number][];

export const isHost = (id: string) => agents.find((a) => a.id === id)?.group === 'host';
export const agent = (id: string) => agents.find((a) => a.id === id)!;
export const shortName = (id: string) => (id === 'deSchoulepnikoff2026' ? 'deSchoulepn.2026' : id);
export const displayName = (a: Agent) => `${a.id}${a.group === 'sim' ? ' (sim)' : ''}`;
export const hourTicks = Array.from({ length: Math.floor(raw.hours / 6) + 1 }, (_, i) => i * 6);

/** Directed @-mention count from one agent to another. */
const weights = new Map(mentions.map(([a, b, w]) => [`${a}>${b}`, w]));
export const mentionCount = (from: string, to: string) => weights.get(`${from}>${to}`) ?? 0;
export const mentionMax = Math.max(...mentions.map((m) => m[2]));

/** Undirected pairs: mentions in both directions added up, lightest first so heavy lines draw on top. */
export const pairs: Pair[] = (() => {
	const byKey = new Map<string, Pair>();
	for (const [a, b, w] of mentions) {
		const key = [a, b].sort().join('|');
		const pair = byKey.get(key) ?? { a, b, w: 0 };
		pair.w += w;
		byKey.set(key, pair);
	}
	return [...byKey.values()].sort((x, y) => x.w - y.w);
})();

/** Sequential color step 1..7 for a positive value; 0 means none (neutral cell). */
export const SEQ_STEPS = 7;
export const seqStep = (v: number, max: number) => (v <= 0 ? 0 : Math.max(1, Math.ceil((v / max) * SEQ_STEPS)));

const isManuscript = (p: Project) => p.outcome === 'manuscript';
export const manuscripts = projects.filter(isManuscript).length;

// Facts about the Moderator, for the prose.
const peerAgents = agents.filter((a) => a.group !== 'host');
const joinHour = milestones.find((m) => m.label === 'Moderator joins')!.hour;
const before = projects.filter((p) => p.startHour < joinHour);
const after = projects.filter((p) => p.startHour >= joinHour);
const toPeers = peerAgents.map((p) => mentionCount('Moderator', p.id));
const runnerUp = Object.entries(network.betweenness as Record<string, number>)
	.filter(([id]) => id !== 'Moderator')
	.sort((x, y) => y[1] - x[1])[0];
const earlyHour = 4;

export const moderator = {
	joinHour,
	earlyHour,
	peerPairs: (peerAgents.length * (peerAgents.length - 1)) / 2,
	earlyPairs: raw.firstContacts.filter((t) => t.hour <= earlyHour).length,
	lateNewPairs: raw.firstContacts.filter((t) => t.hour > joinHour).length,
	before: { total: before.length, manuscripts: before.filter(isManuscript).length },
	after: { total: after.length, manuscripts: after.filter(isManuscript).length },
	mentionsOut: agent('Moderator').mentionsOut,
	toPeersMin: Math.min(...toPeers),
	toPeersMax: Math.max(...toPeers),
	toReferee: mentionCount('Moderator', 'Referee'),
	fromReferee: mentionCount('Referee', 'Moderator'),
	betweenness: network.betweenness.Moderator,
	runnerUp: { id: runnerUp[0], betweenness: runnerUp[1] },
};

// Facts for the summary.
const hostless = projects.filter((p) => p.referee === 0 && p.moderator === 0);
const peerWords = peerAgents.map((a) => Math.round(a.medianWords));
export const summary = {
	hostless: hostless.length,
	hostlessMaxHours: Math.max(...hostless.map((p) => p.endHour)),
	manuscriptsWithBothHosts: projects.filter((p) => isManuscript(p) && p.referee > 0 && p.moderator > 0).length,
	refereeWords: Math.round(agent('Referee').medianWords),
	peerWordsMin: Math.min(...peerWords),
	peerWordsMax: Math.max(...peerWords),
};
