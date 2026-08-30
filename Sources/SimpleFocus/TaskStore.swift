import Foundation
import Combine
import SimpleFocusCore

/// Owns the immutable FocusState, persists it to UserDefaults as JSON.
final class TaskStore: ObservableObject {
    static let storageKey = "simpleFocus.state.v2"

    @Published private(set) var state: FocusState

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        if let data = defaults.data(forKey: Self.storageKey),
           let saved = try? JSONDecoder().decode(FocusState.self, from: data) {
            state = saved
        } else {
            state = .empty
        }
    }

    func addTask(_ title: String, under parentId: UUID? = nil) {
        apply { $0.addingTask(title, under: parentId) }
    }

    func renameTask(id: UUID, title: String) {
        apply { $0.renamingTask(id: id, title: title) }
    }

    func setColor(id: UUID, color: ColorTag?) {
        apply { $0.settingColor(id: id, color: color) }
    }

    func toggleDone(id: UUID) {
        apply { $0.togglingDone(id: id) }
    }

    func completeTask(id: UUID) {
        apply { $0.completingTask(id: id) }
    }

    func restoreCompleted(id: UUID) {
        apply { $0.restoringCompleted(id: id) }
    }

    func deleteTask(id: UUID) {
        apply { $0.deletingTask(id: id) }
    }

    func moveTask(id: UUID, before targetId: UUID) {
        apply { $0.movingTask(id: id, before: targetId) }
    }

    func moveTaskToEnd(id: UUID) {
        apply { $0.movingTaskToEnd(id: id) }
    }

    private func apply(_ transform: (FocusState) -> FocusState) {
        let newState = transform(state)
        guard newState != state else { return }
        state = newState
        persist()
    }

    private func persist() {
        do {
            defaults.set(try JSONEncoder().encode(state), forKey: Self.storageKey)
        } catch {
            NSLog("SimpleFocus: failed to persist state: \(error.localizedDescription)")
        }
    }
}
