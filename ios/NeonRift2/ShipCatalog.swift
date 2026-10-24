import Foundation
import ModelIO
import SceneKit
import SceneKit.ModelIO

/// Fitted parts persist across flights. Names match the upgrade-* nodes on the
/// procedural fighter and on a future purchased model.
enum ShipUpgrades {
    static let storeKey = "nr2.ship.upgrades"

    static func fitted() -> Set<String> {
        Set(UserDefaults.standard.stringArray(forKey: storeKey) ?? [])
    }

    static func isFitted(_ id: String) -> Bool {
        fitted().contains(id)
    }

    static func unlock(_ id: String) {
        var next = fitted()
        guard next.insert(id).inserted else { return }
        UserDefaults.standard.set(Array(next).sorted(), forKey: storeKey)
    }

    /// Unhides every child named upgrade-<id> when that id has been collected.
    static func apply(to root: SCNNode) {
        let owned = fitted()
        root.enumerateChildNodes { node, _ in
            guard let name = node.name, name.hasPrefix("upgrade-") else { return }
            let id = String(name.dropFirst("upgrade-".count))
            node.isHidden = !owned.contains(id)
        }
    }
}

struct ShipHotspot: Decodable {
    var id: String
    var title: String
    var summary: String
    var position: [Float]
    var stats: [[String]]
    var upgrade: String?

    var point: simd_float3 {
        guard position.count == 3 else { return .zero }
        return simd_float3(position[0], position[1], position[2])
    }

    var rows: [(String, String)] {
        stats.compactMap { pair in
            guard pair.count >= 2 else { return nil }
            return (pair[0], pair[1])
        }
    }
}

struct ShipCatalog: Decodable {
    var name: String
    var scale: Float
    var focus: [Float]
    var cameraDistance: Float
    var hotspots: [ShipHotspot]

    var focusPoint: simd_float3 {
        guard focus.count == 3 else { return simd_float3(0, 0.45, 0) }
        return simd_float3(focus[0], focus[1], focus[2])
    }

    static func load() -> ShipCatalog {
        if let url = ShipAssets.url(name: "fighter-hotspots", ext: "json"),
           let data = try? Data(contentsOf: url),
           let catalog = try? JSONDecoder().decode(ShipCatalog.self, from: data),
           !catalog.hotspots.isEmpty {
            return catalog
        }
        return ShipCatalog.builtIn
    }

    /// Local-space markers for the procedural fighter. A purchased model
    /// replaces this by shipping fighter-hotspots.json beside fighter.usdz.
    static let builtIn = ShipCatalog(
        name: "Lane Fighter",
        scale: 1,
        focus: [0, 0.45, 0],
        cameraDistance: 15,
        hotspots: [
            ShipHotspot(
                id: "engines",
                title: "TWIN NACELLES",
                summary: "Twin plasma nacelles. Flight assist holds your speed and damps the drift when you let go of the stick.",
                position: [0, 0.72, 3.35],
                stats: [
                    ["Mass", "8,500 kg"],
                    ["Thrust", "357 kN"],
                    ["Cruise", "118 m/s"],
                    ["Boost", "158 m/s, 1.55 s"],
                ],
                upgrade: nil
            ),
            ShipHotspot(
                id: "cannons",
                title: "CANNONS",
                summary: "Paired cheek cannons along the nose. A spread pickup adds a second barrel on each side.",
                position: [2.15, 0.28, -2.9],
                stats: [
                    ["Mounts", "Port and starboard"],
                    ["Bite", "18–30 hull"],
                    ["Spread", "Locked until fitted"],
                    ["Assist", "Soft aim inside the bracket"],
                ],
                upgrade: "spread"
            ),
            ShipHotspot(
                id: "missiles",
                title: "MISSILE RACKS",
                summary: "Underwing racks. They stay dark until a missile pickup arms them, then the tubes and seeker tips show on the hull.",
                position: [2.9, 0.42, -0.35],
                stats: [
                    ["Tubes", "3 per wing"],
                    ["Seeker", "Homing"],
                    ["Bite", "40–48 hull"],
                    ["Cycle", "1.35 s"],
                ],
                upgrade: "missiles"
            ),
            ShipHotspot(
                id: "shields",
                title: "SHIELD EMITTERS",
                summary: "Wing-root dishes project the forward barrier. A shield pickup restores the barrier and lights the dishes.",
                position: [1.75, 0.72, -0.15],
                stats: [
                    ["Barrier", "100"],
                    ["Recharge", "18 / s out of the fire"],
                    ["Emitters", "Two, wing root"],
                    ["Pickup", "Full restore"],
                ],
                upgrade: "shields"
            ),
            ShipHotspot(
                id: "reactor",
                title: "REACTOR",
                summary: "Dorsal core for the guns, the barrier, and the tractor. A hull-repair pickup seats the core and patches 40 hull.",
                position: [0, 1.05, 0.25],
                stats: [
                    ["Hull", "100"],
                    ["Repair", "+40"],
                    ["Mount", "Dorsal spine"],
                    ["Feed", "Guns, barrier, beam"],
                ],
                upgrade: "reactor"
            ),
            ShipHotspot(
                id: "cockpit",
                title: "COCKPIT",
                summary: "Single-seat canopy. In the lane, COCKPIT puts you behind the glass with the stick and the instrument glow.",
                position: [0, 1.15, -2.15],
                stats: [
                    ["Crew", "1"],
                    ["View", "Chase or canopy"],
                    ["Controls", "Drag left, fire right"],
                    ["Glass", "Framed canopy"],
                ],
                upgrade: nil
            ),
        ]
    )
}

/// SceneKit loads USDZ and OBJ. It does not load glTF. Convert a purchased
/// glTF with Reality Converter or `xcrun usdz_converter`, then add fighter.usdz
/// to this target. Drop fighter.obj the same way. Optional fighter-hotspots.json
/// sets scale, camera distance, and spec-card positions in model space.
/// Name fitted parts upgrade-spread, upgrade-missiles, upgrade-shields, and
/// upgrade-reactor so they appear when the pilot has collected them.
enum ShipAssets {
    static func url(name: String, ext: String) -> URL? {
        Bundle.main.url(forResource: name, withExtension: ext, subdirectory: "Ship")
            ?? Bundle.main.url(forResource: name, withExtension: ext)
    }
}

enum ShipModelLoader {
    static func load(art: ArtSet) -> SCNNode {
        if let bought = loadUSDZ() ?? loadOBJ() {
            bought.name = "fighter"
            return bought
        }
        return Meshes.fighter(art: art)
    }

    private static func loadUSDZ() -> SCNNode? {
        guard let url = ShipAssets.url(name: "fighter", ext: "usdz") else { return nil }
        guard let scene = try? SCNScene(url: url, options: [
            SCNSceneSource.LoadingOption.checkConsistency: true,
            SCNSceneSource.LoadingOption.convertToYUp: true,
        ]) else {
            NSLog("Neon Rift 2 could not read fighter.usdz")
            return nil
        }
        return wrap(scene)
    }

    private static func loadOBJ() -> SCNNode? {
        guard let url = ShipAssets.url(name: "fighter", ext: "obj") else { return nil }
        let asset = MDLAsset(url: url)
        asset.loadTextures()
        return wrap(SCNScene(mdlAsset: asset))
    }

    private static func wrap(_ scene: SCNScene) -> SCNNode? {
        let children = scene.rootNode.childNodes
        guard !children.isEmpty else { return nil }
        let root = SCNNode()
        for child in children {
            root.addChildNode(child)
        }
        return root
    }
}
