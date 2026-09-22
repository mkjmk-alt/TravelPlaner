// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "NativeCore",
    platforms: [.iOS(.v16), .macOS(.v13)],
    products: [.library(name: "NativeCore", targets: ["NativeCore"])],
    targets: [
        .target(name: "NativeCore", resources: [.process("Resources")]),
        .testTarget(name: "NativeCoreTests", dependencies: ["NativeCore"])
    ]
)
