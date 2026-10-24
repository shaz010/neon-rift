import AppKit
import Foundation

let path = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : ""
guard let image = NSImage(contentsOfFile: path),
      let tiff = image.tiffRepresentation,
      let rep = NSBitmapImageRep(data: tiff) else {
    fputs("unreadable \(path)\n", stderr)
    exit(2)
}
let w = rep.pixelsWide
let h = rep.pixelsHigh
var bright = 0
var sum = 0.0
var n = 0
let stepX = max(1, w / 12)
let stepY = max(1, h / 14)
var y = h / 10
while y < h * 9 / 10 {
    var x = w / 10
    while x < w * 9 / 10 {
        let color = rep.colorAt(x: x, y: y) ?? .black
        let luma = color.redComponent + color.greenComponent + color.blueComponent
        sum += luma
        n += 1
        if luma > 0.35 { bright += 1 }
        x += stepX
    }
    y += stepY
}
let avg = n > 0 ? sum / Double(n) : 0
print("bright \(bright) of \(n) avg \(String(format: "%.3f", avg)) \(w)x\(h)")
if bright < 3 && avg < 0.05 {
    exit(1)
}
