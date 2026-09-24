import AVFoundation
import CoreGraphics
import CoreImage
import CoreMedia
import Foundation
import ImageIO
import ScreenCaptureKit
import UniformTypeIdentifiers

// ScreenCaptureKit (display) + AVCapture (mic + optional camera) → MP4. Spawned by Electron on macOS.
// Usage: sck-record --output <file.mp4> --display <n> --audio <n> [--camera <n>] [--exclude-pid <pid>]

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

private func sortedCameraCaptureDevices() -> [AVCaptureDevice] {
  let deviceTypes: [AVCaptureDevice.DeviceType]
  if #available(macOS 14.0, *) {
    deviceTypes = [.builtInWideAngleCamera, .externalUnknown, .continuityCamera]
  } else {
    deviceTypes = [.builtInWideAngleCamera, .externalUnknown]
  }
  let session = AVCaptureDevice.DiscoverySession(
    deviceTypes: deviceTypes,
    mediaType: .video,
    position: .unspecified,
  )
  return session.devices.sorted { $0.uniqueID < $1.uniqueID }
}

enum RecordError: Error, CustomStringConvertible {
  case usage
  case badDisplay(Int, Int)
  case badAudio(Int, Int)
  case badCamera(Int, Int)
  case screenshot(String)
  case writer(String)

  var description: String {
    switch self {
    case .usage:
      return "Usage: sck-record --output <file.mp4> --display <n> --audio <n> [--camera <n>] [--exclude-pid <pid>] (or --list-json, or --screenshot-json --display <n>)"
    case let .badDisplay(i, max):
      return "Display index \(i) out of range (0..<\(max))"
    case let .badAudio(i, max):
      return "Audio device index \(i) out of range (0..<\(max))"
    case let .badCamera(i, max):
      return "Camera index \(i) out of range (0..<\(max))"
    case .screenshot(let m):
      return "Screenshot failed: \(m)"
    case .writer(let m): return "AVAssetWriter: \(m)"
    }
  }
}

private func floor16(_ x: Int) -> Int { max(16, (x / 16) * 16) }

private struct CaptureGeometry {
  let sourceRect: CGRect
  let width: Int
  let height: Int
  let pointPixelScale: CGFloat
}

/// ScreenCaptureKit expects `sourceRect` in display-local points and output `width`/`height` in pixels.
private func displayPixelScale(_ display: SCDisplay, filter: SCContentFilter) -> CGFloat {
  if #available(macOS 14.0, *) {
    let scale = CGFloat(filter.pointPixelScale)
    if scale > 0 { return scale }
  }
  let pixelsWide = CGFloat(CGDisplayPixelsWide(display.displayID))
  let pointsWide = CGFloat(max(1, display.width))
  return max(1, pixelsWide / pointsWide)
}

private func captureGeometry(display: SCDisplay, filter: SCContentFilter) -> CaptureGeometry {
  let logical = CGSize(width: display.width, height: display.height)
  let scale = displayPixelScale(display, filter: filter)
  let pixelW = floor16(Int((logical.width * scale).rounded()))
  let pixelH = floor16(Int((logical.height * scale).rounded()))
  return CaptureGeometry(
    sourceRect: CGRect(origin: .zero, size: logical),
    width: pixelW,
    height: pixelH,
    pointPixelScale: scale,
  )
}

private func applyCaptureGeometry(_ cfg: SCStreamConfiguration, _ geom: CaptureGeometry) {
  cfg.sourceRect = geom.sourceRect
  cfg.width = geom.width
  cfg.height = geom.height
  if #available(macOS 14.0, *) {
    cfg.captureResolution = .best
  }
}

private func cameraOrientation(from sampleBuffer: CMSampleBuffer) -> CGImagePropertyOrientation {
  if let raw = CMGetAttachment(sampleBuffer, key: kCGImagePropertyOrientation, attachmentModeOut: nil) as? UInt32,
     let orientation = CGImagePropertyOrientation(rawValue: raw)
  {
    return orientation
  }
  return .up
}

private func mirrorHorizontally(_ image: CIImage) -> CIImage {
  let extent = image.extent
  return image.transformed(
    by: CGAffineTransform(translationX: extent.width, y: 0).scaledBy(x: -1, y: 1),
  )
}

private final class Bridge: NSObject, SCStreamOutput, AVCaptureAudioDataOutputSampleBufferDelegate,
  AVCaptureVideoDataOutputSampleBufferDelegate
{
  let onVideo: (CMSampleBuffer, SCStreamOutputType) -> Void
  let onAudio: (CMSampleBuffer) -> Void
  let onCamera: (CVPixelBuffer, CGImagePropertyOrientation) -> Void

  init(
    onVideo: @escaping (CMSampleBuffer, SCStreamOutputType) -> Void,
    onAudio: @escaping (CMSampleBuffer) -> Void,
    onCamera: @escaping (CVPixelBuffer, CGImagePropertyOrientation) -> Void,
  ) {
    self.onVideo = onVideo
    self.onAudio = onAudio
    self.onCamera = onCamera
  }

  func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
    onVideo(sampleBuffer, type)
  }

  func captureOutput(
    _ output: AVCaptureOutput,
    didOutput sampleBuffer: CMSampleBuffer,
    from connection: AVCaptureConnection
  ) {
    if output is AVCaptureVideoDataOutput {
      guard let buf = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
      onCamera(buf, cameraOrientation(from: sampleBuffer))
      return
    }
    onAudio(sampleBuffer)
  }
}

final class Recorder: @unchecked Sendable {
  private let outputURL: URL
  private let display: SCDisplay
  private let audioDevice: AVCaptureDevice
  private let cameraDevice: AVCaptureDevice?
  private let excludePid: pid_t?
  private let writerQueue = DispatchQueue(label: "sck-record.writer")
  private let cameraLock = NSLock()
  private let ciContext = CIContext(options: nil)

  private var assetWriter: AVAssetWriter!
  private var videoInput: AVAssetWriterInput!
  private var audioInput: AVAssetWriterInput!
  private var bridge: Bridge!
  private var stream: SCStream?
  private var captureSession: AVCaptureSession?

  private var latestCameraPixelBuffer: CVPixelBuffer?
  private var latestCameraOrientation: CGImagePropertyOrientation = .up
  private var sessionStarted = false
  private var sessionStart: CMTime = .invalid
  private var stopping = false
  private var encodeWidth = 0
  private var encodeHeight = 0

  init(
    outputURL: URL,
    display: SCDisplay,
    audioDevice: AVCaptureDevice,
    cameraDevice: AVCaptureDevice?,
    excludePid: pid_t?,
  ) {
    self.outputURL = outputURL
    self.display = display
    self.audioDevice = audioDevice
    self.cameraDevice = cameraDevice
    self.excludePid = excludePid
  }

  static func loadDevices(
    displayIndex: Int,
    audioIndex: Int,
    cameraIndex: Int?,
  ) async throws -> (SCDisplay, AVCaptureDevice, AVCaptureDevice?) {
    let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
    let displays = content.displays.sorted { $0.displayID < $1.displayID }
    guard displayIndex >= 0, displayIndex < displays.count else {
      throw RecordError.badDisplay(displayIndex, displays.count)
    }
    let mics = sortedAudioCaptureDevices()
    guard audioIndex >= 0, audioIndex < mics.count else {
      throw RecordError.badAudio(audioIndex, mics.count)
    }
    var camera: AVCaptureDevice?
    if let cameraIndex, cameraIndex >= 0 {
      let cameras = sortedCameraCaptureDevices()
      guard cameraIndex < cameras.count else {
        throw RecordError.badCamera(cameraIndex, cameras.count)
      }
      camera = cameras[cameraIndex]
    }
    return (displays[displayIndex], mics[audioIndex], camera)
  }

  func run() async throws {
    let micGranted = await withCheckedContinuation { (c: CheckedContinuation<Bool, Never>) in
      AVCaptureDevice.requestAccess(for: .audio) { ok in c.resume(returning: ok) }
    }
    guard micGranted else { throw RecordError.writer("Microphone access denied") }

    if cameraDevice != nil {
      let camGranted = await withCheckedContinuation { (c: CheckedContinuation<Bool, Never>) in
        AVCaptureDevice.requestAccess(for: .video) { ok in c.resume(returning: ok) }
      }
      guard camGranted else { throw RecordError.writer("Camera access denied") }
      fputs("sck-record: camera \(cameraDevice!.localizedName)\n", stderr)
    }

    if FileManager.default.fileExists(atPath: outputURL.path) {
      try? FileManager.default.removeItem(at: outputURL)
    }

    bridge = Bridge(
      onVideo: { [weak self] buf, type in
        self?.handleVideo(buf, type: type)
      },
      onAudio: { [weak self] buf in
        self?.handleAudio(buf)
      },
      onCamera: { [weak self] buf, orientation in
        self?.storeCameraFrame(buf, orientation: orientation)
      },
    )

    assetWriter = try AVAssetWriter(url: outputURL, fileType: .mp4)

    let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
    var excludeApps: [SCRunningApplication] = []
    if let excludePid {
      excludeApps = content.applications.filter { $0.processID == excludePid }
      if !excludeApps.isEmpty {
        fputs("sck-record: excluding recorder UI (pid \(excludePid))\n", stderr)
      }
    }
    let filter = SCContentFilter(display: display, excludingApplications: excludeApps, exceptingWindows: [])
    let geom = captureGeometry(display: display, filter: filter)
    let w = geom.width
    let h = geom.height
    encodeWidth = w
    encodeHeight = h
    fputs(
      "sck-record: capture \(w)x\(h) px (display \(display.width)x\(display.height) pt, scale \(geom.pointPixelScale))\n",
      stderr,
    )
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

    let cfg = SCStreamConfiguration()
    applyCaptureGeometry(cfg, geom)
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
    let micInput = try AVCaptureDeviceInput(device: audioDevice)
    guard session.canAddInput(micInput) else { throw RecordError.writer("cannot add mic input") }
    session.addInput(micInput)
    let audioOut = AVCaptureAudioDataOutput()
    audioOut.setSampleBufferDelegate(bridge, queue: writerQueue)
    guard session.canAddOutput(audioOut) else { throw RecordError.writer("cannot add mic output") }
    session.addOutput(audioOut)

    if let cameraDevice {
      let camInput = try AVCaptureDeviceInput(device: cameraDevice)
      guard session.canAddInput(camInput) else { throw RecordError.writer("cannot add camera input") }
      session.addInput(camInput)
      let videoOut = AVCaptureVideoDataOutput()
      videoOut.videoSettings = [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
      ]
      videoOut.alwaysDiscardsLateVideoFrames = true
      videoOut.setSampleBufferDelegate(bridge, queue: writerQueue)
      guard session.canAddOutput(videoOut) else { throw RecordError.writer("cannot add camera output") }
      session.addOutput(videoOut)
      if let conn = videoOut.connection(with: .video), conn.isVideoMirroringSupported {
        conn.isVideoMirrored = true
      }
    }

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

  private func storeCameraFrame(_ buffer: CVPixelBuffer, orientation: CGImagePropertyOrientation) {
    cameraLock.lock()
    latestCameraPixelBuffer = buffer
    latestCameraOrientation = orientation
    cameraLock.unlock()
  }

  private func circleMask(size: CGFloat) -> CIImage {
    let radial = CIFilter(
      name: "CIRadialGradient",
      parameters: [
        "inputCenter": CIVector(x: size / 2, y: size / 2),
        "inputRadius0": (size / 2) - 0.5,
        "inputRadius1": size / 2,
        "inputColor0": CIColor.white,
        "inputColor1": CIColor(red: 0, green: 0, blue: 0, alpha: 0),
      ],
    )!.outputImage!.cropped(to: CGRect(x: 0, y: 0, width: size, height: size))
    return radial
  }

  private func compositeCamera(onto screenBuffer: CVPixelBuffer, width w: Int, height h: Int) {
    cameraLock.lock()
    let camBuf = latestCameraPixelBuffer
    let orientation = latestCameraOrientation
    cameraLock.unlock()
    guard let camBuf else { return }

    let marginPoints: CGFloat = 20
    let pointScale = CGFloat(w) / CGFloat(max(1, display.width))
    let margin = marginPoints * pointScale
    let pipSize = min(max(CGFloat(w) * 0.18, 120 * pointScale), 220 * pointScale)

    var camImage = CIImage(cvPixelBuffer: camBuf).oriented(forExifOrientation: Int32(orientation.rawValue))
    camImage = mirrorHorizontally(camImage)
    let camExtent = camImage.extent
    let scale = max(pipSize / camExtent.width, pipSize / camExtent.height)
    camImage = camImage.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
    let scaled = camImage.extent
    let cropRect = CGRect(
      x: scaled.midX - pipSize / 2,
      y: scaled.midY - pipSize / 2,
      width: pipSize,
      height: pipSize,
    )
    camImage = camImage.cropped(to: cropRect)
    let tx = margin - cropRect.origin.x
    let ty = margin - cropRect.origin.y
    camImage = camImage.transformed(by: CGAffineTransform(translationX: tx, y: ty))

    let mask = circleMask(size: pipSize)
    if let masked = CIFilter(
      name: "CIBlendWithMask",
      parameters: [
        kCIInputImageKey: camImage,
        kCIInputBackgroundImageKey: CIImage.empty(),
        kCIInputMaskImageKey: mask,
      ],
    )?.outputImage {
      camImage = masked
    }

    let screenImage = CIImage(cvPixelBuffer: screenBuffer)
    guard
      let composited = CIFilter(
        name: "CISourceOverCompositing",
        parameters: [
          kCIInputImageKey: camImage,
          kCIInputBackgroundImageKey: screenImage,
        ],
      )?.outputImage
    else { return }

    ciContext.render(
      composited,
      to: screenBuffer,
      bounds: CGRect(x: 0, y: 0, width: w, height: h),
      colorSpace: CGColorSpaceCreateDeviceRGB(),
    )
  }

  private func handleVideo(_ sampleBuffer: CMSampleBuffer, type: SCStreamOutputType) {
    guard !stopping else { return }
    if type == .audio { return }
    guard CMSampleBufferIsValid(sampleBuffer), let imageBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
      return
    }
    let pts = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
    if !sessionStarted {
      sessionStart = pts
      assetWriter.startSession(atSourceTime: pts)
      sessionStarted = true
    }
    if cameraDevice != nil {
      compositeCamera(onto: imageBuffer, width: encodeWidth, height: encodeHeight)
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
  let cameras = sortedCameraCaptureDevices()
  struct Entry: Codable {
    let index: Int
    let displayId: UInt32
    let name: String
  }
  struct Root: Codable {
    let video: [Entry]
    let audio: [Entry]
    let cameras: [Entry]
  }
  let video = displays.enumerated().map { i, d -> Entry in
    let scale = max(1, Int(CGDisplayPixelsWide(d.displayID)) / max(1, d.width))
    let ew = floor16(d.width * scale)
    let eh = floor16(d.height * scale)
    let builtIn = CGDisplayIsBuiltin(d.displayID) != 0
    let kind = builtIn ? "Built-in Display" : "External Display"
    return Entry(index: i, displayId: d.displayID, name: "\(kind) (\(ew)×\(eh))")
  }
  let audio = mics.enumerated().map { i, m in
    Entry(index: i, displayId: 0, name: m.localizedName)
  }
  let cameraEntries = cameras.enumerated().map { i, c in
    Entry(index: i, displayId: 0, name: c.localizedName)
  }
  let enc = JSONEncoder()
  enc.outputFormatting = [.sortedKeys]
  let data = try enc.encode(Root(video: video, audio: audio, cameras: cameraEntries))
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write(Data([10]))
}

private func parseArgs() throws -> (output: URL, display: Int, audio: Int, camera: Int?, excludePid: pid_t?) {
  var out: String?
  var d: Int?
  var a: Int?
  var camera: Int?
  var excludePid: pid_t?
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
    case "--camera":
      if let v = i.next() { camera = Int(v) }
    case "--exclude-pid":
      if let v = i.next(), let p = Int32(v) { excludePid = pid_t(p) }
    default:
      break
    }
  }
  guard let path = out, let di = d, let ai = a else { throw RecordError.usage }
  return (URL(fileURLWithPath: path), di, ai, camera, excludePid)
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

  let filter = SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])
  var geom = captureGeometry(display: display, filter: filter)
  if let mw = maxWidth, mw > 0, display.width > mw {
    let ratio = Double(mw) / Double(max(1, display.width))
    geom = CaptureGeometry(
      sourceRect: geom.sourceRect,
      width: max(16, Int((Double(geom.width) * ratio).rounded())),
      height: max(16, Int((Double(geom.height) * ratio).rounded())),
      pointPixelScale: geom.pointPixelScale,
    )
  }
  let targetW = geom.width
  let targetH = geom.height

  let cfg = SCStreamConfiguration()
  applyCaptureGeometry(cfg, geom)
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
      onCamera: { _, _ in },
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
      let (url, dIdx, aIdx, camIdx, excludePid) = try parseArgs()
      let (display, mic, camera) = try await Recorder.loadDevices(
        displayIndex: dIdx,
        audioIndex: aIdx,
        cameraIndex: camIdx,
      )
      fputs("sck-record: display \(display.displayID) \(display.width)x\(display.height) mic \(mic.localizedName)\n", stderr)
      let rec = Recorder(
        outputURL: url,
        display: display,
        audioDevice: mic,
        cameraDevice: camera,
        excludePid: excludePid,
      )
      try await rec.run()
      fputs("sck-record: finished \(url.path)\n", stderr)
    } catch {
      fputs("\(error)\n", stderr)
      exit(1)
    }
  }
}
