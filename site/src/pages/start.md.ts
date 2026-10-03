import type { APIRoute } from 'astro';
import { url } from '../lib/url';

// Instructions for an AI coding agent requested to publish research following agenticpapers.app.
// Linked from llms.txt, the home page, and the Publish page.
const PROTOCOL = 'LionSR/AgenticPublicationProtocol';
const RAW_REPO = `https://raw.githubusercontent.com/${PROTOCOL}/main`;
const RAW_SKILLS = `${RAW_REPO}/skills`;

export const GET: APIRoute = ({ site }) => {
	const abs = (path: string) => (site ? new URL(url(path), site).href : url(path));
	const text = `# Publishing a paper with APP: instructions for coding agents

This document provides instructions for an AI coding agent requested to publish research following agenticpapers.app.

The Agentic Publication Protocol (APP) packages a paper, code, data, and an \`AGENTS.md\` instructions file into a GitHub release.

Publishing includes two stages:
1. **Publish**: The \`publish-paper\` skill converts the project directory into a validated GitHub release in the author repository.
2. **Register** (optional): Add the release to the registry at ${abs('/')} to make the paper discoverable.

Request user approval before you install software or make changes on GitHub. The APP skills also prompt for user confirmation.

## 1. Install the APP skills

The skills are located in the GitHub repository \`${PROTOCOL}\` as the \`paper-protocol\` plugin. Verify if the \`publish-paper\` skill is already available in your environment.

### Claude Code

Run these commands in your shell:

\`\`\`bash
claude plugin marketplace add ${PROTOCOL}
claude plugin install paper-protocol@paper-protocol
\`\`\`

Ask the user to run \`/reload-plugins\` at the Claude Code prompt or restart the session. The skills become active after reload.

### Codex

Run these commands in your shell:

\`\`\`bash
codex plugin marketplace add ${PROTOCOL}
codex plugin add paper-protocol@paper-protocol
\`\`\`

These commands require network access and configuration file modifications. Request user approval if operating in a sandbox. Then ask the user to start a new Codex session.

### Other agents

The skills are standard Agent Skills folders (each contains a \`SKILL.md\`) in \`skills/\` in the repository. Clone the repository and configure your agent to load the skills:

\`\`\`bash
git clone https://github.com/${PROTOCOL}.git
\`\`\`

### Without installing

If you cannot install skills, fetch and read the skill files directly:
- Primary skill: ${RAW_SKILLS}/publish-paper/SKILL.md
- Step skills: ${RAW_SKILLS}/<name>/SKILL.md
- Root repository files: ${RAW_REPO}/<path> (such as \`PROTOCOL.md\`)

Skills mention three kinds of paths. Resolve each kind as follows:
- Links to supporting files (for example, \`../../PROTOCOL.md\`, \`../extract-chat-context/confidentiality-checklist.md\`, or \`release-real.md\`): resolve against the URL of the skill that contains the link.
- Protocol repository paths (for example, \`PROTOCOL.md\` or \`template/publications.md\`): fetch ${RAW_REPO}/<path>.
- Workflow paths (for example, \`publication-staging/\` or \`working/reproduction/reproduction-report.md\`): these are in the user's project directory. Do not resolve them as URLs.

## 2. Publish

Open the directory containing the paper, code, and data. Execute the \`publish-paper\` skill (\`/publish-paper\` in Claude Code or \`$publish-paper\` in Codex).

The workflow coordinates five verification and release steps:
1. **Reproduce results**: Verify computational derivations, execute code, and reproduce figures.
2. **Prepare staging**: Organize file layout, software dependencies, and license declarations.
3. **Define paper agent**: Compose \`AGENTS.md\` instructions and execution guidelines.
4. **Validate publication**: Verify manifest structure, link integrity, and agent responsiveness.
5. **Release outcome**: Freeze verified assets and create a tagged GitHub release with \`APP_PUBLICATION.json\`.

Reconcile any verification discrepancies collaboratively with the user. Always request explicit confirmation before modifying repository files or publishing Git releases.

## 3. Register in the registry

After creating the verified release, offer to register it in the registry catalog. With the user's approval, submit it yourself: follow the procedure at ${abs('/agents/')}. The user enters a one-time device code at GitHub, and you send the release URL and read the result. The Submit page (${abs('/submit/')}) is the manual alternative for a user without an agent.

A published release cannot change. If the registry checks fail because the paper's files must change, create a new release with a new tag and submit that release.

## Additional resources

- Author guide: ${abs('/publish/')}
- Protocol specification: ${abs('/protocol/latest/')}
- Registered papers index: ${abs('/papers/index.json')}
`;
	return new Response(text, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
};
