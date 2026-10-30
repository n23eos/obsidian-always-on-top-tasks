import { view, plugin, file } from "../../scripts/ui/preview.mjs";
const mode = new URLSearchParams(location.search).get("feature") ?? "focus";
const demos = {
 focus: ["Keep the next step in sight.", "A compact task panel that stays with your work.", "01 / FOCUS & TIME", "Start one timer. Keep your place.", "Work through nested tasks, mark progress with emoji, and save elapsed time in your Markdown note."],
 subtasks: ["Break it down. Keep moving.", "Add the next step without leaving the panel.", "02 / INLINE SUBTASKS", "One click to a smaller task.", "Hover over a task and choose +. Enter saves a new subtask; Escape cancels. Fold a branch when you need less detail."],
 appearance: ["Make room for your work.", "A quiet control for a comfortable panel.", "03 / APPEARANCE", "One slider. Two simple modes.", "Click the eye to switch to text size. Click the magnifying glass to return to transparency. Both settings are saved."]
};
const copy = demos[mode];
for (const [i,id] of ["headline","subtitle","eyebrow","feature-title","feature-copy"].entries()) document.getElementById(id).textContent=copy[i];
file.basename = "Today's focus";
file.path = "Demo.md";
const source = ["- [ ] 🔵 Launch the project website ⏱️ 0:24:10", "  - [x] Draft the page structure ⏱️ 0:08:40", "  - [ ] Refine the first screen", "    - [ ] Write a clearer headline", "    - [ ] Choose the cover image", "  - [ ] Test the mobile layout", "- [ ] 🟢 Review customer feedback", "- [ ] Plan tomorrow's first task"].join("\n");
plugin.app.vault.read = async () => source;
plugin.app.vault.cachedRead = async () => source;
plugin.settings = {...plugin.settings, fontSize:15, showEmojiButton:true, focusSessionsEnabled:false, hideCompleted:false};
await view.setState({filePath:file.path}, {});
if(mode === "focus") {
 await plugin.timers.start(file.path, 2, source.split("\n")[2]);
 await view.render();
} else if(mode === "subtasks") {
 view.contentEl.querySelectorAll(".tfa-add-child")[2].click();
 view.contentEl.querySelector(".tfa-subtask-editor input").value="Check the navigation on a phone";
} else {
 view.contentEl.querySelector(".tfa-slider-mode").click();
}
document.body.dataset.ready="true";
