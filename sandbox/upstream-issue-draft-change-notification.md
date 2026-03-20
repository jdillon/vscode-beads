# Draft: Upstream Issue for steveyegge/beads

## Title

How should UI tools detect changes now that the daemon is gone?

## Body

Hey — I'm building a VS Code extension for beads ([vscode-beads](https://github.com/jdillon/vscode-beads)). We were using the daemon RPC interface for data and `GetMutations` to keep the UI in sync when agents make changes.

With v0.50 removing the daemon, what's the recommended way for tools like ours to know when data changes? Agents are creating and updating beads constantly and we need the UI to stay reasonably current.

Related — with the move to Dolt and the single-process embedded mode, is the expectation that external tools should only interact through the CLI? We want to make sure we're building on the right foundation and not fighting the new architecture. Curious how you're thinking about the tool ecosystem fitting in with these changes.

Any guidance on the intended pattern going forward would be great.
