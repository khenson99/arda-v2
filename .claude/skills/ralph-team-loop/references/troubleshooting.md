# Troubleshooting Guide

Common issues and solutions when running the Ralph Team Loop.

---

## Setup Issues

### `jq: command not found`

**Cause:** jq is not installed.

**Fix:**
```bash
# macOS
brew install jq

# Ubuntu/Debian
sudo apt-get install jq

# Arch
sudo pacman -S jq
```

### `gh: command not found`

**Cause:** GitHub CLI is not installed or not in PATH.

**Fix:**
```bash
# macOS
brew install gh

# Ubuntu/Debian
sudo apt-get install gh

# Then authenticate:
gh auth login
```

### `codex: command not found`

**Cause:** OpenAI Codex CLI is not installed.

**Fix:**
```bash
npm install -g @openai/codex
```

### `claude: command not found`

**Cause:** Claude Code CLI is not installed.

**Fix:**
```bash
npm install -g @anthropic-ai/claude-code
```

### init.sh fails with "not in a git repo"

**Cause:** You're not in a git repository root.

**Fix:**
```bash
cd /path/to/your/repo
git status  # verify you're in a repo
./path/to/scripts/init.sh
```

---

## Planner Issues

### Planner creates duplicate issues

**Cause:** The planner didn't properly check existing issues.

**Fix:** Run the planner again — it checks for existing issues each iteration. If duplicates exist, close them manually:
```bash
gh issue close ISSUE_NUMBER --comment "Duplicate of #OTHER_NUMBER"
```

### Planner doesn't detect PRD items

**Cause:** PRD format may be non-standard.

**Fix:** Ensure your PRD uses clear section headers and numbered/bulleted requirements. The planner works best with:
```markdown
## Feature: User Authentication
- [ ] Login with email/password
- [ ] Password reset flow
- [ ] Session management with JWT
```

### Planner hits max iterations without completing

**Cause:** PRD is very large, or issues are complex.

**Fix:**
1. Increase iterations: `--planner-iterations 20`
2. Or split the PRD into smaller sections
3. Check `.ralph-team/progress.txt` to see what was completed

---

## Team Issues

### Agent loops without making progress

**Cause:** Agent is stuck in a pattern (failing tests, unclear requirements).

**Fix:**
1. Check the agent's output in the terminal
2. Look at `.ralph-team/agents/{role}.md` for accumulated knowledge
3. Add clarification to the GitHub issue
4. Consider reducing ticket scope

### "BLOCKED" status on a ticket

**Cause:** Agent encountered a dependency or technical blocker.

**Fix:**
1. Check `team-state.json` for the `blocked_reason`
2. Resolve the blocker manually or reassign the ticket
3. Update the issue with additional context
4. Re-run the team loop: `./scripts/run-all.sh --prd PRD.md --phase team`

### Agent writes code that doesn't match the stack

**Cause:** Stack detection may have been incorrect.

**Fix:**
1. Check `.ralph-team/config.json` — verify `detected_stack` is correct
2. Edit `config.json` manually if needed
3. Re-run the team loop

### Too many iterations used on one ticket

**Cause:** Ticket is too large, acceptance criteria unclear, or agent is struggling.

**Fix:**
1. Default max is 20 iterations per agent per ticket
2. Break the ticket into smaller sub-tickets
3. Add more specific acceptance criteria
4. Add technical hints to the issue body

### Frontend engineer ignores design system

**Cause:** Design system config may be incomplete or agent didn't read it.

**Fix:**
1. Verify `.ralph-team/design-system.json` exists and has your tokens
2. The Design Enforcer should catch violations in review
3. Update the design system config with any missing tokens/components

---

## Reviewer Issues

### Reviewer approves everything without thorough review

**Cause:** PR diffs may be too large for the model to process, or prompt needs tuning.

**Fix:**
1. Keep PRs small (one ticket = one PR)
2. Check that the reviewer agent spec in `agents/reviewer.md` has your quality criteria
3. Add specific review requirements to `.ralph-team/progress.txt`

### Reviewer rejects everything

**Cause:** Review criteria may be too strict, or there's a misunderstanding of the codebase patterns.

**Fix:**
1. Check reviewer feedback — is it valid?
2. If patterns are unfamiliar, add them to `.ralph-team/agents/reviewer.md`
3. Add codebase conventions to `.ralph-team/progress.txt`

### Merge conflicts when reviewer tries to merge

**Cause:** Multiple agents working on overlapping files.

**Fix:**
1. The Architect should assign non-overlapping tickets
2. If conflicts occur, the engineer agent should rebase
3. Manual resolution: `git checkout PR_BRANCH && git rebase main`

---

## Multi-Repo Issues

### Agents can't find the other repo

**Cause:** `config.json` repos field is incorrect.

**Fix:**
1. Verify `repos` in `.ralph-team/config.json`
2. Ensure both repos are cloned locally
3. Ensure `gh` has access to both repos

### Frontend depends on backend API that doesn't exist yet

**Cause:** Dependency ordering issue — backend ticket should be done first.

**Fix:**
1. Architect should assign backend tickets before dependent frontend tickets
2. Use issue labels to mark dependencies: `depends-on: #ISSUE`
3. Frontend engineer can mock APIs while waiting

---

## Performance Issues

### Loop runs too slowly

**Cause:** Each agent call takes time for the LLM to respond.

**Fix:**
1. Reduce max iterations for quick tasks
2. Keep tickets atomic and small
3. Use `--cycles 1` for the first pass, then iterate

### Hit API rate limits

**Cause:** Too many concurrent calls to Claude/Codex APIs.

**Fix:**
1. The scripts include `sleep` between calls — increase if needed
2. Run during off-peak hours
3. Consider batching smaller tickets

---

## Recovery

### Resuming after a crash

The system is designed to be resumable:

```bash
# Resume from team phase (planner already done)
./scripts/run-all.sh --prd PRD.md --phase team

# Resume from reviewer phase
./scripts/run-all.sh --prd PRD.md --phase reviewer

# Re-run everything (planner will skip existing issues)
./scripts/run-all.sh --prd PRD.md
```

### Resetting state

```bash
# Soft reset (keep config, clear progress)
> .ralph-team/progress.txt
echo '{"sprint":{"id":"sprint-001","status":"in_progress"},"tickets":[],"agents":{},"last_updated":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}' > .ralph-team/team-state.json

# Hard reset (re-initialize everything)
rm -rf .ralph-team
./scripts/init.sh
```

### Viewing current state

```bash
# See ticket statuses
jq '.tickets[] | {issue: .issue_number, title: .title, status: .status, agent: .assigned_to}' .ralph-team/team-state.json

# See agent statuses
jq '.agents' .ralph-team/team-state.json

# See progress log
cat .ralph-team/progress.txt

# See open GitHub issues
gh issue list --state open

# See open PRs
gh pr list --state open
```
