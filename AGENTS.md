<!-- d7r:git-workflow:start -->
## Git workflow (d7r, binding; synced from the planning repo, do not edit here)

- The main checkout of this repository is a read-only mirror of `origin`'s default branch. Never edit files, commit, switch branches or run builds that write tracked files here. Older instructions in this repository that edit or push `main` directly are superseded.
- Do all work in a worktree: `~/code/d7r/scripts/d7r-worktree new <repo> <type>/<slug>` creates `<repo>/.worktrees/<slug>` from a fresh `origin/<default>`. Types: feat, fix, docs, chore, refactor, test, ci, rescue. Never use `/tmp`, `~/Documents`, `~/.codex/worktrees` or `.claude/worktrees`.
- Push every commit: `git push -u origin <branch>` the first time, `git push` after, then confirm the remote ref equals `HEAD`. A local commit is not a backup.
- Open a draft pull request on the first push, stating purpose, scope and the plan or spec link.
- Hooks run through the d7r dispatcher: main-checkout guard, Gitleaks, then this repository's own hooks. Never skip them, force-push or rewrite pushed history.
- Verify the provider identity before pushing: `d7radmin` on Forgejo, the d7r-LLC identity on GitHub.
- Ignored local files (`.env*`, caches, builds) are disposable; secrets live in 1Password.
- A weekly sweep removes worktrees that are clean, pushed, unlocked and idle for 48 hours. Protect one with `git worktree lock <path>`.
- Full policy: `docs/development-workflow.md`, section "Worktree lifecycle", in the d7r planning repository (decision 0075).
<!-- d7r:git-workflow:end -->
