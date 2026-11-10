# Task workspace

The Tasks workspace keeps Jira work, local drafts, worker scenarios, generated results and
publishing receipts together inside the current T3 environment and project.

## Connect Jira

Open **Tasks** from the workspace rail. If the project has no task source, enter the Jira URL,
optional Jira project key, and a server-side SecretReference. The browser never receives the Jira
token. The server checks that the selected environment and project belong to the connected server.

## Read and edit a task

Tasks are grouped by sprint and searchable by key, title and Jira status. Select a task to see the
source description, fields, comments, processing scenario and generated results. **Edit draft**
saves a local revision; Jira remains unchanged. The draft preview keeps the Jira source available
for comparison, and **Discard draft** requires confirmation.

## Run a scenario

Configure provider/model, prompts, rules, skills, connectors, checks and retry limits in the
scenario panel. Enable **Auto-start matching Jira tasks** when a synchronized task should enter the
scenario without a manual click. **Run scenario** confirms the number of independent variants and the access mode
before creating isolated worktrees. Agent, audit and check workers run on the server; their thread
IDs, variant output, check output/exit codes, audit report and terminal state are persisted locally.
Configured check commands execute in the variant worktree. Agent-backed checks must return an
explicit `CHECK_RESULT: PASS`; completion alone is not treated as a passing check. The page polls
active runs so a tab does not own the worker lifecycle. A configured publish stage stops in an
explicit-action-ready state; it never pushes without the Publish confirmation.

## Publish

Choose a succeeded variant and branch, then confirm the push and prepared Jira comments. The
server verifies that the worktree and selected project resolve to the same Git repository (including
standard T3 worktrees kept in the managed worktree directory), rejects dirty worktrees, and uses a
non-force push. Push and comment phases have separate durable receipts; Jira comment markers make
retries idempotent, and a retry after a comment failure reuses the recorded push receipt.

Storybook artifacts open through the server launcher at their verified URL, or at the local
Storybook `?path=/story/<storyId>` fallback when only a verified story ID is available.
