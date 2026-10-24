import SceneKit
import UIKit
import simd

/// Procedural textures and PBR materials. No downloaded or generated-for-pay art.
enum SpaceLook {
    static let sunDirection = simd_normalize(simd_float3(-0.38, 0.58, -0.72))
}

enum Noise {
    static func hash2(_ x: Int, _ y: Int) -> Float {
        var n = UInt32(truncatingIfNeeded: x) &* 374761393 &+ UInt32(truncatingIfNeeded: y) &* 668265263
        n = (n ^ (n >> 13)) &* 1274126177
        return Float(n & 0x00FF_FFFF) / Float(0x00FF_FFFF)
    }

    static func value(_ x: Float, _ y: Float) -> Float {
        let x0 = Int(floor(x))
        let y0 = Int(floor(y))
        let fx = x - Float(x0)
        let fy = y - Float(y0)
        let sx = fx * fx * (3 - 2 * fx)
        let sy = fy * fy * (3 - 2 * fy)
        let a = hash2(x0, y0)
        let b = hash2(x0 &+ 1, y0)
        let c = hash2(x0, y0 &+ 1)
        let d = hash2(x0 &+ 1, y0 &+ 1)
        return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
    }

    static func fbm(_ x: Float, _ y: Float, octaves: Int = 4) -> Float {
        var v: Float = 0
        var a: Float = 0.5
        var f: Float = 1
        for _ in 0..<octaves {
            v += a * value(x * f, y * f)
            f *= 2
            a *= 0.5
        }
        return v
    }
}

enum SkyPaint {
    static func color(_ dir: simd_float3) -> SIMD3<Float> {
        let d = simd_normalize(dir)
        let n1 = Noise.fbm(d.x * 1.7 + 2.2, d.y * 1.3 + d.z * 1.1 + 4.0)
        let n2 = Noise.fbm(d.z * 1.5 + 8.0, d.x * 0.9 + 1.4)
        let tealMask = saturate(0.55 - d.x)
        let rustMask = saturate(0.45 + d.x)
        var c = SIMD3<Float>(0.012, 0.016, 0.022)
        c += SIMD3<Float>(0.05, 0.28, 0.32) * smoothstep(0.38, 0.78, n1) * tealMask
        c += SIMD3<Float>(0.16, 0.55, 0.62) * pow(saturate(n1), 3.2) * tealMask
        c += SIMD3<Float>(0.55, 0.18, 0.05) * smoothstep(0.42, 0.82, n2) * rustMask
        c += SIMD3<Float>(0.95, 0.42, 0.12) * pow(saturate(n2), 3.4) * rustMask
        let band = exp(-pow(d.y / 0.18, 2))
        c += SIMD3<Float>(0.10, 0.12, 0.16) * band * 0.55
        let sun = pow(saturate(simd_dot(d, SpaceLook.sunDirection)), 96)
        c += SIMD3<Float>(1.0, 0.86, 0.62) * sun * 1.35
        let qx = Int(d.x * 220)
        let qy = Int(d.y * 220)
        let qz = Int(d.z * 220)
        let star = Noise.hash2(qx &+ qz &* 19, qy &+ 3)
        if star > 0.992 {
            let m = pow((star - 0.992) / 0.008, 0.45)
            c += SIMD3<Float>(m, m, m)
        }
        return c
    }
}

enum Raster {
    static func image(width: Int, height: Int, opaque: Bool, _ sample: (Float, Float) -> SIMD4<Float>) -> UIImage {
        let count = width * height * 4
        let data = UnsafeMutablePointer<UInt8>.allocate(capacity: count)
        for y in 0..<height {
            let v = Float(y) / Float(height - 1)
            for x in 0..<width {
                let u = Float(x) / Float(width - 1)
                let s = sample(u, v)
                let a = min(1, max(0, s.w))
                let i = (y * width + x) * 4
                data[i] = UInt8(min(255, max(0, s.x * a * 255)))
                data[i + 1] = UInt8(min(255, max(0, s.y * a * 255)))
                data[i + 2] = UInt8(min(255, max(0, s.z * a * 255)))
                data[i + 3] = UInt8(min(255, max(0, a * 255)))
            }
        }
        let ctx = CGContext(
            data: data,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: width * 4,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue
        )
        let cg = ctx?.makeImage()
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = opaque
        let rendered = UIGraphicsImageRenderer(size: CGSize(width: width, height: height), format: format).image { rctx in
            if let cg {
                rctx.cgContext.draw(cg, in: CGRect(x: 0, y: 0, width: width, height: height))
            }
        }
        data.deallocate()
        return rendered
    }

    static func cubeFaces(size: Int) -> [UIImage] {
        (0..<6).map { face in
            image(width: size, height: size, opaque: true) { u, v in
                let dir = cubeDirection(face: face, u: u * 2 - 1, v: v * 2 - 1)
                let c = SkyPaint.color(dir)
                return SIMD4<Float>(c.x, c.y, c.z, 1)
            }
        }
    }

    /// +X -X +Y -Y +Z -Z, matching SceneKit's lighting environment order.
    private static func cubeDirection(face: Int, u: Float, v: Float) -> simd_float3 {
        switch face {
        case 0: return simd_normalize(simd_float3(1, -v, -u))
        case 1: return simd_normalize(simd_float3(-1, -v, u))
        case 2: return simd_normalize(simd_float3(u, 1, v))
        case 3: return simd_normalize(simd_float3(u, -1, -v))
        case 4: return simd_normalize(simd_float3(u, -v, 1))
        default: return simd_normalize(simd_float3(-u, -v, -1))
        }
    }
}

func saturate(_ x: Float) -> Float { min(1, max(0, x)) }

func mix3(_ a: simd_float3, _ b: simd_float3, _ t: Float) -> simd_float3 {
    a + (b - a) * t
}

func smoothstep(_ edge0: Float, _ edge1: Float, _ x: Float) -> Float {
    let t = saturate((x - edge0) / (edge1 - edge0))
    return t * t * (3 - 2 * t)
}

final class ArtSet {
    static let shared = ArtSet()

    let sky: UIImage
    let faces: [UIImage]
    let grains: [UIImage]
    let hull: SCNMaterial
    let hullDark: SCNMaterial
    let hullWorn: SCNMaterial
    let glass: SCNMaterial
    let cyanGlow: SCNMaterial
    let redGlow: SCNMaterial
    let orangeGlow: SCNMaterial
    let gold: SCNMaterial
    let heat: SCNMaterial
    let fire: SCNMaterial
    let smoke: SCNMaterial
    let spiral: SCNMaterial
    let planet: SCNMaterial
    let ring: SCNMaterial
    let hangar: SCNMaterial
    let floorMat: SCNMaterial
    let boltPlayer: SCNMaterial
    let boltEnemy: SCNMaterial
    let debris: SCNMaterial
    let sunMat: SCNMaterial
    let crack: SCNMaterial
    let helmet: SCNMaterial
    let visor: SCNMaterial
    let strut: SCNMaterial

    private init() {
        sky = Raster.image(width: 1024, height: 512, opaque: true) { u, v in
            let lon = (u - 0.5) * 2 * .pi
            let lat = (0.5 - v) * .pi
            let dir = simd_float3(sin(lon) * cos(lat), sin(lat), cos(lon) * cos(lat))
            let c = SkyPaint.color(dir)
            return SIMD4<Float>(c.x, c.y, c.z, 1)
        }
        faces = Raster.cubeFaces(size: 96)
        grains = (0..<3).map { seed in
            Raster.image(width: 128, height: 128, opaque: true) { u, v in
                let n = Noise.hash2(Int(u * 127) &+ seed * 17, Int(v * 127) &+ seed * 3)
                let g = 0.42 + n * 0.28
                return SIMD4<Float>(g, g, g, 1)
            }
        }

        let metal = Raster.image(width: 512, height: 512, opaque: true) { u, v in
            let brush = Noise.value(u * 90, v * 6)
            let scratch = Noise.hash2(Int(u * 400), Int(v * 40)) > 0.985 ? Float(0.25) : 0
            let seamX = abs(fract(u * 8) - 0.5) < 0.035 ? Float(0.45) : 0
            let seamY = abs(fract(v * 8) - 0.5) < 0.035 ? Float(0.45) : 0
            let grime = Noise.fbm(u * 4, v * 4, octaves: 3)
            var g = 0.28 + brush * 0.10 - grime * 0.08 - seamX - seamY + scratch
            g = saturate(g)
            return SIMD4<Float>(g, g * 0.98, g * 0.94, 1)
        }
        let rough = Raster.image(width: 256, height: 256, opaque: true) { u, v in
            let brush = Noise.value(u * 40, v * 3)
            let seam = (abs(fract(u * 8) - 0.5) < 0.04 || abs(fract(v * 8) - 0.5) < 0.04) ? Float(0.35) : 0
            let r = saturate(0.28 + brush * 0.18 + seam)
            return SIMD4<Float>(r, r, r, 1)
        }
        let normal = Raster.image(width: 256, height: 256, opaque: true) { u, v in
            func h(_ uu: Float, _ vv: Float) -> Float {
                let seam = (abs(fract(uu * 8) - 0.5) < 0.03 || abs(fract(vv * 8) - 0.5) < 0.03) ? Float(-0.8) : 0
                return Noise.value(uu * 30, vv * 4) * 0.25 + seam
            }
            let eps: Float = 1 / 256
            let dx = h(u - eps, v) - h(u + eps, v)
            let dy = h(u, v - eps) - h(u, v + eps)
            let n = simd_normalize(simd_float3(dx * 2.2, dy * 2.2, 1))
            return SIMD4<Float>(n.x * 0.5 + 0.5, n.y * 0.5 + 0.5, n.z * 0.5 + 0.5, 1)
        }
        let planetTex = Raster.image(width: 512, height: 256, opaque: true) { u, v in
            let band = sin((v * 46 + Noise.fbm(u * 3, v * 6, octaves: 3) * 1.6) * .pi)
            let storm = exp(-((u - 0.62) * (u - 0.62) * 28 + (v - 0.46) * (v - 0.46) * 70))
            let tan = SIMD3<Float>(0.62, 0.46, 0.28)
            let cream = SIMD3<Float>(0.86, 0.78, 0.58)
            let rust = SIMD3<Float>(0.45, 0.24, 0.12)
            var c = mix3(tan, cream, saturate(band * 0.5 + 0.5))
            c = mix3(c, rust, saturate(Noise.fbm(u * 8, v * 2, octaves: 2) - 0.45))
            c = mix3(c, SIMD3<Float>(0.72, 0.55, 0.32), storm)
            return SIMD4<Float>(c.x, c.y, c.z, 1)
        }
        let ringTex = Raster.image(width: 512, height: 512, opaque: false) { u, v in
            let d = SIMD2<Float>(u - 0.5, v - 0.5)
            let r = simd_length(d) * 2
            let hole = smoothstep(0.34, 0.40, r)
            let outer = 1 - smoothstep(0.86, 0.98, r)
            let bands = 0.45 + 0.55 * (0.5 + 0.5 * sin(r * 90 + Noise.value(u * 12, v * 12) * 2))
            let a = hole * outer * bands
            let c = SIMD3<Float>(0.72, 0.64, 0.52) * (0.55 + 0.45 * bands)
            return SIMD4<Float>(c.x, c.y, c.z, a)
        }
        let fireTex = Raster.image(width: 256, height: 256, opaque: false) { u, v in
            let r = simd_length(SIMD2<Float>(u - 0.5, v - 0.5)) * 2
            let n = Noise.fbm(u * 6, v * 6, octaves: 3)
            let a = saturate(1 - smoothstep(0.15, 1.0, r)) * (0.65 + 0.35 * n)
            let hot = SIMD3<Float>(1, 0.95, 0.75)
            let mid = SIMD3<Float>(1, 0.45, 0.08)
            let edge = SIMD3<Float>(0.35, 0.05, 0.01)
            var c = mix3(hot, mid, saturate(r * 1.3))
            c = mix3(c, edge, saturate(r))
            return SIMD4<Float>(c.x, c.y, c.z, a)
        }
        let smokeTex = Raster.image(width: 128, height: 128, opaque: false) { u, v in
            let r = simd_length(SIMD2<Float>(u - 0.5, v - 0.5)) * 2
            let n = Noise.fbm(u * 4, v * 4, octaves: 3)
            let a = saturate(1 - smoothstep(0.2, 1, r)) * n * 0.55
            return SIMD4<Float>(0.08, 0.07, 0.06, a)
        }
        let spiralTex = Raster.image(width: 512, height: 512, opaque: false) { u, v in
            let d = SIMD2<Float>(u - 0.5, v - 0.5)
            let r = simd_length(d)
            let ang = atan2(d.y, d.x)
            let arms = pow(abs(sin(ang * 2 + r * 22)), 6)
            let core = exp(-r * 7.5)
            let disk = 1 - smoothstep(0.46, 0.50, r)
            let a = saturate((arms * 0.85 + core) * disk)
            let c = mix3(SIMD3<Float>(0.45, 0.55, 0.85), SIMD3<Float>(1, 0.96, 0.9), saturate(core + arms))
            return SIMD4<Float>(c.x, c.y, c.z, a)
        }
        let heatTex = Raster.image(width: 128, height: 128, opaque: true) { u, v in
            let n = Noise.fbm(u * 8, v * 3, octaves: 3)
            return SIMD4<Float>(n, n * 1.1, n * 1.2, 1)
        }

        hull = ArtSet.pbr(diffuse: metal, rough: rough, normal: normal, metal: 0.92)
        hullDark = ArtSet.pbr(diffuse: metal, rough: rough, normal: normal, metal: 0.9)
        hullDark.multiply.contents = UIColor(white: 0.42, alpha: 1)
        hullWorn = ArtSet.pbr(diffuse: metal, rough: rough, normal: normal, metal: 0.55)
        hullWorn.multiply.contents = UIColor(red: 0.55, green: 0.50, blue: 0.42, alpha: 1)
        hullWorn.roughness.contents = 0.72

        glass = SCNMaterial()
        glass.lightingModel = .physicallyBased
        glass.diffuse.contents = UIColor(red: 0.02, green: 0.05, blue: 0.06, alpha: 1)
        glass.metalness.contents = 0.04
        glass.roughness.contents = 0.045
        glass.transparency = 0.42
        glass.fresnelExponent = 1.5
        glass.isDoubleSided = false

        cyanGlow = ArtSet.glow(UIColor(red: 0.25, green: 0.95, blue: 1, alpha: 1))
        redGlow = ArtSet.glow(UIColor(red: 1, green: 0.12, blue: 0.06, alpha: 1))
        orangeGlow = ArtSet.glow(UIColor(red: 1, green: 0.46, blue: 0.08, alpha: 1))
        gold = ArtSet.glow(UIColor(red: 1, green: 0.78, blue: 0.32, alpha: 1))
        gold.lightingModel = .physicallyBased
        gold.diffuse.contents = UIColor(red: 0.72, green: 0.52, blue: 0.18, alpha: 1)
        gold.metalness.contents = 1.0
        gold.roughness.contents = 0.22
        gold.emission.contents = UIColor(red: 1, green: 0.72, blue: 0.28, alpha: 1)
        gold.emission.intensity = 0.45

        heat = ArtSet.glow(UIColor(red: 0.35, green: 0.85, blue: 1, alpha: 1))
        heat.diffuse.contents = heatTex
        heat.diffuse.wrapS = .repeat
        heat.diffuse.wrapT = .repeat
        heat.transparency = 0.22
        heat.blendMode = .add
        heat.isDoubleSided = true
        heat.writesToDepthBuffer = false

        fire = ArtSet.sprite(fireTex, additive: true)
        smoke = ArtSet.sprite(smokeTex, additive: false)
        spiral = ArtSet.sprite(spiralTex, additive: true)

        planet = SCNMaterial()
        planet.lightingModel = .physicallyBased
        planet.diffuse.contents = planetTex
        planet.metalness.contents = 0.02
        planet.roughness.contents = 0.82
        planet.emission.contents = planetTex
        planet.emission.intensity = 0.12

        ring = ArtSet.sprite(ringTex, additive: false)
        ring.lightingModel = .physicallyBased
        ring.diffuse.contents = ringTex
        ring.metalness.contents = 0.05
        ring.roughness.contents = 0.55
        ring.isDoubleSided = true

        let concrete = Raster.image(width: 256, height: 256, opaque: true) { u, v in
            let n = Noise.fbm(u * 5, v * 5, octaves: 3)
            let g = 0.08 + n * 0.05
            return SIMD4<Float>(g, g * 0.98, g * 0.94, 1)
        }
        hangar = SCNMaterial()
        hangar.lightingModel = .physicallyBased
        hangar.diffuse.contents = concrete
        hangar.metalness.contents = 0.72
        hangar.roughness.contents = 0.48

        floorMat = SCNMaterial()
        floorMat.lightingModel = .physicallyBased
        floorMat.diffuse.contents = concrete
        floorMat.metalness.contents = 0.95
        floorMat.roughness.contents = 0.16
        floorMat.normal.contents = normal
        floorMat.normal.intensity = 0.35

        boltPlayer = ArtSet.glow(UIColor(red: 1, green: 0.62, blue: 0.22, alpha: 1))
        boltEnemy = ArtSet.glow(UIColor(red: 1, green: 0.16, blue: 0.08, alpha: 1))

        debris = ArtSet.pbr(diffuse: metal, rough: rough, normal: normal, metal: 0.7)
        debris.multiply.contents = UIColor(white: 0.35, alpha: 1)

        sunMat = ArtSet.glow(UIColor(red: 1, green: 0.93, blue: 0.75, alpha: 1))
        crack = ArtSet.glow(UIColor(red: 1, green: 0.32, blue: 0.05, alpha: 1))

        helmet = ArtSet.pbr(diffuse: metal, rough: rough, normal: normal, metal: 0.8)
        helmet.multiply.contents = UIColor(white: 0.22, alpha: 1)
        visor = glass
        strut = hangar
    }

    private static func pbr(diffuse: UIImage, rough: UIImage, normal: UIImage, metal: CGFloat) -> SCNMaterial {
        let m = SCNMaterial()
        m.lightingModel = .physicallyBased
        m.diffuse.contents = diffuse
        m.diffuse.wrapS = .repeat
        m.diffuse.wrapT = .repeat
        m.metalness.contents = metal
        m.roughness.contents = rough
        m.roughness.wrapS = .repeat
        m.roughness.wrapT = .repeat
        m.normal.contents = normal
        m.normal.intensity = 0.65
        m.normal.wrapS = .repeat
        m.normal.wrapT = .repeat
        return m
    }

    private static func glow(_ color: UIColor) -> SCNMaterial {
        let m = SCNMaterial()
        m.lightingModel = .constant
        m.diffuse.contents = color
        m.emission.contents = color
        m.emission.intensity = 1
        m.isDoubleSided = false
        return m
    }

    private static func sprite(_ image: UIImage, additive: Bool) -> SCNMaterial {
        let m = SCNMaterial()
        m.lightingModel = .constant
        m.diffuse.contents = image
        m.emission.contents = image
        m.transparent.contents = image
        m.isDoubleSided = true
        m.blendMode = additive ? .add : .alpha
        m.writesToDepthBuffer = false
        return m
    }
}

private func fract(_ x: Float) -> Float { x - floor(x) }
