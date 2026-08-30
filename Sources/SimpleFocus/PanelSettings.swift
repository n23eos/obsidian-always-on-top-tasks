import Foundation
import Combine

/// User-tweakable panel settings, persisted to UserDefaults.
final class PanelSettings: ObservableObject {
    private enum Keys {
        static let opacity = "simpleFocus.opacity"
        static let clickThrough = "simpleFocus.clickThrough"
    }

    static let opacitySteps: [Double] = [1.0, 0.8, 0.6, 0.4]

    @Published var opacity: Double {
        didSet { defaults.set(opacity, forKey: Keys.opacity) }
    }

    @Published var isClickThrough: Bool {
        didSet { defaults.set(isClickThrough, forKey: Keys.clickThrough) }
    }

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        let savedOpacity = defaults.object(forKey: Keys.opacity) as? Double
        opacity = savedOpacity ?? 1.0
        isClickThrough = defaults.bool(forKey: Keys.clickThrough)
    }
}

extension Notification.Name {
    /// Hotkey / menu asked to focus the task editor.
    static let focusTaskEditor = Notification.Name("simpleFocus.focusTaskEditor")
    /// A view inside the panel needs the panel to become key (to type).
    static let panelNeedsKey = Notification.Name("simpleFocus.panelNeedsKey")
    /// Hover close button asked to hide the panel.
    static let hidePanel = Notification.Name("simpleFocus.hidePanel")
    /// Panel stopped being key (user clicked elsewhere) — close empty editors.
    static let panelResignedKey = Notification.Name("simpleFocus.panelResignedKey")
}
