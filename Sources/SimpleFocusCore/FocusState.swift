import Foundation

/// Color marker the user puts on a task ("this is what I'm doing").
public enum ColorTag: String, Codable, CaseIterable, Sendable {
    case red, orange, yellow, green, blue, purple
}

/// A task node: one line of text, optional color, done flag,
/// and children (the whole tree is capped at `FocusState.maxDepth` levels).
public struct FocusTask: Equatable, Codable, Identifiable {
    public let id: UUID
    public let title: String
    public let colorTag: ColorTag?
    public let isDone: Bool
    public let subtasks: [FocusTask]

    public init(
        id: UUID = UUID(),
        title: String,
        colorTag: ColorTag? = nil,
        isDone: Bool = false,
        subtasks: [FocusTask] = []
    ) {
        self.id = id
        self.title = title
        self.colorTag = colorTag
        self.isDone = isDone
        self.subtasks = subtasks
    }

    func copy(
        title: String? = nil,
        colorTag: ColorTag?? = nil,
        isDone: Bool? = nil,
        subtasks: [FocusTask]? = nil
    ) -> FocusTask {
        FocusTask(
            id: id,
            title: title ?? self.title,
            colorTag: colorTag ?? self.colorTag,
            isDone: isDone ?? self.isDone,
            subtasks: subtasks ?? self.subtasks
        )
    }
}

/// Whole app state. Immutable: every operation returns a new value.
public struct FocusState: Equatable, Codable {
    public static let maxTitleLength = 80
    public static let maxVisibleCompleted = 5
    public static let maxDepth = 5

    /// Active root tasks, in user order.
    public let tasks: [FocusTask]
    /// Completed root tasks, newest first.
    public let completed: [FocusTask]

    public static let empty = FocusState(tasks: [], completed: [])

    public init(tasks: [FocusTask], completed: [FocusTask]) {
        self.tasks = tasks
        self.completed = completed
    }

    /// The (at most 5) most recent completed tasks, newest first.
    public var visibleCompleted: [FocusTask] {
        Array(completed.prefix(Self.maxVisibleCompleted))
    }

    /// How many completed tasks are hidden behind the "+N" popup.
    public var overflowCount: Int {
        max(0, completed.count - Self.maxVisibleCompleted)
    }

    /// Whether a child may be added under this node (depth cap).
    public func canAddSubtask(under id: UUID) -> Bool {
        guard let level = Self.level(of: id, in: tasks) else { return false }
        return level < Self.maxDepth
    }

    // MARK: - Operations (all pure)

    /// Add a task: to the root list, or under `parentId` if the depth cap allows.
    public func addingTask(_ rawTitle: String, under parentId: UUID? = nil) -> FocusState {
        guard let title = Self.sanitized(rawTitle) else { return self }
        let newTask = FocusTask(title: title)
        guard let parentId else {
            return FocusState(tasks: tasks + [newTask], completed: completed)
        }
        guard canAddSubtask(under: parentId) else { return self }
        let updated = Self.updating(tasks, id: parentId) {
            $0.copy(subtasks: $0.subtasks + [newTask])
        }
        return FocusState(tasks: updated, completed: completed)
    }

    /// Rename any task in the tree; empty input keeps the old title.
    public func renamingTask(id: UUID, title rawTitle: String) -> FocusState {
        guard let title = Self.sanitized(rawTitle) else { return self }
        return FocusState(
            tasks: Self.updating(tasks, id: id) { $0.copy(title: title) },
            completed: completed
        )
    }

    /// Set or clear (nil) the color marker on any task.
    public func settingColor(id: UUID, color: ColorTag?) -> FocusState {
        FocusState(
            tasks: Self.updating(tasks, id: id) { $0.copy(colorTag: color) },
            completed: completed
        )
    }

    /// Flip the done flag on any task (used for nested tasks).
    public func togglingDone(id: UUID) -> FocusState {
        FocusState(
            tasks: Self.updating(tasks, id: id) { $0.copy(isDone: !$0.isDone) },
            completed: completed
        )
    }

    /// Move a ROOT task (with its subtree) to the top of the completed stack.
    public func completingTask(id: UUID) -> FocusState {
        guard let task = tasks.first(where: { $0.id == id }) else { return self }
        return FocusState(
            tasks: tasks.filter { $0.id != id },
            completed: [task] + completed
        )
    }

    /// Bring a completed task back to the end of the active list.
    public func restoringCompleted(id: UUID) -> FocusState {
        guard let restored = completed.first(where: { $0.id == id }) else { return self }
        return FocusState(
            tasks: tasks + [restored],
            completed: completed.filter { $0.id != id }
        )
    }

    /// Remove a task (and its whole subtree) from anywhere in the active tree.
    public func deletingTask(id: UUID) -> FocusState {
        FocusState(tasks: Self.removing(tasks, id: id), completed: completed)
    }

    /// Move a task (with its subtree) so it sits just before `targetId`,
    /// as its sibling. Rejected: drop onto itself / into its own subtree,
    /// or when the subtree would poke below the depth cap.
    public func movingTask(id: UUID, before targetId: UUID) -> FocusState {
        guard id != targetId,
              let moved = Self.find(id, in: tasks),
              Self.find(targetId, in: [moved]) == nil,
              let targetLevel = Self.level(of: targetId, in: tasks),
              targetLevel + Self.height(of: moved) - 1 <= Self.maxDepth
        else { return self }

        let without = Self.removing(tasks, id: id)
        return FocusState(
            tasks: Self.inserting(moved, before: targetId, in: without),
            completed: completed
        )
    }

    /// Move a task (with its subtree) to the end of the root list.
    public func movingTaskToEnd(id: UUID) -> FocusState {
        guard let moved = Self.find(id, in: tasks) else { return self }
        let without = Self.removing(tasks, id: id)
        guard without != tasks || tasks.last?.id != id else { return self }
        return FocusState(tasks: without + [moved], completed: completed)
    }

    // MARK: - Tree helpers

    private static func updating(
        _ tasks: [FocusTask], id: UUID,
        _ transform: (FocusTask) -> FocusTask
    ) -> [FocusTask] {
        tasks.map { task in
            task.id == id
                ? transform(task)
                : task.copy(subtasks: updating(task.subtasks, id: id, transform))
        }
    }

    private static func removing(_ tasks: [FocusTask], id: UUID) -> [FocusTask] {
        tasks.compactMap { task in
            task.id == id ? nil : task.copy(subtasks: removing(task.subtasks, id: id))
        }
    }

    private static func find(_ id: UUID, in tasks: [FocusTask]) -> FocusTask? {
        for task in tasks {
            if task.id == id { return task }
            if let found = find(id, in: task.subtasks) { return found }
        }
        return nil
    }

    /// Levels in this subtree (a leaf has height 1).
    private static func height(of task: FocusTask) -> Int {
        1 + (task.subtasks.map(height).max() ?? 0)
    }

    private static func inserting(
        _ task: FocusTask, before targetId: UUID, in tasks: [FocusTask]
    ) -> [FocusTask] {
        var result: [FocusTask] = []
        for node in tasks {
            if node.id == targetId { result.append(task) }
            result.append(node.copy(subtasks: inserting(task, before: targetId, in: node.subtasks)))
        }
        return result
    }

    /// 1-based nesting level of a node; nil when not found.
    private static func level(of id: UUID, in tasks: [FocusTask], current: Int = 1) -> Int? {
        for task in tasks {
            if task.id == id { return current }
            if let found = level(of: id, in: task.subtasks, current: current + 1) {
                return found
            }
        }
        return nil
    }

    /// Trim whitespace and cap length; nil when nothing meaningful remains.
    private static func sanitized(_ raw: String) -> String? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        return String(trimmed.prefix(maxTitleLength))
    }
}
