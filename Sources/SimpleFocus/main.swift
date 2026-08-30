import AppKit

// Menu bar utility: no Dock icon, no main menu.
let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
