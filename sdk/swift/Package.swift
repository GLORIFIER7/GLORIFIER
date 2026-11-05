// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "GlorifierNeural",
    platforms: [.macOS(.v13)],
    products: [.library(name: "GlorifierNeural", targets: ["GlorifierNeural"])],
    targets: [
        .target(name: "GlorifierNeural"),
        .testTarget(name: "GlorifierNeuralTests", dependencies: ["GlorifierNeural"])
    ]
)