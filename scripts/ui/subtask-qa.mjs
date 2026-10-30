export async function runSubtaskQA({ view, plugin, getContent, setContent, failNextWrite }) {
  const original = getContent();
  const settings = { ...plugin.settings };
  const frame = document.querySelector('.window');
  const width = frame.style.width;
  const checks = [];
  const assert = (ok, label) => { if (!ok) throw new Error(label); checks.push(label); };
  const until = async (condition) => {
    for (let i = 0; i < 200; i++) { if (condition()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
    throw new Error('UI did not settle');
  };
  try {
    plugin.settings = { ...settings, hideCompleted: false, focusSessionsEnabled: false };
    const source = '- [ ] Parent\n  - [ ] Existing\n- [ ] Sibling';
    setContent(source);
    for (const size of [240, 340]) {
      frame.style.width = `${size}px`;
      await view.render();
      const row = view.contentEl.querySelector('.tfa-task');
      assert(row.getBoundingClientRect().height <= 38, `compact single-line row ${size}`);
      const buttons = row.querySelectorAll('.tfa-task-actions button');
      assert(buttons.length === 2, `play and plus ${size}`);
      assert(view.contentEl.scrollWidth <= view.contentEl.clientWidth, `no overflow ${size}`);
      row.querySelector('.tfa-add-child').focus();
      assert(getComputedStyle(buttons[0]).opacity === '1', `keyboard actions ${size}`);
    }
    view.contentEl.querySelector('.tfa-add-child').click();
    let input = view.contentEl.querySelector('.tfa-subtask-editor input');
    input.value = 'Draft';
    await view.render();
    assert(input.isConnected && input.value === 'Draft', 'render preserves draft');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert(!view.contentEl.querySelector('.tfa-subtask-editor') && getContent() === source, 'escape cancels');
    await view.render();
    view.contentEl.querySelector('.tfa-fold').click();
    await view.render();
    view.contentEl.querySelector('.tfa-add-child').click();
    input = view.contentEl.querySelector('.tfa-subtask-editor input');
    input.value = 'New child';
    failNextWrite();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await until(() => !input.disabled);
    assert(input.isConnected && !input.disabled && input.value === 'New child', 'failed write retains editable draft');
    assert(getContent() === source, 'failed write unchanged');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await until(() => !view.contentEl.querySelector('.tfa-subtask-editor'));
    await view.render();
    assert(getContent() === '- [ ] Parent\n  - [ ] New child\n  - [ ] Existing\n- [ ] Sibling', 'insert exactly one child');
    assert(view.contentEl.querySelectorAll('.tfa-task').length === 4, 'saved child expands collapsed parent');
    assert(!view.contentEl.querySelector('.tfa-subtask-editor'), 'saved editor closes');
    const sibling = [...view.contentEl.querySelectorAll('.tfa-task')].at(-1);
    sibling.querySelector('.tfa-timer').click();
    await until(() => plugin.timers.running !== null);
    await view.render();
    view.contentEl.querySelector('.tfa-add-child').click();
    input = view.contentEl.querySelector('.tfa-subtask-editor input');
    input.value = 'Another child';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await until(() => !view.contentEl.querySelector('.tfa-subtask-editor'));
    await until(() => plugin.timers.running?.lineNo === 4);
    assert(plugin.timers.running.lineText === '- [ ] Sibling', 'running timer reanchored after insertion');
    await view.render();
    const stop = view.contentEl.querySelector('.tfa-timer-on');
    assert(stop && getComputedStyle(stop).opacity !== '0', 'stop remains visible');
    await plugin.timers.stop();
    assert(getContent().split('\n')[4].startsWith('- [ ] Sibling'), 'timer commits to original sibling');
    return { checks: checks.length };
  } finally {
    view.dismissSubtaskEditor?.();
    setContent(original);
    plugin.settings = settings;
    frame.style.width = width;
    await view.render();
  }
}
