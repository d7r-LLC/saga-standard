# Common Gotchas & Patterns

## Secret Scanning / Test Tokens

| Issue                              | Solution                                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| GitGuardian flags test JWT tokens  | Never use `eyJ...` base64 segments in test tokens — use plain strings like `'test-token-123'` or `'fake-test.token-with.dots'` |
| Gitleaks misses JWT patterns       | Custom rule added to `.gitleaks.toml` for `Bearer eyJ...` — keep it updated when new credential patterns appear                |
| Test token looks like real API key | Avoid format patterns: `sk_live_*`, `ghp_*`, `AKIA*`, `xoxb-*`. Use obviously fake strings                                     |
| Bearer token in test headers       | Use `'Bearer test-token-123'`, never `'Bearer eyJhbG...'`                                                                      |

## Git Operations — Preserving Work

| Issue                                       | Solution                                                                                                              |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `git stash` loses uncommitted files         | ALWAYS run `git status` before stashing, note all files. After `git stash pop`, verify all files restored             |
| `git stash pop` conflict doesn't drop stash | Stash is preserved on conflict. Resolve, verify ALL files, then `git stash drop` manually                             |
| `git checkout` refuses with dirty tree      | Stash with `-u` (includes untracked), switch branch, then pop. Never use `git checkout .` to force — it destroys work |
| Untracked files lost during stash           | Use `git stash -u` to include untracked files, or `git stash --all` for ignored files too                             |
| Branch cleanup deletes uncommitted work     | Always verify working tree is clean or stashed BEFORE deleting branches or pruning worktrees                          |
