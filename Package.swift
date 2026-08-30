// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "SimpleFocus",
    platforms: [.macOS(.v14)],
    targets: [
        // Pure logic, no AppKit — easy to unit test
        .target(name: "SimpleFocusCore"),
        // The actual menu bar app
        .executableTarget(
            name: "SimpleFocus",
            dependencies: ["SimpleFocusCore"]
        ),
        .testTarget(
            name: "SimpleFocusCoreTests",
            dependencies: ["SimpleFocusCore"]
        ),
    ]
)
