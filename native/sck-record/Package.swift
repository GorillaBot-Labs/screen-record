// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "sck-record",
  platforms: [.macOS(.v13)],
  targets: [
    .executableTarget(
      name: "sck-record",
      path: "Sources"
    )
  ]
)
