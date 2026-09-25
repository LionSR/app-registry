import { getCollection, type CollectionEntry } from 'astro:content';

export type Paper = CollectionEntry<'papers'>['data'];
export type Version = Paper['versions'][number];

export const latest = (p: Paper): Version => p.versions[p.versions.length - 1];
export const firstListed = (p: Paper) => p.versions[0].listed_at;

/** All papers, most recently listed first. */
export async function allPapers(): Promise<Paper[]> {
	const entries = await getCollection('papers');
	return entries.map((e) => e.data).sort((a, b) => b.id.localeCompare(a.id));
}

/** Citable ID of one version, e.g. APP-260923-0000v2. The bare ID always means the latest version. */
export const versionId = (p: Paper, v: Version) => `${p.id}v${v.v}`;
