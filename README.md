# Spotlight

A personal, browser-only planner for leader–follower dance rounds. Open `index.html` directly in a modern browser. No installation, server, network connection, or build step is needed.

1. Enter leaders and followers, one name per line, and click **Update participants**. Each person can have only one role; duplicate names are checked without regard to case and surrounding whitespace.
2. Tap a number in the history matrix to increase it by one. Enable **Edit counts** to type a value or correct a count. Counts start at zero and must be non-negative whole numbers.
3. Choose a positive number of rounds and click **Generate rounds**. Review, regenerate, or discard freely; none of these actions changes history.
4. After dancing, click **Add rounds to history**. A plan can be recorded only once. Editing participants or history makes an unrecorded plan outdated, including edits that have not yet been applied.

Dancers are saved to local storage when you click **Update participants**. Valid history edits and recorded rounds are saved automatically. Reloading restores dancers and history; generated plans and unapplied roster edits are not saved. File import and export are currently unavailable.

Use **Clear saved data** and confirm to remove saved dancers and history and reset the current page, including its generated plan. This removes only this app's storage entry. If clearing fails, the current data is kept and an error is shown.

Storage is specific to the browser and location where the app is opened. Moving `index.html` or switching browsers may use different storage. When storage is blocked or a save fails, the app still works in memory and displays a storage error. Invalid saved data is rejected on startup.

Removing a participant removes their history; counts for remaining pairs are preserved, including when lists are reordered. Blank lists are allowed while setting up, but generation requires both roles. Internal blank lines are rejected as empty names.

## Pairing rules

A round contains as many pairings as there are people in the larger role pool. Everyone in that pool dances once. Each person in the smaller pool dances either `floor(larger / smaller)` or `ceil(larger / smaller)` times, with no duplicate pair inside a round.

A minimum-cost flow assignment first ensures coverage and balanced per-round appearances, then balances extra appearances across the generated plan, then minimizes total shared-dance counts. Random costs break equally good choices. Each generated round updates a private working copy of the counts for subsequent rounds. Entered history stays unchanged until recording. Counts do not represent dates or recency. Regeneration may return the same pairings when choices are constrained.

## Files and checks

- `index.html`, `styles.css`, `app.js`: responsive interface and session state.
- `pairing.js`: roster and history validation, pairing generation, and recording; shared between the browser and tests.
- `tests/*.test.cjs`: automated checks, runnable with Node 18+:

```sh
node --test tests/*.test.cjs
```

Counts must fit JavaScript's safe integer range; overflow is rejected before history is changed.

For a browser smoke test, open the file at desktop and phone widths; try uneven rosters, edit a count after generation, and record a regenerated plan. Check that recording becomes unavailable after an edit or successful recording, wide history tables scroll inside their card, reloading restores dancers and history without a generated plan, and clearing saved data keeps the roster empty after another reload.
