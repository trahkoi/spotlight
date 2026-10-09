# Browser Spotlight App Plan

## Scope

Build a standalone HTML, CSS, and JavaScript app that runs entirely in the browser for personal use. The user supplies participants and history, then generates one or more rounds of leader–follower pairings.

- No backend, database, accounts, or initial history.
- Each participant dances only one role.
- Start fresh; do not import the old CLI database automatically.
- No build step; opening `index.html` should work.

## 1. Participants

Provide two editable lists: leaders and followers.

- Add names individually or paste several names, one per line.
- Validate empty and duplicate names, including names entered in both roles.
- Preserve history for participants who remain when lists are edited.

## 2. History

Provide an editable matrix with leaders as rows and followers as columns. Each cell contains the number of times that pair has danced together, initially zero. Accept only non-negative whole numbers.

Confirmed behavior: use pairing counts rather than individual dated records. Drop the CLI's date-based recency penalty because counts alone do not indicate when a pair last danced.

## 3. Generate Rounds

Allow the user to choose a positive number of rounds and generate a plan.

- Each round includes every participant at least once.
- When role counts differ, participants on the smaller side repeat. Spread extra dances as evenly as possible.
- Prefer pairs with fewer previous dances together.
- Include earlier generated rounds in the working counts used to generate later rounds, without changing entered history.
- Randomize equally good choices.
- Avoid repeating the same pair within a round.

Confirmed definition: one round is a complete pass covering everyone, even when some participants need additional dances. This differs from the CLI's internal matching sub-rounds.

## 4. Review and Record

Display each round as a clear, numbered list of pairings.

- Regenerate the plan without changing entered history.
- Discard the plan.
- Provide an “Add rounds to history” action after dancing to update the counts.
- Prevent applying the same plan twice.
- Mark a plan as outdated if its participants or input history change, and prevent recording it until regenerated.

## 5. Local Storage

Save applied dancer lists and valid history counts to browser local storage. Restore validated data on reload. Generated plans and unapplied roster edits remain temporary.

Provide a clear-data action that removes this app's saved dancers and history and resets the current page after confirmation. Show storage failures without losing the working data.

File import and export are deferred for now.

## 6. Implementation

Use plain HTML, responsive CSS, and JavaScript. Keep pairing logic separate from interface code.

Suggested implementation sequence:

1. Build participant entry and validation.
2. Add the editable history matrix and state management.
3. Implement pairing generation and multi-round working counts.
4. Add results, regeneration, discard, and recording actions.
5. Refine responsive layout and verify the complete workflow.

## 7. Verification

Verify:

- Equal and unequal role counts, including one participant on the smaller side.
- Coverage, balanced extra dances, and pair variety across multiple rounds.
- Empty inputs, duplicate names, and invalid history counts.
- Generation and regeneration leave entered history unchanged.
- Recording updates history exactly once.
- Changes to participants or history invalidate an existing plan.
- Reloading restores dancers and history, but not generated plans.
- Clearing saved data resets dancers, history, and results; a subsequent reload remains empty.
- Malformed saved data and unavailable storage do not break the app.
- No file import or export controls are shown.
- The interface works at desktop and phone widths.
- The app works by opening `index.html` directly, with no backend or build step.

## Confirmed Decisions

Both decisions were confirmed by the user:

1. History consists of pairing counts only, with no dates or recency penalty.
2. A round covers everyone, with extra dances assigned to the smaller role pool when numbers differ.
