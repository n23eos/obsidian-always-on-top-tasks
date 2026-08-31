import AppKit
import Combine

/// Menu bar item: show/hide panel, opacity, click-through, quit.
final class StatusBarController: NSObject, NSMenuDelegate {
    private let statusItem: NSStatusItem
    private let settings: PanelSettings
    private let togglePanel: () -> Void
    private let editTask: () -> Void
    private let isPanelVisible: () -> Bool

    init(
        settings: PanelSettings,
        togglePanel: @escaping () -> Void,
        editTask: @escaping () -> Void,
        isPanelVisible: @escaping () -> Bool
    ) {
        self.statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        self.settings = settings
        self.togglePanel = togglePanel
        self.editTask = editTask
        self.isPanelVisible = isPanelVisible
        super.init()

        statusItem.button?.image = NSImage(
            systemSymbolName: "scope",
            accessibilityDescription: "SimpleFocus"
        )
        let menu = NSMenu()
        menu.delegate = self
        statusItem.menu = menu
    }

    // Rebuild the menu on every open so checkmarks are always current.
    func menuNeedsUpdate(_ menu: NSMenu) {
        menu.removeAllItems()

        let toggleTitle = isPanelVisible() ? "Скрыть панель" : "Показать панель"
        menu.addItem(makeItem(toggleTitle, action: #selector(togglePanelAction)))

        let editItem = makeItem("Изменить задачу", action: #selector(editTaskAction))
        editItem.keyEquivalent = "l"
        editItem.keyEquivalentModifierMask = [.command, .shift]
        menu.addItem(editItem)

        menu.addItem(.separator())

        let opacityItem = NSMenuItem(title: "Прозрачность", action: nil, keyEquivalent: "")
        let opacityMenu = NSMenu()
        for step in PanelSettings.opacitySteps {
            let item = makeItem("\(Int(step * 100))%", action: #selector(setOpacityAction(_:)))
            item.representedObject = step
            item.state = abs(settings.opacity - step) < 0.01 ? .on : .off
            opacityMenu.addItem(item)
        }
        opacityItem.submenu = opacityMenu
        menu.addItem(opacityItem)

        let clickThroughItem = makeItem(
            "Сквозные клики (не мешать мыши)",
            action: #selector(toggleClickThroughAction)
        )
        clickThroughItem.state = settings.isClickThrough ? .on : .off
        menu.addItem(clickThroughItem)

        menu.addItem(.separator())

        let quitItem = makeItem("Выйти", action: #selector(quitAction))
        quitItem.keyEquivalent = "q"
        menu.addItem(quitItem)
    }

    private func makeItem(_ title: String, action: Selector) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: "")
        item.target = self
        return item
    }

    @objc private func togglePanelAction() { togglePanel() }
    @objc private func editTaskAction() { editTask() }

    @objc private func setOpacityAction(_ sender: NSMenuItem) {
        guard let value = sender.representedObject as? Double else { return }
        settings.opacity = value
    }

    @objc private func toggleClickThroughAction() {
        settings.isClickThrough.toggle()
    }

    @objc private func quitAction() {
        NSApp.terminate(nil)
    }
}
