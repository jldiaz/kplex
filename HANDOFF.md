# Standing instructions — preserve this header

This is a temporary handoff document between agents. The development of the solution involves agents with access to Obsidian CLI and a full development environment with all node packages installed, but also agents with more limited access. Development is done in "ping-pong" between these two types of agents. Agents should use this document to pass instructions and status from one another, such as instructions for testing/validation, or instructions for development work that can only be done in a full environment.

## Mixed agent handoff

### Instructions

The **offline development agent has no Obsidian CLI/runtime access** and performs most scoped implementation and substantial trace analysis. Its Node/dependency/browser/network/Git capabilities must be recorded, not assumed. The **main validation agent has Obsidian CLI and a full dependency environment** and prepares assignments, captures runtime evidence, reviews/fixes returns, performs native validation and handles authorized Git/PR actions. Host-only probes or supporting development can be requested from the main agent and the resulting evidence sent back for offline analysis.

Follow `AGENTS.md`, `CONTRIBUTING.md` and [the mixed agent workflow](docs/AGENT_WORKFLOW.md). Keep this single handoff transient: preserve the opening note/standing instructions and overwrite the assignment/results below on each transfer, in either direction. Do not archive handoffs or append a session history. Persist accepted architecture/checkpoint decisions and limitations in `Refactor plan.md`; feature-specific evidence belongs in its issue/PR or a reviewed validation report.

Return uncommitted changes and actual results for main-agent review unless the maintainer explicitly assigns other repository authority. Missing prerequisites/tests remain pending; a skip is not a pass. The main agent independently reviews, runs applicable checks, fixes defects and recommends only necessary prioritized manual checks. Commit/PR/merge/release steps follow applicable maintainer authorization after required validation or explicit acceptance of a recorded limitation.

Obsidian is the production host; preserve the established portable semantic, identity/source, publication/revision, localization and environment boundaries.

---

# PR #154: accepted implementation, main owns repository closeout

Offline implementation and independent review are complete/inactive. Main independently reviewed
and accepted the scoped fixes. Branch feat/ontology-inverse-slash-syntax integrates main d40a339;
original PR head 4500a97. Full Node 22.22.2 strict verification passes 2,061 test executions and exact
Obsidian smoke; native reciprocal Settings/reload/unlink 5 and Date 24 pass. Runtime/test logic stayed
frozen after the full run; test EOF whitespace, Date-driver basename repair and docs were checked afterward. All original
disposable state restores, with no active work/controllers. Details and limits are in the durable
review report and Refactor plan. Raw/superseded evidence remains local, never archive this handoff.

Main owns final staging/commit/push/CI, authorized PR merge, then main/fetch. No offline changes
pending, personal-vault access, release, further optimization or structural refactor authorized.
