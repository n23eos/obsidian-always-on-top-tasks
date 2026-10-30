// Browser regression runner for the real view and CSS, using synthetic notes only.
export async function runHierarchyQA({ view, plugin, getContent, setContent }) {
  const original = getContent();
  const settings = { ...plugin.settings };
  const frame = document.querySelector('.window');
  const width = frame.style.width;
  const checks = [];
  const assert = (ok, label) => { if (!ok) throw new Error(label); checks.push(label); };
  try {
    plugin.settings = { ...settings, hideCompleted: false, focusSessionsEnabled: false };
    setContent('- [ ] Parent ⏱️ 0:01:00\n\t- [ ] Child\n\t\t- [ ] Grandchild\n    - [ ] Sibling\n- [ ] Root sibling');
    for (const size of [240, 340]) {
      frame.style.width = `${size}px`;
      for (const showEmojiButton of [true, false]) {
        plugin.settings.showEmojiButton = showEmojiButton;
        await view.render();
        const rows = [...view.contentEl.querySelectorAll('.tfa-task')];
        const x = rows.map(row => row.querySelector('.tfa-check').getBoundingClientRect().x);
        assert(x[0] === x[4], `root alignment ${size}/${showEmojiButton}`);
        assert(x[1] === x[3] && x[1] > x[0] && x[2] > x[1], `nested alignment ${size}/${showEmojiButton}`);
        assert(view.contentEl.scrollWidth <= view.contentEl.clientWidth, `no horizontal overflow ${size}/${showEmojiButton}`);
        const fold = rows[0].querySelector('.tfa-fold').getBoundingClientRect();
        assert(fold.right <= rows[0].querySelector('.tfa-check').getBoundingClientRect().left, `fold gutter ${size}/${showEmojiButton}`);
      }
    }
    const source = getContent();
    const parent = view.contentEl.querySelector('.tfa-fold');
    parent.click();
    await view.render();
    assert(view.contentEl.querySelectorAll('.tfa-task').length === 2, 'collapse hides descendants');
    view.contentEl.querySelector('.tfa-fold').click();
    await view.render();
    assert(view.contentEl.querySelectorAll('.tfa-task').length === 5, 'expand restores descendants');
    assert(getContent() === source, 'fold does not edit note');
    setContent(Array.from({ length: 200 }, (_, i) => `- Group ${i}\n  - [ ] Parent ${i}\n    - [ ] Child ${i}\n  - [ ] Sibling ${i}`).join('\n'));
    const times = [];
    for (let i = 0; i < 10; i++) {
      const start = performance.now();
      await view.render();
      void view.contentEl.offsetHeight;
      times.push(performance.now() - start);
      assert(view.contentEl.querySelectorAll('.tfa-task').length === 600, `stable large render ${i}`);
    }
    times.sort((a, b) => a - b);
    return { checks: checks.length, tasks: 600, medianMs: times[5], maxMs: times.at(-1) };
  } finally {
    setContent(original);
    plugin.settings = settings;
    frame.style.width = width;
    await view.render();
  }
}
