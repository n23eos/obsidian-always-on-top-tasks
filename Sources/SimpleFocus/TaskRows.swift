import SwiftUI
import SimpleFocusCore
import UniformTypeIdentifiers

/// One task node + its children, recursively (up to FocusState.maxDepth levels).
/// Row: [color dot] [title] …hover: [+ sub] [✓] [×]
struct TaskNodeView: View {
    @ObservedObject var store: TaskStore
    let task: FocusTask
    let depth: Int // 1-based

    @State private var isEditing = false
    @State private var draftTitle = ""
    @State private var isAddingChild = false
    @State private var draftChild = ""
    @State private var isHovering = false
    @State private var isPickingColor = false
    @State private var isDropTargeted = false

    @SwiftUI.FocusState private var focusedField: Field?
    private enum Field { case title, child }

    init(store: TaskStore, task: FocusTask, depth: Int) {
        self.store = store
        self.task = task
        self.depth = depth
    }

    private var indent: CGFloat { CGFloat(depth - 1) * 14 }
    private var fontSize: CGFloat { depth == 1 ? 13 : 11 }
    private var isRoot: Bool { depth == 1 }

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            row
            addChildField
            ForEach(task.subtasks) { child in
                TaskNodeView(store: store, task: child, depth: depth + 1)
            }
        }
    }

    // MARK: - Row

    private var row: some View {
        HStack(spacing: 6) {
            colorDot

            if isEditing {
                TextField("задача…", text: $draftTitle)
                    .textFieldStyle(.plain)
                    .font(.system(size: fontSize, weight: isRoot ? .semibold : .regular))
                    .focused($focusedField, equals: .title)
                    .onSubmit(commitRename)
                    .onExitCommand { isEditing = false }
            } else {
                Text(task.title)
                    .font(.system(size: fontSize, weight: isRoot ? .semibold : .regular))
                    .strikethrough(task.isDone)
                    .foregroundStyle(task.isDone ? AnyShapeStyle(.tertiary) : AnyShapeStyle(.primary))
                    .lineLimit(1)
                    .contentShape(Rectangle())
                    .onTapGesture(perform: beginRename)
                    .help("Нажми, чтобы изменить")
            }

            Spacer(minLength: 0)

            if isHovering && !isEditing {
                hoverControls
            }
        }
        .padding(.leading, indent)
        .padding(.vertical, 1)
        .background(dropHighlight)
        .contentShape(Rectangle())
        .onHover { isHovering = $0 }
        .onDrag { NSItemProvider(object: task.id.uuidString as NSString) }
        .onDrop(
            of: [.plainText],
            delegate: TaskDropDelegate(
                targetId: task.id,
                store: store,
                isTargeted: $isDropTargeted
            )
        )
        .contextMenu { contextMenuItems }
        .onChange(of: focusedField) { _, newValue in
            handleFocusLoss(nowFocused: newValue)
        }
        .onReceive(NotificationCenter.default.publisher(for: .panelResignedKey)) { _ in
            handleFocusLoss(nowFocused: nil)
        }
    }

    @ViewBuilder
    private var dropHighlight: some View {
        if isDropTargeted {
            RoundedRectangle(cornerRadius: 4, style: .continuous)
                .fill(Color.accentColor.opacity(0.18))
        }
    }

    @ViewBuilder
    private var contextMenuItems: some View {
        Button(isRoot ? "Завершить" : (task.isDone ? "Снова в работу" : "Сделано")) {
            if isRoot {
                store.completeTask(id: task.id)
            } else {
                store.toggleDone(id: task.id)
            }
        }
        if store.state.canAddSubtask(under: task.id) {
            Button("Добавить подзадачу", action: beginAddChild)
        }
        Menu("Цвет") {
            ForEach(ColorTag.allCases, id: \.self) { tag in
                Button(tag.localizedName) { store.setColor(id: task.id, color: tag) }
            }
            Button("Без метки") { store.setColor(id: task.id, color: nil) }
        }
        Divider()
        Button("Удалить", role: .destructive) { store.deleteTask(id: task.id) }
    }

    private var hoverControls: some View {
        HStack(spacing: 6) {
            if store.state.canAddSubtask(under: task.id) {
                Button(action: beginAddChild) {
                    Image(systemName: "plus")
                        .font(.system(size: 9))
                        .foregroundStyle(.tertiary)
                }
                .buttonStyle(.plain)
                .help("Добавить подзадачу")
            }

            Button {
                if isRoot {
                    withAnimation(.easeOut(duration: 0.15)) {
                        store.completeTask(id: task.id)
                    }
                } else {
                    store.toggleDone(id: task.id)
                }
            } label: {
                Image(systemName: "checkmark")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(.tertiary)
            }
            .buttonStyle(.plain)
            .help(isRoot ? "Завершить (уйдёт наверх в серые)" : "Отметить сделанной")

            Button {
                store.deleteTask(id: task.id)
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 8))
                    .foregroundStyle(.tertiary)
            }
            .buttonStyle(.plain)
            .help("Удалить со всеми подзадачами")
        }
    }

    // MARK: - Color dot

    private var colorDot: some View {
        Button {
            isPickingColor = true
        } label: {
            Circle()
                .fill(task.colorTag.map { Color(tag: $0) } ?? .clear)
                .overlay(
                    Circle().strokeBorder(
                        task.colorTag == nil ? Color.secondary.opacity(0.5) : .clear,
                        lineWidth: 1
                    )
                )
                .frame(width: isRoot ? 10 : 8, height: isRoot ? 10 : 8)
        }
        .buttonStyle(.plain)
        .help("Цветная метка")
        .popover(isPresented: $isPickingColor, arrowEdge: .bottom) {
            colorPalette
        }
    }

    private var colorPalette: some View {
        HStack(spacing: 8) {
            ForEach(ColorTag.allCases, id: \.self) { tag in
                Button {
                    store.setColor(id: task.id, color: tag)
                    isPickingColor = false
                } label: {
                    Circle()
                        .fill(Color(tag: tag))
                        .frame(width: 16, height: 16)
                        .overlay(
                            Circle().strokeBorder(
                                .white.opacity(task.colorTag == tag ? 0.9 : 0),
                                lineWidth: 2
                            )
                        )
                }
                .buttonStyle(.plain)
            }
            Button {
                store.setColor(id: task.id, color: nil)
                isPickingColor = false
            } label: {
                Image(systemName: "circle.slash")
                    .font(.system(size: 14))
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
            .help("Без метки")
        }
        .padding(10)
    }

    // MARK: - Add child

    @ViewBuilder
    private var addChildField: some View {
        if isAddingChild {
            TextField("подзадача…", text: $draftChild)
                .textFieldStyle(.plain)
                .font(.system(size: 11))
                .padding(.leading, indent + 16)
                .focused($focusedField, equals: .child)
                .onSubmit(commitChild)
                .onExitCommand { isAddingChild = false }
        }
    }

    // MARK: - Actions

    private func beginRename() {
        draftTitle = task.title
        isEditing = true
        NotificationCenter.default.post(name: .panelNeedsKey, object: nil)
        DispatchQueue.main.async { focusedField = .title }
    }

    private func commitRename() {
        store.renameTask(id: task.id, title: draftTitle)
        isEditing = false
        focusedField = nil
    }

    private func beginAddChild() {
        draftChild = ""
        isAddingChild = true
        NotificationCenter.default.post(name: .panelNeedsKey, object: nil)
        DispatchQueue.main.async { focusedField = .child }
    }

    private func commitChild() {
        let title = draftChild
        draftChild = ""
        guard !title.trimmingCharacters(in: .whitespaces).isEmpty else {
            isAddingChild = false
            focusedField = nil
            return
        }
        store.addTask(title, under: task.id)
        // Stay in the field so several subtasks can be typed in a row.
        focusedField = .child
    }

    /// Abandoned fields must never stay stuck: on blur commit what's typed,
    /// close what's empty.
    private func handleFocusLoss(nowFocused: Field?) {
        if isEditing, nowFocused != .title {
            if draftTitle.trimmingCharacters(in: .whitespaces).isEmpty {
                isEditing = false
            } else {
                commitRename()
            }
        }
        if isAddingChild, nowFocused != .child {
            let text = draftChild.trimmingCharacters(in: .whitespaces)
            draftChild = ""
            isAddingChild = false
            if !text.isEmpty { store.addTask(text, under: task.id) }
        }
    }
}

/// Accepts a dragged task id and inserts the dragged block before this row.
struct TaskDropDelegate: DropDelegate {
    let targetId: UUID
    let store: TaskStore
    @Binding var isTargeted: Bool

    func validateDrop(info: DropInfo) -> Bool {
        info.hasItemsConforming(to: [.plainText])
    }

    func dropEntered(info: DropInfo) { isTargeted = true }
    func dropExited(info: DropInfo) { isTargeted = false }

    func performDrop(info: DropInfo) -> Bool {
        isTargeted = false
        guard let provider = info.itemProviders(for: [.plainText]).first else { return false }
        provider.loadObject(ofClass: NSString.self) { object, _ in
            guard let string = object as? String,
                  let draggedId = UUID(uuidString: string) else { return }
            DispatchQueue.main.async {
                store.moveTask(id: draggedId, before: targetId)
            }
        }
        return true
    }
}

extension ColorTag {
    var localizedName: String {
        switch self {
        case .red: "Красный"
        case .orange: "Оранжевый"
        case .yellow: "Жёлтый"
        case .green: "Зелёный"
        case .blue: "Синий"
        case .purple: "Фиолетовый"
        }
    }
}

extension Color {
    init(tag: ColorTag) {
        switch tag {
        case .red: self = .red
        case .orange: self = .orange
        case .yellow: self = .yellow
        case .green: self = .green
        case .blue: self = .blue
        case .purple: self = .purple
        }
    }
}

/// Popup with completed tasks that didn't fit into the visible five.
struct OverflowList: View {
    let tasks: [FocusTask]
    let onPick: (UUID) -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 4) {
                ForEach(tasks) { task in
                    Button {
                        onPick(task.id)
                    } label: {
                        HStack(spacing: 5) {
                            Image(systemName: "checkmark")
                                .font(.system(size: 8, weight: .bold))
                            Text(task.title).lineLimit(1)
                        }
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                    .help("Вернуть в работу")
                }
            }
            .padding(10)
        }
        .frame(width: 220)
        .frame(maxHeight: 240)
    }
}
