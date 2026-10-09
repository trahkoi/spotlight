'use strict';
(() => {
  const S = window.Spotlight, $ = id => document.getElementById(id);
  let state = S.empty(), plan = null, dirtyRoster = false;
  const invalidHistory = new Set();
  const storageKey = 'spotlight.session.v1';
  const savedNote = 'Dancers and history are saved in this browser. Generated rounds are not saved.';
  function storageStatus(text, failed = false) {
    $('storage-status').textContent = text;
    $('storage-status').classList.toggle('error', failed);
  }
  function save() {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(S.validate(state)));
      storageStatus(savedNote);
    } catch {
      storageStatus('Could not save dancers and history. Current changes are only in this tab; reloading may restore older data.', true);
    }
  }
  function restore() {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored !== null) state = S.validate(JSON.parse(stored));
      storageStatus(savedNote);
    } catch {
      storageStatus('Saved data could not be loaded. This tab starts empty. Updating participants will try to save new data.', true);
    }
    $('leaders').value = state.leaders.join('\n');
    $('followers').value = state.followers.join('\n');
  }
  function message(text, error = false) {
    $('message').textContent = text;
    $('message').classList.toggle('error', error);
    $('message').setAttribute('role', error ? 'alert' : 'status');
  }
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function invalidate() {
    if (plan && !plan.recorded) plan.outdated = true;
    renderPlanState();
  }
  function ready() {
    if (dirtyRoster) throw new Error('Update participants to apply your edited lists first.');
    if (invalidHistory.size) throw new Error('Correct the highlighted history counts first. Use non-negative whole numbers.');
  }
  function renderPlanState() {
    $('plan-actions').hidden = !plan;
    $('generate').textContent = plan ? 'Generate new rounds' : 'Generate rounds';
    $('record').disabled = !plan || plan.recorded || plan.outdated || dirtyRoster || invalidHistory.size > 0;
    $('record').textContent = plan?.recorded ? 'Added to history' : 'Add rounds to history';
    $('plan-status').textContent = !plan ? 'No plan' : plan.recorded ? 'Recorded' : plan.outdated ? 'Outdated' : 'Not recorded';
    $('plan-note').textContent = !plan ? 'Add dancers, set history, then generate rounds.' : plan.recorded ? 'These rounds have been added to history.' : plan.outdated ? 'Participants or history changed. Regenerate before adding these rounds to history.' : `${plan.rounds.length} round${plan.rounds.length === 1 ? '' : 's'} · Leaders on the left, followers on the right. Record after dancing.`;
  }
  function renderHistory() {
    invalidHistory.clear();
    $('leader-count').textContent = state.leaders.length;
    $('follower-count').textContent = state.followers.length;
    const container = $('history'); container.replaceChildren();
    if (!state.leaders.length || !state.followers.length) {
      container.append(element('p', 'Add at least one leader and one follower to edit history.', 'empty'));
      return;
    }
    container.tabIndex = 0;
    container.setAttribute('role', 'region'); container.setAttribute('aria-label', 'Pairing history, scroll for more participants');
    const table = element('table'), head = element('thead'), header = element('tr');
    header.append(element('th', 'Leader / Follower'));
    state.followers.forEach(name => { const th = element('th', name); th.scope = 'col'; header.append(th); });
    head.append(header); table.append(head);
    const body = element('tbody');
    state.leaders.forEach((name, l) => {
      const row = element('tr'), th = element('th', name); th.scope = 'row'; row.append(th);
      state.followers.forEach((follower, f) => {
        const cell = element('td'), input = element('input');
        input.type = 'number'; input.min = '0'; input.step = '1'; input.required = true;
        input.value = state.history[l][f]; input.inputMode = 'numeric';
        input.setAttribute('aria-label', `Shared dances: ${name} and ${follower}`);
        const counter = element('button', undefined, 'history-count');
        counter.type = 'button';
        function updateCounter() {
          counter.textContent = String(state.history[l][f]);
          counter.setAttribute('aria-label', `Add a shared dance: ${name} and ${follower}. Current count: ${state.history[l][f]}`);
          counter.disabled = state.history[l][f] >= Number.MAX_SAFE_INTEGER;
        }
        input.hidden = !$('edit-counts').checked;
        counter.hidden = $('edit-counts').checked;
        function updateHistory() {
          invalidate();
          const id = `${l}:${f}`;
          try {
            if (!/^\d+$/.test(input.value)) throw new Error('Use a non-negative whole number.');
            const value = S.count(Number(input.value));
            state.history[l][f] = value; invalidHistory.delete(id);
            save();
            input.removeAttribute('aria-invalid'); input.setCustomValidity('');
            if (!invalidHistory.size) message('History updated.');
          } catch (error) {
            invalidHistory.add(id); input.setAttribute('aria-invalid', 'true');
            input.setCustomValidity(error.message); message(error.message, true);
          }
          updateCounter();
          renderPlanState();
        }
        input.addEventListener('input', updateHistory);
        counter.addEventListener('click', () => {
          if (counter.disabled) return;
          input.value = String(state.history[l][f] + 1);
          updateHistory();
        });
        updateCounter();
        cell.append(input);
        cell.append(counter); row.append(cell);
      });
      body.append(row);
    });
    table.append(body); container.append(table);
  }
  function renderResults() {
    $('results').replaceChildren();
    if (plan) plan.rounds.forEach((pairs, r) => {
      const card = element('article', undefined, 'round'); card.append(element('h3', `Round ${r + 1}`));
      const list = element('ol');
      pairs.forEach(([l, f]) => {
        const item = element('li'), pair = element('div', undefined, 'pair');
        pair.append(element('span', plan.leaders[l]), element('span', '↔'), element('span', plan.followers[f]));
        item.append(pair); list.append(item);
      });
      card.append(list); $('results').append(card);
    });
    renderPlanState();
  }
  function lines(value) {
    if (!value.trim()) return [];
    // A trailing newline is natural when pasting; internal blank names are errors.
    return value.trim().split(/\r?\n/).map(name => name.trim());
  }
  for (const id of ['leaders', 'followers']) $(id).addEventListener('input', () => {
    dirtyRoster = true; invalidate();
    $('roster-note').textContent = 'You have unapplied edits. Update participants before generating.';
  });
  $('roster-form').addEventListener('submit', event => {
    event.preventDefault();
    try {
      if (invalidHistory.size) throw new Error('Correct the highlighted history counts before updating participants.');
      const next = S.updateRoster(state, lines($('leaders').value), lines($('followers').value));
      if (JSON.stringify(next) !== JSON.stringify(state)) invalidate();
      state = next; dirtyRoster = false;
      $('leaders').value = state.leaders.join('\n'); $('followers').value = state.followers.join('\n');
      $('roster-note').textContent = 'Participants updated. Counts for remaining pairs are kept.';
      renderHistory(); renderPlanState(); save(); message('Participants updated.');
    } catch (error) { message(error.message, true); }
  });
  function generate() {
    try {
      ready();
      if (!/^\d+$/.test($('round-count').value)) throw new Error('Choose a positive whole number of rounds.');
      plan = S.generate(state, Number($('round-count').value));
      renderResults(); message('Rounds generated. Entered history has not changed.');
    } catch (error) { message(error.message, true); }
  }
  $('generate-form').addEventListener('submit', event => { event.preventDefault(); generate(); });
  $('regenerate').addEventListener('click', generate);
  $('discard').addEventListener('click', () => { plan = null; renderResults(); message('Plan discarded. History has not changed.'); });
  $('record').addEventListener('click', () => {
    try { ready(); state = S.record(state, plan); renderHistory(); renderPlanState(); save(); message('Rounds added to history exactly once.'); }
    catch (error) { message(error.message, true); }
  });
  $('edit-counts').addEventListener('change', () => {
    if (invalidHistory.size) {
      $('edit-counts').checked = true;
      message('Correct the highlighted history counts first.', true);
      return;
    }
    renderHistory();
  });
  $('clear-data').addEventListener('click', () => {
    if (!window.confirm('Clear all dancers and history saved in this browser? This also removes the current dancers, history, and generated rounds.')) return;
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      storageStatus('Could not clear saved data. Dancers and history have not been changed.', true);
      return;
    }
    state = S.empty(); plan = null; dirtyRoster = false;
    $('edit-counts').checked = false;
    $('leaders').value = ''; $('followers').value = '';
    $('roster-note').textContent = 'Edit these lists anytime. Counts for remaining pairs are kept.';
    renderHistory(); renderResults();
    storageStatus(savedNote);
    message('Saved dancers and history cleared.');
  });
  restore();
  renderHistory(); renderResults();
})();
