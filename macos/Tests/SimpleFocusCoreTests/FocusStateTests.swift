import XCTest
@testable import SimpleFocusCore

final class FocusStateTests: XCTestCase {

    // MARK: - Adding root tasks

    func testAddingSeveralRootTasksKeepsOrder() {
        // Arrange & Act
        let state = FocusState.empty
            .addingTask("Task A")
            .addingTask("Task B")
            .addingTask("Task C")

        // Assert
        XCTAssertEqual(state.tasks.map(\.title), ["Task A", "Task B", "Task C"])
    }

    func testAddingTaskTrimsAndCapsTitle() {
        // Arrange
        let longTitle = "  " + String(repeating: "x", count: 200) + "  "

        // Act
        let state = FocusState.empty.addingTask(longTitle)

        // Assert
        XCTAssertEqual(state.tasks[0].title.count, FocusState.maxTitleLength)
    }

    func testAddingEmptyTitleDoesNothing() {
        // Act
        let state = FocusState.empty.addingTask("   ")

        // Assert
        XCTAssertTrue(state.tasks.isEmpty)
    }

    // MARK: - Hierarchy

    func testAddingChildNestsUnderParent() {
        // Arrange
        let state = FocusState.empty.addingTask("Parent")
        let parentId = state.tasks[0].id

        // Act
        let updated = state.addingTask("Child", under: parentId)

        // Assert
        XCTAssertEqual(updated.tasks[0].subtasks.map(\.title), ["Child"])
    }

    func testHierarchyIsCappedAtFiveLevels() {
        // Arrange: build a chain 5 levels deep
        var state = FocusState.empty.addingTask("L1")
        var deepestId = state.tasks[0].id
        for level in 2...5 {
            state = state.addingTask("L\(level)", under: deepestId)
            deepestId = state.deepestDescendant(of: deepestId)
        }

        // Act: level 6 must be rejected
        XCTAssertFalse(state.canAddSubtask(under: deepestId))
        let updated = state.addingTask("L6", under: deepestId)

        // Assert
        XCTAssertEqual(updated, state)
    }

    func testCanAddSubtaskTrueAboveTheCap() {
        // Arrange
        let state = FocusState.empty.addingTask("Root")

        // Act & Assert
        XCTAssertTrue(state.canAddSubtask(under: state.tasks[0].id))
    }

    // MARK: - Renaming / color

    func testRenamingNestedTask() {
        // Arrange
        let state = FocusState.empty.addingTask("Parent")
        let parentId = state.tasks[0].id
        let withChild = state.addingTask("Child", under: parentId)
        let childId = withChild.tasks[0].subtasks[0].id

        // Act
        let updated = withChild.renamingTask(id: childId, title: "Child renamed")

        // Assert
        XCTAssertEqual(updated.tasks[0].subtasks[0].title, "Child renamed")
    }

    func testRenamingToEmptyKeepsOldTitle() {
        // Arrange
        let state = FocusState.empty.addingTask("Task A")

        // Act
        let updated = state.renamingTask(id: state.tasks[0].id, title: "  ")

        // Assert
        XCTAssertEqual(updated.tasks[0].title, "Task A")
    }

    func testSettingAndClearingColorTag() {
        // Arrange
        let state = FocusState.empty.addingTask("Task A")
        let id = state.tasks[0].id

        // Act
        let colored = state.settingColor(id: id, color: .green)
        let cleared = colored.settingColor(id: id, color: nil)

        // Assert
        XCTAssertEqual(colored.tasks[0].colorTag, .green)
        XCTAssertNil(cleared.tasks[0].colorTag)
    }

    // MARK: - Done / complete

    func testTogglingDoneOnNestedTask() {
        // Arrange
        let state = FocusState.empty.addingTask("Parent")
        let withChild = state.addingTask("Child", under: state.tasks[0].id)
        let childId = withChild.tasks[0].subtasks[0].id

        // Act
        let toggled = withChild.togglingDone(id: childId)
        let back = toggled.togglingDone(id: childId)

        // Assert
        XCTAssertTrue(toggled.tasks[0].subtasks[0].isDone)
        XCTAssertFalse(back.tasks[0].subtasks[0].isDone)
    }

    func testCompletingRootMovesItToCompletedNewestFirst() {
        // Arrange
        let state = FocusState.empty.addingTask("Task A").addingTask("Task B")
        let idA = state.tasks[0].id
        let idB = state.tasks[1].id

        // Act
        let updated = state.completingTask(id: idA).completingTask(id: idB)

        // Assert
        XCTAssertTrue(updated.tasks.isEmpty)
        XCTAssertEqual(updated.completed.map(\.title), ["Task B", "Task A"])
    }

    func testCompletingNonRootIdDoesNothing() {
        // Arrange
        let state = FocusState.empty.addingTask("Parent")
        let withChild = state.addingTask("Child", under: state.tasks[0].id)
        let childId = withChild.tasks[0].subtasks[0].id

        // Act
        let updated = withChild.completingTask(id: childId)

        // Assert
        XCTAssertEqual(updated, withChild)
    }

    // MARK: - Visible completed / overflow

    func testVisibleCompletedCappedAtFiveNewestFirst() {
        // Arrange
        var state = FocusState.empty
        for index in 1...8 {
            state = state.addingTask("Task \(index)")
            state = state.completingTask(id: state.tasks.last!.id)
        }

        // Act & Assert
        XCTAssertEqual(state.visibleCompleted.map(\.title),
                       ["Task 8", "Task 7", "Task 6", "Task 5", "Task 4"])
        XCTAssertEqual(state.overflowCount, 3)
    }

    // MARK: - Restore / delete

    func testRestoringCompletedAppendsBackToTasks() {
        // Arrange
        let state = FocusState.empty.addingTask("Task A").addingTask("Task B")
        let idA = state.tasks[0].id
        let completed = state.completingTask(id: idA)

        // Act
        let restored = completed.restoringCompleted(id: idA)

        // Assert
        XCTAssertEqual(restored.tasks.map(\.title), ["Task B", "Task A"])
        XCTAssertTrue(restored.completed.isEmpty)
    }

    func testDeletingNestedTaskRemovesIt() {
        // Arrange
        let state = FocusState.empty.addingTask("Parent")
        let withChildren = state
            .addingTask("Child 1", under: state.tasks[0].id)
            .addingTask("Child 2", under: state.tasks[0].id)
        let firstChildId = withChildren.tasks[0].subtasks[0].id

        // Act
        let updated = withChildren.deletingTask(id: firstChildId)

        // Assert
        XCTAssertEqual(updated.tasks[0].subtasks.map(\.title), ["Child 2"])
    }

    func testDeletingRootTaskRemovesWholeSubtree() {
        // Arrange
        let state = FocusState.empty.addingTask("Parent").addingTask("Other")
        let parentId = state.tasks[0].id
        let withChild = state.addingTask("Child", under: parentId)

        // Act
        let updated = withChild.deletingTask(id: parentId)

        // Assert
        XCTAssertEqual(updated.tasks.map(\.title), ["Other"])
    }

    // MARK: - Moving (drag & drop)

    func testMovingTaskBeforeSiblingReorders() {
        // Arrange
        let state = FocusState.empty.addingTask("A").addingTask("B").addingTask("C")
        let idC = state.tasks[2].id
        let idA = state.tasks[0].id

        // Act
        let updated = state.movingTask(id: idC, before: idA)

        // Assert
        XCTAssertEqual(updated.tasks.map(\.title), ["C", "A", "B"])
    }

    func testMovingTaskIntoAnotherParentAsSibling() {
        // Arrange
        var state = FocusState.empty.addingTask("Parent").addingTask("Loose")
        let parentId = state.tasks[0].id
        let looseId = state.tasks[1].id
        state = state.addingTask("Child", under: parentId)
        let childId = state.tasks[0].subtasks[0].id

        // Act: drop "Loose" onto "Child" → becomes Child's sibling, before it
        let updated = state.movingTask(id: looseId, before: childId)

        // Assert
        XCTAssertEqual(updated.tasks.map(\.title), ["Parent"])
        XCTAssertEqual(updated.tasks[0].subtasks.map(\.title), ["Loose", "Child"])
    }

    func testMovingTaskCarriesWholeSubtree() {
        // Arrange
        var state = FocusState.empty.addingTask("A").addingTask("B")
        let idA = state.tasks[0].id
        let idB = state.tasks[1].id
        state = state.addingTask("A child", under: idA)

        // Act
        let updated = state.movingTask(id: idA, before: idB)

        // Assert: A kept its child
        XCTAssertEqual(updated.tasks.map(\.title), ["A", "B"])
        XCTAssertEqual(updated.tasks[0].subtasks.map(\.title), ["A child"])
    }

    func testMovingIntoOwnSubtreeIsRejected() {
        // Arrange
        var state = FocusState.empty.addingTask("Parent")
        let parentId = state.tasks[0].id
        state = state.addingTask("Child", under: parentId)
        let childId = state.tasks[0].subtasks[0].id

        // Act
        let updated = state.movingTask(id: parentId, before: childId)

        // Assert
        XCTAssertEqual(updated, state)
    }

    func testMovingThatWouldExceedDepthCapIsRejected() {
        // Arrange: chain 4 deep + a task with its own child (height 2)
        var state = FocusState.empty.addingTask("L1")
        var deepestId = state.tasks[0].id
        for level in 2...4 {
            state = state.addingTask("L\(level)", under: deepestId)
            deepestId = state.deepestDescendant(of: deepestId)
        }
        state = state.addingTask("L5", under: deepestId)
        let level5Id = state.deepestDescendant(of: deepestId)
        state = state.addingTask("Tall", under: nil)
        let tallId = state.tasks[1].id
        state = state.addingTask("Tall child", under: tallId)

        // Act: dropping height-2 "Tall" at level 5 would reach level 6
        let updated = state.movingTask(id: tallId, before: level5Id)

        // Assert
        XCTAssertEqual(updated, state)
    }

    func testMovingTaskToEndOfRootList() {
        // Arrange
        var state = FocusState.empty.addingTask("Parent").addingTask("B")
        let parentId = state.tasks[0].id
        state = state.addingTask("Child", under: parentId)
        let childId = state.tasks[0].subtasks[0].id

        // Act: drag nested "Child" out to free space → end of root list
        let updated = state.movingTaskToEnd(id: childId)

        // Assert
        XCTAssertEqual(updated.tasks.map(\.title), ["Parent", "B", "Child"])
        XCTAssertTrue(updated.tasks[0].subtasks.isEmpty)
    }

    // MARK: - Persistence

    func testCodableRoundTrip() throws {
        // Arrange
        var state = FocusState.empty.addingTask("Task A").addingTask("Task B")
        state = state.addingTask("Child", under: state.tasks[0].id)
        state = state.settingColor(id: state.tasks[0].id, color: .blue)
        state = state.completingTask(id: state.tasks[1].id)

        // Act
        let data = try JSONEncoder().encode(state)
        let decoded = try JSONDecoder().decode(FocusState.self, from: data)

        // Assert
        XCTAssertEqual(decoded, state)
    }
}

private extension FocusState {
    /// Test helper: id of the single child chain's next node under `id`.
    func deepestDescendant(of id: UUID) -> UUID {
        func find(_ tasks: [FocusTask]) -> FocusTask? {
            for task in tasks {
                if task.id == id { return task }
                if let found = find(task.subtasks) { return found }
            }
            return nil
        }
        return find(tasks)!.subtasks.last!.id
    }
}
