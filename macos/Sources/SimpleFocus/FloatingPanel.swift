import AppKit

/// Borderless, always-on-top, draggable panel that never steals focus
/// from the app the user is working in — until they click into a text field.
final class FloatingPanel: NSPanel {
    init(contentRect: NSRect) {
        super.init(
            contentRect: contentRect,
            styleMask: [.borderless, .nonactivatingPanel, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )

        isFloatingPanel = true
        level = .floating
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]

        backgroundColor = .clear
        isOpaque = false
        hasShadow = true

        isMovableByWindowBackground = true
        hidesOnDeactivate = false
        becomesKeyOnlyIfNeeded = true
        animationBehavior = .utilityWindow
    }

    // Borderless windows refuse key status by default; text input needs it.
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}
