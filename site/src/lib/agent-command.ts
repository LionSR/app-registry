/** The command an agent (or a person in a terminal) runs to submit one release. */
export const agentCommand = (api: string, releaseUrl: string, authorsPermission = false) =>
	[
		`curl -X POST ${api || 'https://<project-ref>.supabase.co/functions/v1/registry'}/submit \\`,
		`  -H "Authorization: Bearer $(gh auth token)" \\`,
		`  -d '{"release_url": "${releaseUrl}", "accept_terms": true${authorsPermission ? ', "authors_permission": true' : ''}}'`,
	].join('\n');
