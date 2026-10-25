import SceneKit
import UIKit
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
        canopyNode.name = "canopy"
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
        inspectionFit(root, art: art)
        return root
    }

    /// Cannons stay on the hull. Missile racks, extra barrels, shield dishes,
    /// and the reactor core are named upgrade-* and start hidden. A dropped-in
    /// USDZ can use the same names; ShipUpgrades unhides whichever are fitted.
    private static func inspectionFit(_ root: SCNNode, art: ArtSet) {
        for mount in [ShipPoints.gunL, ShipPoints.gunR] {
            let barrel = SCNCylinder(radius: 0.075, height: 1.7)
            barrel.radialSegmentCount = 12
            barrel.materials = [art.hullDark]
            let node = SCNNode(geometry: barrel)
            node.eulerAngles.x = .pi / 2
            node.simdPosition = mount + simd_float3(0, 0, -0.15)
            root.addChildNode(node)
            let lip = SCNTorus(ringRadius: 0.09, pipeRadius: 0.018)
            lip.ringSegmentCount = 12
            lip.pipeSegmentCount = 8
            lip.materials = [art.orangeGlow]
            let muzzle = SCNNode(geometry: lip)
            muzzle.simdPosition = mount + simd_float3(0, 0, -1.0)
            root.addChildNode(muzzle)
        }

        let spread = SCNNode()
        spread.name = "upgrade-spread"
        spread.isHidden = true
        for mount in [ShipPoints.gunL, ShipPoints.gunR] {
            let barrel = SCNCylinder(radius: 0.05, height: 1.2)
            barrel.radialSegmentCount = 10
            barrel.materials = [art.hullWorn]
            let node = SCNNode(geometry: barrel)
            node.eulerAngles.x = .pi / 2
            let out: Float = mount.x > 0 ? 0.28 : -0.28
            node.simdPosition = mount + simd_float3(out, 0.12, -0.05)
            spread.addChildNode(node)
        }
        root.addChildNode(spread)

        let rack = SCNNode()
        rack.name = "upgrade-missiles"
        rack.isHidden = true
        for side: Float in [-1, 1] {
            for index in 0..<3 {
                let tube = SCNCylinder(radius: 0.055, height: 1.15)
                tube.radialSegmentCount = 8
                tube.materials = [art.hullDark]
                let node = SCNNode(geometry: tube)
                node.eulerAngles.x = .pi / 2
                let x = side * (2.65 + Float(index) * 0.2)
                node.simdPosition = simd_float3(x, -0.32, -0.35)
                rack.addChildNode(node)
                let cap = SCNSphere(radius: 0.065)
                cap.segmentCount = 8
                cap.materials = [art.orangeGlow]
                let tip = SCNNode(geometry: cap)
                tip.simdPosition = simd_float3(x, -0.32, -0.95)
                rack.addChildNode(tip)
            }
        }
        root.addChildNode(rack)

        for side: Float in [-1, 1] {
            let dish = SCNCylinder(radius: 0.22, height: 0.05)
            dish.radialSegmentCount = 12
            dish.materials = [art.hullDark]
            let housing = SCNNode(geometry: dish)
            housing.eulerAngles.z = .pi / 2
            housing.simdPosition = simd_float3(side * 1.75, 0.3, -0.15)
            root.addChildNode(housing)
            let glow = SCNCylinder(radius: 0.14, height: 0.03)
            glow.radialSegmentCount = 12
            glow.materials = [art.cyanGlow]
            let emitter = SCNNode(geometry: glow)
            emitter.name = "upgrade-shields"
            emitter.isHidden = true
            emitter.eulerAngles.z = .pi / 2
            emitter.simdPosition = simd_float3(side * 1.75, 0.36, -0.15)
            root.addChildNode(emitter)
        }

        let cage = SCNTorus(ringRadius: 0.28, pipeRadius: 0.03)
        cage.ringSegmentCount = 16
        cage.pipeSegmentCount = 8
        cage.materials = [art.hullWorn]
        let cageNode = SCNNode(geometry: cage)
        cageNode.eulerAngles.x = .pi / 2
        cageNode.simdPosition = simd_float3(0, 0.68, 0.25)
        root.addChildNode(cageNode)
        let core = SCNSphere(radius: 0.14)
        core.segmentCount = 12
        core.materials = [art.orangeGlow]
        let coreNode = SCNNode(geometry: core)
        coreNode.name = "upgrade-reactor"
        coreNode.isHidden = true
        coreNode.simdPosition = simd_float3(0, 0.68, 0.25)
        root.addChildNode(coreNode)
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
            g.name = "running-light"
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
        root.castsShadow = false
        let sphere = SCNSphere(radius: 260)
        sphere.segmentCount = 64
        sphere.materials = [SkyMaps.surface(day: "saturn", normal: "saturn-normal", rough: 0.78)]
        let body = SCNNode(geometry: sphere)
        body.castsShadow = false
        root.addChildNode(body)
        let air = SCNSphere(radius: 268)
        air.segmentCount = 32
        air.materials = [SkyMaps.atmosphere(UIColor(red: 0.95, green: 0.78, blue: 0.48, alpha: 1))]
        let shell = SCNNode(geometry: air)
        shell.castsShadow = false
        shell.renderingOrder = 6
        root.addChildNode(shell)

        let disc = SCNCylinder(radius: 430, height: 0.8)
        disc.radialSegmentCount = 64
        disc.heightSegmentCount = 1
        let clear = SCNMaterial()
        clear.lightingModel = .constant
        clear.diffuse.contents = UIColor.clear
        clear.transparency = 0.01
        disc.materials = [clear, art.ring, art.ring]
        let ring = SCNNode(geometry: disc)
        ring.castsShadow = false
        ring.eulerAngles.z = Float(0.42)
        ring.eulerAngles.x = Float(0.35)
        root.addChildNode(ring)
        root.simdPosition = simd_float3(240, 150, -760)
        return root
    }

    static func sun(art: ArtSet) -> SCNNode {
        let root = SCNNode()
        root.name = "sun"
        root.simdPosition = SpaceLook.sunDirection * 2200
        root.castsShadow = false
        let sphere = SCNSphere(radius: 80)
        sphere.segmentCount = 24
        sphere.materials = [art.sunMat]
        let body = SCNNode(geometry: sphere)
        body.castsShadow = false
        root.addChildNode(body)
        let glow = SCNPlane(width: 520, height: 520)
        let flare = SCNMaterial()
        flare.lightingModel = .constant
        flare.diffuse.contents = UIColor(red: 1, green: 0.93, blue: 0.78, alpha: 1)
        flare.emission.contents = UIColor(red: 1, green: 0.9, blue: 0.7, alpha: 1)
        flare.transparency = 0.22
        flare.blendMode = .add
        flare.writesToDepthBuffer = false
        flare.isDoubleSided = true
        glow.materials = [flare]
        let disc = SCNNode(geometry: glow)
        disc.castsShadow = false
        disc.constraints = [SCNBillboardConstraint()]
        root.addChildNode(disc)
        return root
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

    /// Canopy and instrument panel in camera space. FlightWorld places the
    /// named pieces on the view frustum so they read on a phone and an iPad.
    static func cockpit(art: ArtSet) -> SCNNode {
        let root = SCNNode()
        root.name = "cockpit"
        let frame = art.strut
        let dashMat = art.hullDark
        func screen(_ color: UIColor) -> SCNMaterial {
            let material = SCNMaterial()
            material.lightingModel = .constant
            material.diffuse.contents = color
            material.emission.contents = color
            material.isDoubleSided = true
            return material
        }
        let rail = SCNBox(width: 0.05, height: 1, length: 0.035, chamferRadius: 0.008)
        rail.materials = [frame]
        let railL = SCNNode(geometry: rail)
        railL.name = "railL"
        let railR = SCNNode(geometry: rail.copy() as? SCNGeometry ?? rail)
        railR.name = "railR"
        let bowGeom = SCNBox(width: 1, height: 0.055, length: 0.04, chamferRadius: 0.01)
        bowGeom.materials = [frame]
        let bow = SCNNode(geometry: bowGeom)
        bow.name = "bow"
        let dashGeom = SCNBox(width: 1, height: 1, length: 0.06, chamferRadius: 0.02)
        dashGeom.materials = [dashMat]
        let dash = SCNNode(geometry: dashGeom)
        dash.name = "dash"
        for node in [railL, railR, bow, dash] {
            root.addChildNode(node)
        }

        func lamp(_ name: String, color: UIColor, wide: CGFloat) -> SCNNode {
            let bar = SCNBox(width: wide, height: 0.018, length: 0.008, chamferRadius: 0.002)
            bar.materials = [screen(color)]
            let node = SCNNode(geometry: bar)
            node.name = name
            node.pivot = SCNMatrix4MakeTranslation(Float(-wide / 2), 0, 0)
            return node
        }
        let shield = lamp("shieldFill", color: UIColor(red: 0.35, green: 0.85, blue: 1, alpha: 1), wide: 0.22)
        let hullBar = lamp("hullFill", color: UIColor(red: 0.45, green: 1, blue: 0.55, alpha: 1), wide: 0.22)
        let weapon = lamp("weaponFill", color: UIColor(red: 1, green: 0.62, blue: 0.22, alpha: 1), wide: 0.22)
        let targetBar = lamp("targetFill", color: UIColor(red: 1, green: 0.35, blue: 0.2, alpha: 1), wide: 0.16)
        for node in [shield, hullBar, weapon, targetBar] {
            root.addChildNode(node)
        }

        let speed = readout("0.00c", size: 0.07, color: UIColor(red: 0.75, green: 0.95, blue: 1, alpha: 1))
        speed.name = "speedText"
        let target = readout("NO LOCK", size: 0.04, color: UIColor(red: 1, green: 0.72, blue: 0.4, alpha: 1))
        target.name = "targetText"
        root.addChildNode(speed)
        root.addChildNode(target)
        for (name, title, size) in [("capSpeed", "SPD", 0.028), ("capShield", "SHLD", 0.026), ("capHull", "HULL", 0.026), ("capWeapon", "WPN", 0.026), ("capTarget", "TGT", 0.026), ("capRadar", "RDR", 0.026)] {
            let label = readout(title, size: CGFloat(size), color: UIColor(white: 0.78, alpha: 1))
            label.name = name
            root.addChildNode(label)
        }

        let disc = SCNPlane(width: 0.16, height: 0.16)
        let glass = screen(UIColor(red: 0.02, green: 0.08, blue: 0.1, alpha: 1))
        glass.transparency = 0.15
        disc.materials = [glass]
        let radar = SCNNode(geometry: disc)
        radar.name = "radar"
        let ringGeom = SCNTorus(ringRadius: 0.07, pipeRadius: 0.003)
        ringGeom.materials = [screen(UIColor(red: 0.4, green: 0.85, blue: 0.75, alpha: 1))]
        let ring = SCNNode(geometry: ringGeom)
        radar.addChildNode(ring)
        root.addChildNode(radar)
        for index in 0..<6 {
            let dot = SCNSphere(radius: 0.008)
            dot.segmentCount = 6
            dot.materials = [screen(UIColor(red: 1, green: 0.45, blue: 0.25, alpha: 1))]
            let blip = SCNNode(geometry: dot)
            blip.name = "blip\(index)"
            blip.isHidden = true
            radar.addChildNode(blip)
        }

        let gripGeom = SCNCylinder(radius: 0.012, height: 0.11)
        gripGeom.materials = [frame]
        let grip = SCNNode(geometry: gripGeom)
        grip.name = "grip"
        grip.eulerAngles.x = 0.5
        root.addChildNode(grip)
        return root
    }

    private static func readout(_ text: String, size: CGFloat, color: UIColor) -> SCNNode {
        let geo = SCNText(string: text, extrusionDepth: 0.0015)
        geo.font = UIFont.monospacedSystemFont(ofSize: size, weight: .medium)
        geo.flatness = 0.2
        let material = SCNMaterial()
        material.lightingModel = .constant
        material.diffuse.contents = color
        material.emission.contents = color
        material.isDoubleSided = true
        geo.materials = [material]
        return SCNNode(geometry: geo)
    }

    static func freighter(art: ArtSet) -> SCNNode {
        let root = SCNNode()
        root.name = "freighter"
        box(root, simd_float3(10, 6, 36), simd_float3(0, 0, 0), art.hull, chamfer: 0.3)
        box(root, simd_float3(16, 3.2, 14), simd_float3(0, -1.2, 6), art.hullDark, chamfer: 0.2)
        box(root, simd_float3(4, 3, 8), simd_float3(0, 3.2, -6), art.hullWorn, chamfer: 0.15)
        for z: Float in [-8, 0, 8] {
            let lamp = SCNSphere(radius: 0.35)
            lamp.segmentCount = 8
            lamp.materials = [art.gold]
            let node = SCNNode(geometry: lamp)
            node.simdPosition = simd_float3(0, 2.2, z)
            root.addChildNode(node)
        }
        let bay = SCNBox(width: 6, height: 0.2, length: 8, chamferRadius: 0)
        bay.materials = [art.cyanGlow]
        let pad = SCNNode(geometry: bay)
        pad.simdPosition = simd_float3(0, -2.8, 12)
        root.addChildNode(pad)
        return root
    }

    /// Textured planet. Night side is unlit. A thin fresnel shell is the air.
    static func world(_ name: String, radius: CGFloat, at point: simd_float3, air: UIColor) -> SCNNode {
        let root = SCNNode()
        root.name = name
        root.castsShadow = false
        let sphere = SCNSphere(radius: radius)
        sphere.segmentCount = 48
        let day = name == "earth" ? "earth-day" : name
        let normal = name == "earth" ? "earth-normal" : "\(name)-normal"
        sphere.materials = [SkyMaps.surface(day: day, normal: normal, rough: name == "jupiter" ? 0.55 : 0.92)]
        let body = SCNNode(geometry: sphere)
        body.castsShadow = false
        root.addChildNode(body)
        if name == "earth", let clouds = SkyMaps.clouds() {
            let deck = SCNSphere(radius: radius * 1.025)
            deck.segmentCount = 40
            deck.materials = [clouds]
            let veil = SCNNode(geometry: deck)
            veil.name = "cloudDeck"
            veil.castsShadow = false
            root.addChildNode(veil)
        }
        let shellGeom = SCNSphere(radius: radius * 1.06)
        shellGeom.segmentCount = 28
        shellGeom.materials = [SkyMaps.atmosphere(air)]
        let shell = SCNNode(geometry: shellGeom)
        shell.castsShadow = false
        shell.renderingOrder = 8
        root.addChildNode(shell)
        root.simdPosition = point
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
