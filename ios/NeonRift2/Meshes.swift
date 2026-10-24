import SceneKit
import simd

enum ShipPoints {
    static let gunL = simd_float3(-2.15, -0.22, -2.5)
    static let gunR = simd_float3(2.15, -0.22, -2.5)
    static let wingL = simd_float3(-6.3, 0.05, -0.3)
    static let wingR = simd_float3(6.3, 0.05, -0.3)
}

enum Meshes {
    static func fighter(art: ArtSet) -> SCNNode {
        let root = SCNNode()
        root.name = "fighter"

        // Nose to tail along -Z. Engines sit at the rear, toward the chase camera.
        box(root, simd_float3(1.15, 0.72, 2.4), simd_float3(0, 0.05, -5.3), art.hull, chamfer: 0.08)
        box(root, simd_float3(1.7, 0.95, 3.2), simd_float3(0, 0.02, -2.6), art.hull, chamfer: 0.06)
        box(root, simd_float3(2.15, 1.05, 3.4), simd_float3(0, 0, 0.2), art.hull, chamfer: 0.05)
        box(root, simd_float3(1.7, 0.9, 2.2), simd_float3(0, 0.05, 2.6), art.hullDark, chamfer: 0.05)

        box(root, simd_float3(7.6, 0.16, 2.8), simd_float3(0, 0.02, -0.5), art.hull, chamfer: 0.02)
        box(root, simd_float3(5.2, 0.12, 1.6), simd_float3(0, 0.12, -1.5), art.hullDark, chamfer: 0.02)
        box(root, simd_float3(2.4, 0.14, 2.2), simd_float3(-4.6, 0.08, -0.2), art.hullWorn, euler: simd_float3(0, 0, 0.08), chamfer: 0.02)
        box(root, simd_float3(2.4, 0.14, 2.2), simd_float3(4.6, 0.08, -0.2), art.hullWorn, euler: simd_float3(0, 0, -0.08), chamfer: 0.02)
        box(root, simd_float3(0.12, 1.15, 1.5), simd_float3(-1.15, 0.7, 1.8), art.hullDark, euler: simd_float3(-0.4, 0, 0.04))
        box(root, simd_float3(0.12, 1.15, 1.5), simd_float3(1.15, 0.7, 1.8), art.hullDark, euler: simd_float3(-0.4, 0, -0.04))

        let canopy = SCNSphere(radius: 0.62)
        canopy.segmentCount = 16
        canopy.materials = [art.glass]
        let canopyNode = SCNNode(geometry: canopy)
        canopyNode.simdScale = simd_float3(0.85, 0.48, 1.35)
        canopyNode.simdPosition = simd_float3(0, 0.62, -2.15)
        root.addChildNode(canopyNode)

        for side: Float in [-1, 1] {
            let nacelle = SCNCylinder(radius: 0.62, height: 3.1)
            nacelle.radialSegmentCount = 18
            nacelle.heightSegmentCount = 1
            nacelle.materials = [art.hullDark]
            let n = SCNNode(geometry: nacelle)
            n.eulerAngles.x = Float.pi / 2
            n.simdPosition = simd_float3(side * 1.12, -0.08, 2.15)
            root.addChildNode(n)

            let lip = SCNTorus(ringRadius: 0.58, pipeRadius: 0.07)
            lip.ringSegmentCount = 18
            lip.pipeSegmentCount = 8
            lip.materials = [art.hullWorn]
            let lipNode = SCNNode(geometry: lip)
            lipNode.simdPosition = simd_float3(side * 1.12, -0.08, 3.72)
            root.addChildNode(lipNode)

            let glow = SCNSphere(radius: 0.42)
            glow.segmentCount = 12
            glow.materials = [art.cyanGlow]
            let g = SCNNode(geometry: glow)
            g.name = "engineGlow"
            g.simdPosition = simd_float3(side * 1.12, -0.08, 3.85)
            root.addChildNode(g)

            let heat = SCNPlane(width: 1.5, height: 2.3)
            heat.materials = [art.heat]
            heat.widthSegmentCount = 1
            heat.heightSegmentCount = 1
            let h = SCNNode(geometry: heat)
            h.name = "heat"
            h.simdPosition = simd_float3(side * 1.12, -0.08, 4.15)
            root.addChildNode(h)
        }

        // Raised plates so the sun catches a panel edge.
        let plates: [(SIMD3<Float>, SIMD3<Float>)] = [
            (simd_float3(1.05, 0.08, 1.4), simd_float3(-0.35, 0.52, 0.4)),
            (simd_float3(0.7, 0.06, 0.9), simd_float3(0.55, 0.5, -0.8)),
            (simd_float3(0.55, 0.06, 1.1), simd_float3(-0.2, 0.48, 2.1)),
            (simd_float3(1.3, 0.05, 0.7), simd_float3(0.1, -0.48, 0.6)),
            (simd_float3(0.4, 0.05, 0.8), simd_float3(-2.4, 0.16, -0.6)),
            (simd_float3(0.4, 0.05, 0.8), simd_float3(2.4, 0.16, -0.6)),
        ]
        for (size, at) in plates {
            box(root, size, at, art.hullWorn, chamfer: 0.015)
        }

        let iff = SCNSphere(radius: 0.12)
        iff.segmentCount = 8
        iff.materials = [art.cyanGlow]
        let iffNode = SCNNode(geometry: iff)
        iffNode.simdPosition = simd_float3(0, 0.62, 1.2)
        root.addChildNode(iffNode)
        return root
    }

    static func interceptor(art: ArtSet) -> SCNNode {
        let root = SCNNode()
        root.name = "enemy"
        box(root, simd_float3(0.7, 0.42, 2.6), simd_float3(0, 0, -1.8), art.hullDark, chamfer: 0.04)
        box(root, simd_float3(1.15, 0.55, 2.4), simd_float3(0, 0, 0.4), art.hullDark, chamfer: 0.04)
        box(root, simd_float3(4.4, 0.1, 1.5), simd_float3(0, 0, 0.1), art.hullWorn, chamfer: 0.02)
        for side: Float in [-1, 1] {
            let glow = SCNSphere(radius: 0.16)
            glow.segmentCount = 8
            glow.materials = [art.redGlow]
            let g = SCNNode(geometry: glow)
            g.simdPosition = simd_float3(side * 2.15, 0.08, 0.2)
            root.addChildNode(g)
            let engine = SCNSphere(radius: 0.28)
            engine.segmentCount = 10
            engine.materials = [art.redGlow]
            let e = SCNNode(geometry: engine)
            e.simdPosition = simd_float3(side * 0.42, -0.05, 1.7)
            root.addChildNode(e)
        }
        return root
    }

    static func dreadnought(art: ArtSet) -> SCNNode {
        let root = SCNNode()
        root.name = "warden"
        box(root, simd_float3(28, 16, 70), simd_float3(0, 0, 20), art.hullDark, chamfer: 0.4)
        box(root, simd_float3(46, 22, 120), simd_float3(0, -2, -40), art.hullDark, chamfer: 0.5)
        box(root, simd_float3(70, 18, 90), simd_float3(0, -4, -110), art.hull, chamfer: 0.4)
        box(root, simd_float3(36, 14, 80), simd_float3(0, 6, -70), art.hullWorn, chamfer: 0.3)
        box(root, simd_float3(18, 10, 50), simd_float3(0, 2, 70), art.hullDark, chamfer: 0.3)
        // Orange cracks along the hull.
        let cracks: [(SIMD3<Float>, SIMD3<Float>)] = [
            (simd_float3(0.6, 0.6, 78), simd_float3(8, 8, -20)),
            (simd_float3(0.5, 0.5, 60), simd_float3(-14, 2, -60)),
            (simd_float3(54, 0.45, 0.45), simd_float3(0, -6, -100)),
            (simd_float3(0.4, 12, 0.4), simd_float3(22, 0, -30)),
            (simd_float3(0.4, 10, 0.4), simd_float3(-20, 1, -80)),
        ]
        for (size, at) in cracks {
            box(root, size, at, art.crack, chamfer: 0)
        }
        for side: Float in [-1, 1] {
            for z: Float in [-20, -70, -120] {
                let light = SCNSphere(radius: 1.4)
                light.segmentCount = 8
                light.materials = [art.redGlow]
                let n = SCNNode(geometry: light)
                n.simdPosition = simd_float3(side * 22, 4, z)
                root.addChildNode(n)
            }
        }
        return root
    }

    static func hangar(art: ArtSet) -> SCNNode {
        let root = SCNNode()
        root.name = "hangar"
        // Door faces -Z at z = 22. Interior runs back to z = 128.
        box(root, simd_float3(40, 0.6, 110), simd_float3(0, -0.3, 76), art.floorMat, chamfer: 0)
        box(root, simd_float3(40, 0.8, 110), simd_float3(0, 15.2, 76), art.hangar, chamfer: 0)
        box(root, simd_float3(0.8, 16, 110), simd_float3(-20, 7.5, 76), art.hangar, chamfer: 0)
        box(root, simd_float3(0.8, 16, 110), simd_float3(20, 7.5, 76), art.hangar, chamfer: 0)
        box(root, simd_float3(40, 16, 0.8), simd_float3(0, 7.5, 128), art.hangar, chamfer: 0)
        // Girders and practicals.
        for z: Float in [40, 62, 84, 106] {
            box(root, simd_float3(40, 0.35, 0.35), simd_float3(0, 14.2, z), art.hullDark, chamfer: 0)
            let strip = SCNBox(width: 10, height: 0.12, length: 0.28, chamferRadius: 0)
            strip.materials = [art.orangeGlow]
            let n = SCNNode(geometry: strip)
            n.simdPosition = simd_float3(0, 14.0, z)
            root.addChildNode(n)
        }
        for side: Float in [-1, 1] {
            let lamp = SCNNode()
            lamp.light = SCNLight()
            lamp.light?.type = .omni
            lamp.light?.intensity = 380
            lamp.light?.color = UIColor(red: 1, green: 0.82, blue: 0.62, alpha: 1)
            lamp.light?.attenuationStartDistance = 2
            lamp.light?.attenuationEndDistance = 28
            lamp.simdPosition = simd_float3(side * 6, 12.5, 70)
            root.addChildNode(lamp)
        }
        return root
    }

    static func rift(art: ArtSet, radius: CGFloat) -> SCNNode {
        let root = SCNNode()
        root.name = "rift"
        for i in 0..<2 {
            let plane = SCNPlane(width: radius * 2, height: radius * 2)
            plane.materials = [art.spiral]
            let n = SCNNode(geometry: plane)
            n.name = "spiral"
            n.simdPosition = simd_float3(0, 0, Float(i) * -1.5)
            root.addChildNode(n)
        }
        let core = SCNSphere(radius: radius * 0.12)
        core.segmentCount = 12
        core.materials = [art.sunMat]
        let c = SCNNode(geometry: core)
        root.addChildNode(c)
        return root
    }

    static func planet(art: ArtSet) -> SCNNode {
        let root = SCNNode()
        let sphere = SCNSphere(radius: 260)
        sphere.segmentCount = 48
        sphere.materials = [art.planet]
        let body = SCNNode(geometry: sphere)
        root.addChildNode(body)

        let disc = SCNCylinder(radius: 430, height: 0.8)
        disc.radialSegmentCount = 64
        disc.heightSegmentCount = 1
        let clear = SCNMaterial()
        clear.lightingModel = .constant
        clear.diffuse.contents = UIColor.clear
        clear.transparency = 0.01
        disc.materials = [clear, art.ring, art.ring]
        let ring = SCNNode(geometry: disc)
        ring.eulerAngles.z = Float(0.42)
        ring.eulerAngles.x = Float(0.35)
        root.addChildNode(ring)
        root.simdPosition = simd_float3(240, 150, -760)
        return root
    }

    static func sun(art: ArtSet) -> SCNNode {
        let sphere = SCNSphere(radius: 80)
        sphere.segmentCount = 24
        sphere.materials = [art.sunMat]
        let node = SCNNode(geometry: sphere)
        node.simdPosition = SpaceLook.sunDirection * 2200
        node.name = "sun"
        return node
    }

    static func pickup(art: ArtSet) -> SCNNode {
        let root = SCNNode()
        root.name = "pickup"
        let up = SCNPyramid(width: 1.5, height: 1.7, length: 1.5)
        up.materials = [art.gold]
        let a = SCNNode(geometry: up)
        a.simdPosition = simd_float3(0, 0.2, 0)
        let down = SCNPyramid(width: 1.5, height: 1.7, length: 1.5)
        down.materials = [art.gold]
        let b = SCNNode(geometry: down)
        b.simdPosition = simd_float3(0, -0.2, 0)
        b.eulerAngles.z = Float.pi
        root.addChildNode(a)
        root.addChildNode(b)
        return root
    }

    static func cockpit(art: ArtSet) -> SCNNode {
        let root = SCNNode()
        root.name = "cockpit"
        let helmet = SCNSphere(radius: 0.22)
        helmet.segmentCount = 16
        helmet.materials = [art.helmet]
        let h = SCNNode(geometry: helmet)
        h.simdPosition = simd_float3(-0.34, -0.42, -0.85)
        root.addChildNode(h)
        let visor = SCNSphere(radius: 0.12)
        visor.segmentCount = 12
        visor.materials = [art.visor]
        let v = SCNNode(geometry: visor)
        v.simdScale = simd_float3(1.1, 0.72, 0.45)
        v.simdPosition = simd_float3(-0.24, -0.38, -0.78)
        root.addChildNode(v)
        // Canopy struts in camera space. -Z is out the glass.
        box(root, simd_float3(0.025, 0.7, 0.025), simd_float3(-0.42, 0.05, -0.9), art.strut, euler: simd_float3(0.4, 0, 0.5))
        box(root, simd_float3(0.025, 0.7, 0.025), simd_float3(0.42, 0.05, -0.9), art.strut, euler: simd_float3(0.4, 0, -0.5))
        box(root, simd_float3(0.9, 0.02, 0.02), simd_float3(0, 0.38, -0.95), art.strut)
        return root
    }

    @discardableResult
    private static func box(
        _ parent: SCNNode,
        _ size: SIMD3<Float>,
        _ at: SIMD3<Float>,
        _ mat: SCNMaterial,
        euler: SIMD3<Float> = .zero,
        chamfer: Float = 0.04
    ) -> SCNNode {
        let geom = SCNBox(
            width: CGFloat(size.x),
            height: CGFloat(size.y),
            length: CGFloat(size.z),
            chamferRadius: CGFloat(chamfer)
        )
        geom.widthSegmentCount = 1
        geom.heightSegmentCount = 1
        geom.lengthSegmentCount = 1
        geom.chamferSegmentCount = chamfer > 0 ? 2 : 1
        geom.materials = [mat]
        let node = SCNNode(geometry: geom)
        node.simdPosition = at
        node.simdEulerAngles = euler
        parent.addChildNode(node)
        return node
    }
}
