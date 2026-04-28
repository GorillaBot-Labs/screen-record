import AVFoundation
import CoreGraphics
import CoreImage
import CoreMedia
import Foundation
import ImageIO
import ScreenCaptureKit
import UniformTypeIdentifiers

// ScreenCaptureKit (display) + AVCapture (mic) → MP4. Spawned by Electron on macOS.
// Usage: sck-record --output <file.mp4> --display <n> --audio <n>

private func pngData(from pixelBuffer: CVPixelBuffer) -> Data? {
  let ci = CIImage(cvPixelBuffer: pixelBuffer)
  let ctx = CIContext(options: nil)
  guard let cg = ctx.createCGImage(ci, from: ci.extent) else { return nil }
  let out = NSMutableData()
  guard
    let dest = CGImageDestinationCreateWithData(out as CFMutableData, UTType.png.identifier as CFString, 1, nil)
  else { return nil }
  CGImageDestinationAddImage(dest, cg, nil)
  guard CGImageDestinationFinalize(dest) else { return nil }
  return out as Data
}

/// Discovery-based listing (replaces deprecated `AVCaptureDevice.devices(for: .audio)`).
private func sortedAudioCaptureDevices() -> [AVCaptureDevice] {
  let deviceTypes: [AVCaptureDevice.DeviceType]
  if #available(macOS 14.0, *) {
    deviceTypes = [.microphone]
  } else {
    deviceTypes = [.builtInMicrophone, .externalUnknown]
  }
  let session = AVCaptureDevice.DiscoverySession(
    deviceTypes: deviceTypes,
    mediaType: .audio,
    position: .unspecified,
  )
  return session.devices.sorted { $0.uniqueID < $1.uniqueID }
}

enum RecordError: Error, CustomStringConvertible {
  case usage
  case badDisplay(Int, Int)
  case badAudio(Int, Int)
  case screenshot(String)
  case writer(String)

  var description: String {
    switch self {
    case .usage:
      return "Usage: sck-record --output <file.mp4> --display <n> --audio <n> (or --list-json, or --screenshot-json --display <n>)"
    case let .badDisplay(i, max):
      return "Display index \(i) out of range (0..<\(max))"
    case let .badAudio(i, max):
      return "Audio device index \(i) out of range (0..<\(max))"
    case .screenshot(let m):
      return "Screenshot failed: \(m)"
    case .writer(let m): return "AVAssetWriter: \(m)"
    }
  }
}

private final class Bridge: NSObject, SCStreamOutput, AVCaptureAudioDataOutputSampleBufferDelegate {
  let onVideo: (CMSampleBuffer, SCStreamOutputType) -> Void
  let onAudio: (CMSampleBuffer) -> Void

  init(onVideo: @escaping (CMSampleBuffer, SCStreamOutputType) -> Void, onAudio: @escaping (CMSampleBuffer) -> Void) {
    self.onVideo = onVideo
    self.onAudio = onAudio
  }

  func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
    onVideo(sampleBuffer, type)
  }

  func captureOutput(
    _ output: AVCaptureOutput,
    didOutput sampleBuffer: CMSampleBuffer,
    from connection: AVCaptureConnection
  ) {
    onAudio(sampleBuffer)
  }
}

/// All mutation of writer inputs happens on `writerQueue` (SCStream + AVCapture deliver there).
final class Recorder: @unchecked Sendable {
  private let outputURL: URL
  private let display: SCDisplay
  private let audioDevice: AVCaptureDevice
  private let writerQueue = DispatchQueue(label: "sck-record.writer")

  private var assetWriter: AVAssetWriter!
  private var videoInput: AVAssetWriterInput!
  private var audioInput: AVAssetWriterInput!
  private var bridge: Bridge!
  private var stream: SCStream?
  private var captureSession: AVCaptureSession?

  private var sessionStarted = false
  private var sessionStart: CMTime = .invalid
  private var stopping = false

  init(outputURL: URL, display: SCDisplay, audioDevice: AVCaptureDevice) {
    self.outputURL = outputURL
    self.display = display
    self.audioDevice = audioDevice
  }

  /// H.264 / 4:2:0 needs even size; VideoToolbox is happiest with multiple-of-16 (MacBook sizes are often odd, e.g. 1117).
  private static func encodeDimensions(_ display: SCDisplay) -> (Int, Int) {
    func floor16(_ x: Int) -> Int { max(16, (x / 16) * 16) }
    return (floor16(display.width), floor16(display.height))
  }

  static func loadDevices(displayIndex: Int, audioIndex: Int) async throws -> (SCDisplay, AVCaptureDevice) {
    let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
    let displays = content.displays.sorted { $0.displayID < $1.displayID }
    guard displayIndex >= 0, displayIndex < displays.count else {
      throw RecordError.badDisplay(displayIndex, displays.count)
    }
    let mics = sortedAudioCaptureDevices()
    guard audioIndex >= 0, audioIndex < mics.count else {
      throw RecordError.badAudio(audioIndex, mics.count)
    }
    return (displays[displayIndex], mics[audioIndex])
  }

  func run() async throws {
    let micGranted = await withCheckedContinuation { (c: CheckedContinuation<Bool, Never>) in
      AVCaptureDevice.requestAccess(for: .audio) { ok in c.resume(returning: ok) }
    }
    guard micGranted else { throw RecordError.writer("Microphone access denied") }

    if FileManager.default.fileExists(atPath: outputURL.path) {
      try? FileManager.default.removeItem(at: outputURL)
    }

    bridge = Bridge(
      onVideo: { [weak self] buf, type in
        self?.handleVideo(buf, type: type)
      },
      onAudio: { [weak self] buf in
        self?.handleAudio(buf)
      }
    )

    assetWriter = try AVAssetWriter(url: outputURL, fileType: .mp4)

    let (w, h) = Self.encodeDimensions(display)
    if display.width != w || display.height != h {
      fputs(
        "sck-record: capture \(w)x\(h) (aligned from display \(display.width)x\(display.height)) for H.264\n",
        stderr,
      )
    }
    let videoSettings: [String: Any] = [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: w,
      AVVideoHeightKey: h,
      AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: 8_000_000,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
        AVVideoExpectedSourceFrameRateKey: 30,
      ] as [String: Any],
    ]
    videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
    videoInput.expectsMediaDataInRealTime = true

    let audioSettings: [String: Any] = [
      AVFormatIDKey: kAudioFormatMPEG4AAC,
      AVSampleRateKey: 48_000,
      AVNumberOfChannelsKey: 2,
      AVEncoderBitRateKey: 160_000,
    ]
    audioInput = AVAssetWriterInput(mediaType: .audio, outputSettings: audioSettings)
    audioInput.expectsMediaDataInRealTime = true

    guard assetWriter.canAdd(videoInput) else { throw RecordError.writer("cannot add video") }
    guard assetWriter.canAdd(audioInput) else { throw RecordError.writer("cannot add audio") }
    assetWriter.add(videoInput)
    assetWriter.add(audioInput)

    guard assetWriter.startWriting() else {
      throw RecordError.writer(assetWriter.error?.localizedDescription ?? "startWriting failed")
    }

    let filter = SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])
    let cfg = SCStreamConfiguration()
    cfg.width = w
    cfg.height = h
    cfg.minimumFrameInterval = CMTime(value: 1, timescale: 30)
    cfg.pixelFormat = kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange
    cfg.showsCursor = true
    cfg.capturesAudio = false
    cfg.queueDepth = 8

    let scStream = SCStream(filter: filter, configuration: cfg, delegate: nil)
    stream = scStream
    try scStream.addStreamOutput(bridge, type: .screen, sampleHandlerQueue: writerQueue)
    try await scStream.startCapture()

    let session = AVCaptureSession()
    session.beginConfiguration()
    session.sessionPreset = .high
    let input = try AVCaptureDeviceInput(device: audioDevice)
    guard session.canAddInput(input) else { throw RecordError.writer("cannot add mic input") }
    session.addInput(input)
    let out = AVCaptureAudioDataOutput()
    out.setSampleBufferDelegate(bridge, queue: writerQueue)
    guard session.canAddOutput(out) else { throw RecordError.writer("cannot add mic output") }
    session.addOutput(out)
    session.commitConfiguration()
    captureSession = session
    session.startRunning()

    try await waitForStopSignal()

    stopping = true
    session.stopRunning()
    try await scStream.stopCapture()
    stream = nil

    await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in
      writerQueue.async { [weak self] in
        guard let self else {
          c.resume()
          return
        }
        self.videoInput.markAsFinished()
        self.audioInput.markAsFinished()
        self.assetWriter.finishWriting {
          c.resume()
        }
      }
    }

    if assetWriter.status == .failed {
      throw RecordError.writer(assetWriter.error?.localizedDescription ?? "finish failed")
    }
  }

  private func waitForStopSignal() async throws {
    await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
      let src = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
      signal(SIGINT, SIG_IGN)
      src.setEventHandler {
        src.cancel()
        cont.resume()
      }
      src.resume()
    }
  }

  private func handleVideo(_ sampleBuffer: CMSampleBuffer, type: SCStreamOutputType) {
    guard !stopping else { return }
    if type == .audio { return }
    // Only append real video frames (some callbacks can carry non-video types).
    guard CMSampleBufferIsValid(sampleBuffer), CMSampleBufferGetImageBuffer(sampleBuffer) != nil else { return }
    let pts = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
    if !sessionStarted {
      sessionStart = pts
      assetWriter.startSession(atSourceTime: pts)
      sessionStarted = true
    }
    guard videoInput.isReadyForMoreMediaData else {
      fputs("sck-record: video input not ready, dropping frame\n", stderr)
      return
    }
    if !videoInput.append(sampleBuffer) {
      fputs(
        "sck-record: video append failed: \(assetWriter.error?.localizedDescription ?? "unknown")\n",
        stderr,
      )
    }
  }

  private func handleAudio(_ sampleBuffer: CMSampleBuffer) {
    guard !stopping, sessionStarted else { return }
    let pts = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
    if CMTimeCompare(pts, sessionStart) < 0 { return }
    guard audioInput.isReadyForMoreMediaData else { return }
    if !audioInput.append(sampleBuffer) {
      fputs(
        "sck-record: audio append failed: \(assetWriter.error?.localizedDescription ?? "unknown")\n",
        stderr,
      )
    }
  }
}

private func printDeviceListJSON() async throws {
  let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
  let displays = content.displays.sorted { $0.displayID < $1.displayID }
  let mics = sortedAudioCaptureDevices()
  struct Entry: Codable {
    let index: Int
    let name: String
  }
  struct Root: Codable {
    let video: [Entry]
    let audio: [Entry]
  }
  let video = displays.enumerated().map { i, d -> Entry in
    let ew = max(16, (d.width / 16) * 16)
    let eh = max(16, (d.height / 16) * 16)
    let builtIn = CGDisplayIsBuiltin(d.displayID) != 0
    let kind = builtIn ? "Built-in Display" : "External Display"
    return Entry(index: i, name: "\(kind) (\(ew)×\(eh))")
  }
  let audio = mics.enumerated().map { i, m in
    Entry(index: i, name: m.localizedName)
  }
  let enc = JSONEncoder()
  enc.outputFormatting = [.sortedKeys]
  let data = try enc.encode(Root(video: video, audio: audio))
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write(Data([10]))
}

private func parseArgs() throws -> (output: URL, display: Int, audio: Int) {
  var out: String?
  var d: Int?
  var a: Int?
  var i = CommandLine.arguments.makeIterator()
  _ = i.next()
  while let arg = i.next() {
    switch arg {
    case "--output":
      out = i.next()
    case "--display":
      if let v = i.next() { d = Int(v) }
    case "--audio":
      if let v = i.next() { a = Int(v) }
    default:
      break
    }
  }
  guard let path = out, let di = d, let ai = a else { throw RecordError.usage }
  return (URL(fileURLWithPath: path), di, ai)
}

private func parseScreenshotArgs() throws -> (display: Int, maxWidth: Int?) {
  var d: Int?
  var maxW: Int?
  var i = CommandLine.arguments.makeIterator()
  _ = i.next()
  while let arg = i.next() {
    switch arg {
    case "--display":
      if let v = i.next() { d = Int(v) }
    case "--max-width":
      if let v = i.next() { maxW = Int(v) }
    default:
      break
    }
  }
  guard let di = d else { throw RecordError.usage }
  return (di, maxW)
}

private func printScreenshotJSON(displayIndex: Int, maxWidth: Int?) async throws {
  let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
  let displays = content.displays.sorted { $0.displayID < $1.displayID }
  guard displayIndex >= 0, displayIndex < displays.count else {
    throw RecordError.badDisplay(displayIndex, displays.count)
  }
  let display = displays[displayIndex]

  let targetW: Int
  let targetH: Int
  if let mw = maxWidth, mw > 0, display.width > mw {
    let scale = Double(mw) / Double(max(1, display.width))
    targetW = max(16, Int(Double(display.width) * scale))
    targetH = max(16, Int(Double(display.height) * scale))
  } else {
    targetW = display.width
    targetH = display.height
  }

  let filter = SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])
  let cfg = SCStreamConfiguration()
  cfg.width = targetW
  cfg.height = targetH
  cfg.minimumFrameInterval = CMTime(value: 1, timescale: 5)
  cfg.pixelFormat = kCVPixelFormatType_32BGRA
  cfg.showsCursor = true
  cfg.capturesAudio = false
  cfg.queueDepth = 2

  let q = DispatchQueue(label: "sck-record.screenshot")
  final class Once {
    private let stateQ = DispatchQueue(label: "sck-record.screenshot.once")
    private var done = false
    func tryMark() -> Bool {
      stateQ.sync {
        if done { return false }
        done = true
        return true
      }
    }
  }
  let once = Once()
  final class StreamBox: @unchecked Sendable {
    var stream: SCStream?
  }
  let box = StreamBox()

  let done: Data = try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Data, Error>) in
    // Fail fast if we don't get a frame quickly (avoids Electron hanging on `spawnSync`).
    Task {
      try? await Task.sleep(nanoseconds: 2_500_000_000)
      if once.tryMark() {
        cont.resume(throwing: RecordError.screenshot("timed out waiting for first frame (check Screen Recording permission)"))
        Task { try? await box.stream?.stopCapture() }
      }
    }

    let bridge = Bridge(
      onVideo: { sampleBuffer, type in
        if type == .audio { return }
        guard once.tryMark() else { return }

        guard
          CMSampleBufferIsValid(sampleBuffer),
          let img = CMSampleBufferGetImageBuffer(sampleBuffer)
        else {
          cont.resume(throwing: RecordError.screenshot("no image buffer"))
          Task { try? await box.stream?.stopCapture() }
          return
        }
        guard let data = pngData(from: img) else {
          cont.resume(throwing: RecordError.screenshot("could not encode png"))
          Task { try? await box.stream?.stopCapture() }
          return
        }
        cont.resume(returning: data)
        Task { try? await box.stream?.stopCapture() }
      },
      onAudio: { _ in },
    )

    Task {
      do {
        try await MainActor.run {
          let scStream = SCStream(filter: filter, configuration: cfg, delegate: nil)
          box.stream = scStream
          try scStream.addStreamOutput(bridge, type: .screen, sampleHandlerQueue: q)
          return ()
        }
        try await box.stream?.startCapture()
      } catch {
        if once.tryMark() {
          cont.resume(throwing: error)
        }
        Task { try? await box.stream?.stopCapture() }
      }
    }
  }

  struct Root: Codable {
    let ok: Bool
    let pngBase64: String
    let width: Int
    let height: Int
  }
  let root = Root(ok: true, pngBase64: done.base64EncodedString(), width: targetW, height: targetH)
  let enc = JSONEncoder()
  enc.outputFormatting = [.sortedKeys]
  let data = try enc.encode(root)
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write(Data([10]))
}

@main
struct SckRecordMain {
  static func main() async {
    if CommandLine.arguments.contains("--list-json") {
      do {
        try await printDeviceListJSON()
      } catch {
        fputs("\(error)\n", stderr)
        exit(1)
      }
      return
    }
    if CommandLine.arguments.contains("--screenshot-json") {
      do {
        let (dIdx, maxW) = try parseScreenshotArgs()
        try await printScreenshotJSON(displayIndex: dIdx, maxWidth: maxW)
      } catch {
        fputs("\(error)\n", stderr)
        exit(1)
      }
      return
    }
    do {
      let (url, dIdx, aIdx) = try parseArgs()
      let (display, mic) = try await Recorder.loadDevices(displayIndex: dIdx, audioIndex: aIdx)
      fputs("sck-record: display \(display.displayID) \(display.width)x\(display.height) mic \(mic.localizedName)\n", stderr)
      let rec = Recorder(outputURL: url, display: display, audioDevice: mic)
      try await rec.run()
      fputs("sck-record: finished \(url.path)\n", stderr)
    } catch {
      fputs("\(error)\n", stderr)
      exit(1)
    }
  }
}
