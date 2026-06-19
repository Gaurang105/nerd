// nerd-ocr: read an image path, print recognized text (one line per observation).
// Uses Apple's Vision framework — fully local, ~100-300ms, no network.
import Foundation
import Vision
import AppKit

guard CommandLine.arguments.count > 1 else {
  FileHandle.standardError.write("usage: nerd-ocr <image-path>\n".data(using: .utf8)!)
  exit(1)
}

let path = CommandLine.arguments[1]
guard let image = NSImage(contentsOfFile: path),
      let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
  exit(1)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
do {
  try handler.perform([request])
  let lines = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
  print(lines.joined(separator: "\n"))
} catch {
  exit(1)
}
