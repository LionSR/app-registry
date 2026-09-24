/** The command an agent (or a person in a terminal) runs to submit one release. */
export const agentCommand = (api: string, releaseUrl: string) =>
	[
		`curl -X POST ${api || 'https://<project-ref>.supabase.co/functions/v1/registry'}/submit \\`,
		`  -H "Authorization: Bearer $(gh auth token)" \\`,
		`  -d '{"release_url": "${releaseUrl}", "relationship": "author"}'`,
	].join('\n');
