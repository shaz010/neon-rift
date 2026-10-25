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

func sample(_ x: Int, _ y: Int) -> Double {
    let color = rep.colorAt(x: min(max(0, x), w - 1), y: min(max(0, y), h - 1)) ?? .black
    return Double(max(color.redComponent, color.greenComponent, color.blueComponent))
}

func strip(x0: Int, x1: Int) -> (black: Int, lit: Int, n: Int) {
    let y0 = h * 20 / 100
    let y1 = max(y0 + 1, h * 80 / 100)
    let left = min(x0, x1)
    let right = max(x0, x1)
    var black = 0
    var lit = 0
    var n = 0
    let stepX = max(1, (right - left) / 8)
    let stepY = max(1, (y1 - y0) / 28)
    var y = y0
    while y < y1 {
        var x = left
        while x < right {
            let maxC = sample(x, y)
            n += 1
            if maxC <= 1.0 / 255.0 { black += 1 }
            if maxC > 8.0 / 255.0 { lit += 1 }
            x += stepX
        }
        y += stepY
    }
    return (black, lit, max(n, 1))
}

let left = strip(x0: max(1, w / 100), x1: max(4, w * 6 / 100))
let right = strip(x0: w * 94 / 100, x1: max(w * 94 / 100 + 2, w * 99 / 100))
let center = strip(x0: w * 35 / 100, x1: w * 65 / 100)

func frac(_ part: Int, _ n: Int) -> Double { Double(part) / Double(n) }
let leftBlack = frac(left.black, left.n)
let rightBlack = frac(right.black, right.n)
let centerLit = frac(center.lit, center.n)
print("bleed \(w)x\(h) leftBlack \(String(format: "%.2f", leftBlack)) rightBlack \(String(format: "%.2f", rightBlack)) centerLit \(String(format: "%.2f", centerLit))")
if leftBlack > 0.90 && rightBlack > 0.90 && centerLit > 0.12 {
    fputs("pillarbox: scene does not reach the side edges\n", stderr)
    exit(1)
}
