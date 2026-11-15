# GitHub and Forgejo connections

Administrators can configure connections from **Settings -> GitHub and Forgejo**,
in either the 3D office or the 2D view. Add a server, then an account with its token,
verify the account, and select a repository for an office. A fresh installation
has no configured servers, accounts, repositories or agents.

Multiple instances and accounts are supported. GitHub.com also supports device
login in the browser. Repository discovery requires a token that can read the
account and its repositories; write operations require the permissions granted
by the remote service. Office settings do not change those permissions.

**Verify Git access** tests repository discovery and `git ls-remote`. A successful
read does not establish permission to push. An existing office can be linked
only when its origin matches the selected repository. Cloned offices use a
server-specific directory so repositories with the same name do not collide.

## Accounts and agent settings

The repository account is the default for that office. In **Agent management**,
an individual agent can inherit it or use another verified account from the
same server. There are no fixed organizational roles. The account is pinned
when a session starts: changing an assignment affects its next session and
does not replace credentials in a running process.

Names, colors, compatible desks and optional provider/model/instruction settings
remain configurable. A session restart requires an explicit action. The app
does not install providers or create agents when an account is configured.

Pull requests use the selected service's API for comments, reviews and merges.
The normal merge dialog offers the supported merge methods and optional branch
deletion. A changed head commit requires the user to reload the pull request.
The remote service continues to enforce permissions and branch protection.
Automatic merges are unavailable through configured API connections.

## Storage and existing installations

By default, connection metadata is stored in
`~/.config/agent-office/connections/connections.json`; account tokens are separate
files under `accounts/`. `AGENT_OFFICE_CONNECTIONS_DIR` overrides this location.
Secrets stay on the server and are not included in the settings response or Git.
No public policy file or separate merge service is required.

Stored bindings are read using the current account-per-office and optional
account-per-agent contract. Extra fields from older workflow-specific settings
are ignored. Recheck the default account and explicit agent assignments before
starting sessions on an existing installation; old role-based defaults are not
part of this contract. Runtime data and credentials are not changed by updating
the source repository.
