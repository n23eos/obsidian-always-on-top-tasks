import SwiftUI
import SimpleFocusCore
import UniformTypeIdentifiers

/// The ladder column:
///   +N hidden completed (popup)
///   completed tasks — gray, fading out with age (max 5)
///   active tasks — tree up to 5 levels, color dot on the left of each
///   "+ задача" ghost row to add a new root task
struct ContentView: View {
    static let panelWidth: CGFloat = 300

    @ObservedObject var store: TaskStore
    /// Reports content size so AppDelegate can resize the panel.
    let onSizeChange: (CGSize) -> Void

    @State private var draftTitle = ""
    @State private var isAddingTask = false
    @State private var isHovering = false
    @State private var isOverflowShown = false

    @SwiftUI.FocusState private var isNewTaskFieldFocused: Bool

    init(store: TaskStore, onSizeChange: @escaping (CGSize) -> Void) {
        self.store = store
        self.onSizeChange = onSizeChange
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            overflowButton
            completedRows
            ForEach(store.state.tasks) { task in
                TaskNodeView(store: store, task: task, depth: 1)
            }
            addTaskRow
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .frame(width: Self.panelWidth, alignment: .leading)
        .background(panelBackground)
        .overlay(alignment: .topTrailing) { hoverCloseButton }
        .onHover { isHovering = $0 }
        .background(sizeReporter)
        .onReceive(NotificationCenter.default.publisher(for: .focusTaskEditor)) { _ in
            beginAddingTask()
        }
        .onChange(of: isNewTaskFieldFocused) { _, focused in
            if !focused { closeNewTaskFieldCommittingDraft() }
        }
        .onReceive(NotificationCenter.default.publisher(for: .panelResignedKey)) { _ in
            closeNewTaskFieldCommittingDraft()
        }
        // Drop on free space (between rows / padding) = move block to the end.
        .onDrop(of: [.plainText], isTargeted: nil) { providers in
            guard let provider = providers.first else { return false }
            provider.loadObject(ofClass: NSString.self) { object, _ in
                guard let string = object as? String,
                      let draggedId = UUID(uuidString: string) else { return }
                DispatchQueue.main.async { store.moveTaskToEnd(id: draggedId) }
            }
            return true
        }
    }

    /// Abandoned "new task" field must never stay stuck: commit typed text,
    /// close if empty.
    private func closeNewTaskFieldCommittingDraft() {
        guard isAddingTask else { return }
        let text = draftTitle.trimmingCharacters(in: .whitespaces)
        draftTitle = ""
        isAddingTask = false
        if !text.isEmpty { store.addTask(text) }
    }

    // MARK: - Completed stack (top, faded)

    @ViewBuilder
    private var overflowButton: some View {
        if store.state.overflowCount > 0 {
            Button("ещё \(store.state.overflowCount)…") {
                isOverflowShown = true
            }
            .buttonStyle(.plain)
            .font(.system(size: 10))
            .foregroundStyle(.tertiary)
            .popover(isPresented: $isOverflowShown, arrowEdge: .bottom) {
                OverflowList(
                    tasks: Array(
                        store.state.completed
                            .dropFirst(SimpleFocusCore.FocusState.maxVisibleCompleted)
                    ),
                    onPick: { id in
                        isOverflowShown = false
                        store.restoreCompleted(id: id)
                    }
                )
            }
        }
    }

    private var completedRows: some View {
        // visibleCompleted is newest-first; on screen oldest goes on top.
        let rows = Array(store.state.visibleCompleted.reversed())
        return ForEach(Array(rows.enumerated()), id: \.element.id) { index, task in
            Button {
                store.restoreCompleted(id: task.id)
            } label: {
                HStack(spacing: 5) {
                    Image(systemName: "checkmark")
                        .font(.system(size: 8, weight: .bold))
                    Text(task.title)
                        .strikethrough()
                        .lineLimit(1)
                }
                .font(.system(size: 11))
                .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
            .opacity(fadeOpacity(row: index, of: rows.count))
            .help("Вернуть в работу")
        }
    }

    /// Oldest row is the most transparent — the "fading ladder" effect.
    private func fadeOpacity(row index: Int, of count: Int) -> Double {
        let newest = 0.75
        let oldest = 0.3
        guard count > 1 else { return newest }
        let step = (newest - oldest) / Double(count - 1)
        return oldest + step * Double(index)
    }

    // MARK: - New root task

    @ViewBuilder
    private var addTaskRow: some View {
        if isAddingTask || store.state.tasks.isEmpty {
            TextField("новая задача…", text: $draftTitle)
                .textFieldStyle(.plain)
                .font(.system(size: 13, weight: .semibold))
                .focused($isNewTaskFieldFocused)
                .onSubmit(commitNewTask)
                .onExitCommand { isAddingTask = false }
        } else if isHovering {
            Button {
                beginAddingTask()
            } label: {
                Label("задача", systemImage: "plus")
                    .font(.system(size: 10))
                    .foregroundStyle(.tertiary)
            }
            .buttonStyle(.plain)
        }
    }

    private func beginAddingTask() {
        draftTitle = ""
        isAddingTask = true
        NotificationCenter.default.post(name: .panelNeedsKey, object: nil)
        DispatchQueue.main.async { isNewTaskFieldFocused = true }
    }

    private func commitNewTask() {
        let title = draftTitle
        draftTitle = ""
        guard !title.trimmingCharacters(in: .whitespaces).isEmpty else {
            // Empty Enter closes the field.
            isAddingTask = false
            isNewTaskFieldFocused = false
            return
        }
        store.addTask(title)
        // Stay in the field so several tasks can be typed in a row.
        isNewTaskFieldFocused = true
    }

    // MARK: - Chrome

    private var panelBackground: some View {
        RoundedRectangle(cornerRadius: 12, style: .continuous)
            .fill(.ultraThinMaterial)
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(.white.opacity(0.08))
            )
    }

    @ViewBuilder
    private var hoverCloseButton: some View {
        if isHovering {
            Button {
                NotificationCenter.default.post(name: .hidePanel, object: nil)
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 11))
                    .foregroundStyle(.tertiary)
            }
            .buttonStyle(.plain)
            .padding(4)
            .help("Скрыть панель (вернуть — из меню-бара или ⌘⇧L)")
        }
    }

    private var sizeReporter: some View {
        GeometryReader { proxy in
            Color.clear.preference(key: ContentSizeKey.self, value: proxy.size)
        }
        .onPreferenceChange(ContentSizeKey.self, perform: onSizeChange)
    }
}

private struct ContentSizeKey: PreferenceKey {
    static var defaultValue: CGSize = .zero
    static func reduce(value: inout CGSize, nextValue: () -> CGSize) {
        value = nextValue()
    }
}
