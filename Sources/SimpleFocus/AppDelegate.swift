import AppKit
import SwiftUI
import Combine

final class AppDelegate: NSObject, NSApplicationDelegate {
    private let store = TaskStore()
    private let settings = PanelSettings()

    private var panel: FloatingPanel?
    private var statusBar: StatusBarController?
    private var hotKey: HotKey?
    private var cancellables = Set<AnyCancellable>()

    func applicationDidFinishLaunching(_ notification: Notification) {
        setUpPanel()
        setUpStatusBar()
        setUpHotKey()
        bindSettings()
        observePanelNotifications()
    }

    // MARK: - Panel

    private func setUpPanel() {
        let panel = FloatingPanel(
            contentRect: NSRect(x: 0, y: 0, width: ContentView.panelWidth, height: 44)
        )
        let rootView = ContentView(store: store) { [weak self] size in
            self?.resizePanel(to: size)
        }
        panel.contentView = NSHostingView(rootView: rootView)

        panel.setFrameAutosaveName("SimpleFocusPanel")
        if !panel.setFrameUsingName("SimpleFocusPanel"), let screen = NSScreen.main {
            // First launch: top-right corner, below the menu bar.
            let visible = screen.visibleFrame
            panel.setFrameTopLeftPoint(NSPoint(
                x: visible.maxX - ContentView.panelWidth - 20,
                y: visible.maxY - 20
            ))
        }
        panel.orderFrontRegardless()
        self.panel = panel
    }

    /// Content height changes (subtasks, history) — grow/shrink downward,
    /// keeping the top edge where the user put it.
    private func resizePanel(to size: CGSize) {
        guard let panel, size.height > 0 else { return }
        var frame = panel.frame
        guard abs(frame.height - size.height) > 0.5 || abs(frame.width - size.width) > 0.5 else {
            return
        }
        frame.origin.y += frame.height - size.height
        frame.size = size
        panel.setFrame(frame, display: true)
    }

    private func togglePanel() {
        guard let panel else { return }
        if panel.isVisible {
            panel.orderOut(nil)
        } else {
            panel.orderFrontRegardless()
        }
    }

    /// Show the panel (if hidden) and put the cursor into the task field.
    private func editTask() {
        guard let panel else { return }
        // Typing requires mouse events: quietly drop click-through for the edit.
        if settings.isClickThrough { settings.isClickThrough = false }
        panel.orderFrontRegardless()
        panel.makeKey()
        NSApp.activate(ignoringOtherApps: true)
        NotificationCenter.default.post(name: .focusTaskEditor, object: nil)
    }

    // MARK: - Wiring

    private func setUpStatusBar() {
        statusBar = StatusBarController(
            settings: settings,
            togglePanel: { [weak self] in self?.togglePanel() },
            editTask: { [weak self] in self?.editTask() },
            isPanelVisible: { [weak self] in self?.panel?.isVisible ?? false }
        )
    }

    private func setUpHotKey() {
        hotKey = HotKey { [weak self] in self?.editTask() }
        if hotKey == nil {
            NSLog("SimpleFocus: could not register ⌘⇧L global hotkey")
        }
    }

    private func bindSettings() {
        settings.$opacity
            .sink { [weak self] value in self?.panel?.alphaValue = value }
            .store(in: &cancellables)

        settings.$isClickThrough
            .sink { [weak self] value in self?.panel?.ignoresMouseEvents = value }
            .store(in: &cancellables)
    }

    private func observePanelNotifications() {
        NotificationCenter.default.publisher(for: .panelNeedsKey)
            .sink { [weak self] _ in
                self?.panel?.makeKey()
                NSApp.activate(ignoringOtherApps: true)
            }
            .store(in: &cancellables)

        NotificationCenter.default.publisher(for: .hidePanel)
            .sink { [weak self] _ in self?.panel?.orderOut(nil) }
            .store(in: &cancellables)

        // User clicked away from the panel — let views close abandoned editors.
        NotificationCenter.default.publisher(for: NSWindow.didResignKeyNotification)
            .sink { [weak self] notification in
                guard let panel = self?.panel,
                      notification.object as? NSWindow === panel else { return }
                NotificationCenter.default.post(name: .panelResignedKey, object: nil)
            }
            .store(in: &cancellables)
    }
}
