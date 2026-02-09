# Arda V2 Jira Import Pack

Files in this folder:
- `arda_v2_jira_issues.csv`
- `arda_v2_jira_dependencies.csv`

## 1) Import issues CSV
1. Open Jira CSV import.
2. Use `arda_v2_jira_issues.csv`.
3. Map fields:
- `Project Key` -> Project
- `Issue Type` -> Issue Type
- `Summary` -> Summary
- `Description` -> Description
- `Epic Name` -> Epic Name (for Epic rows)
- `Story Points` -> Story Points
- `Sprint` -> Sprint
- `Priority` -> Priority
- `Labels` -> Labels
- `Acceptance Criteria` -> custom field or append to Description
4. Keep `External ID` mapped to a custom field such as `External ID` so dependencies can be resolved later.

## 2) Link stories to epics
The file includes `Epic External ID` values.
- If your importer supports epic linking by external identifier then map `Epic External ID` to Epic Link.
- If not then bulk update after import:
1. Export imported issues with `External ID` and Jira issue key.
2. Build an external-id-to-key lookup.
3. Update each story Epic Link based on its `Epic External ID`.

## 3) Import dependency links
Use `arda_v2_jira_dependencies.csv` after issue keys are known.
- `Source External ID` is the issue that blocks.
- `Target External ID` is the issue being blocked.

Recommended post import process:
1. Export issue key and External ID.
2. Replace external IDs in dependency file with actual Jira keys.
3. Import links with link type `blocks`.

## Notes
- The `Project Key` is set to `ARDA` as a placeholder. Replace it if needed.
- Sprints are pre-labeled by week ranges from the 12 week plan.
