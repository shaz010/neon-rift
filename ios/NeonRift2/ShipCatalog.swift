import Foundation
import ModelIO
import SceneKit
import SceneKit.ModelIO
import UIKit

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

/// Paint only. The mesh stays the in-engine fighter.
enum ShipLivery: String, CaseIterable {
    case factory, ion, ember, bone, venom, royal

    static let storeKey = "nr2.ship.livery"

    static var current: ShipLivery {
        get { ShipLivery(rawValue: UserDefaults.standard.string(forKey: storeKey) ?? "") ?? .factory }
        set { UserDefaults.standard.set(newValue.rawValue, forKey: storeKey) }
    }

    var title: String {
        switch self {
        case .factory: return "FACTORY"
        case .ion: return "ION"
        case .ember: return "EMBER"
        case .bone: return "BONE"
        case .venom: return "VENOM"
        case .royal: return "ROYAL"
        }
    }

    var swatch: UIColor {
        switch self {
        case .factory: return UIColor(white: 0.62, alpha: 1)
        case .ion: return UIColor(red: 0.25, green: 0.75, blue: 0.95, alpha: 1)
        case .ember: return UIColor(red: 0.95, green: 0.42, blue: 0.16, alpha: 1)
        case .bone: return UIColor(red: 0.9, green: 0.88, blue: 0.8, alpha: 1)
        case .venom: return UIColor(red: 0.35, green: 0.85, blue: 0.38, alpha: 1)
        case .royal: return UIColor(red: 0.58, green: 0.32, blue: 0.9, alpha: 1)
        }
    }

    func apply(to root: SCNNode, art: ArtSet) {
        let paint = pattern
        root.enumerateChildNodes { node, _ in
            guard let geom = node.geometry, let mat = geom.materials.first else { return }
            if node.name == nil {
                if mat === art.hull { node.name = "livery-hull" }
                else if mat === art.hullDark { node.name = "livery-dark" }
                else if mat === art.hullWorn { node.name = "livery-worn" }
            }
            guard let name = node.name else { return }
            let base: SCNMaterial
            switch name {
            case "livery-hull": base = art.hull
            case "livery-dark": base = art.hullDark
            case "livery-worn": base = art.hullWorn
            default: return
            }
            let copy = (base.copy() as? SCNMaterial) ?? SCNMaterial()
            if let paint {
                copy.multiply.contents = paint
                copy.multiply.wrapS = .repeat
                copy.multiply.wrapT = .repeat
            }
            geom.materials = [copy]
        }
    }

    private var pattern: UIImage? {
        switch self {
        case .factory:
            return nil
        case .ion:
            return ShipLivery.stripes(
                UIColor(red: 0.55, green: 0.82, blue: 1, alpha: 1),
                UIColor(red: 0.15, green: 0.45, blue: 0.7, alpha: 1),
                bands: 5
            )
        case .ember:
            return ShipLivery.stripes(
                UIColor(red: 1, green: 0.55, blue: 0.28, alpha: 1),
                UIColor(red: 0.45, green: 0.16, blue: 0.08, alpha: 1),
                bands: 9
            )
        case .bone:
            return ShipLivery.stripes(
                UIColor(red: 0.92, green: 0.9, blue: 0.82, alpha: 1),
                UIColor(red: 0.55, green: 0.52, blue: 0.46, alpha: 1),
                bands: 3
            )
        case .venom:
            return ShipLivery.stripes(
                UIColor(red: 0.35, green: 0.95, blue: 0.4, alpha: 1),
                UIColor(red: 0.05, green: 0.16, blue: 0.08, alpha: 1),
                bands: 7
            )
        case .royal:
            return ShipLivery.stripes(
                UIColor(red: 0.62, green: 0.4, blue: 1, alpha: 1),
                UIColor(red: 0.95, green: 0.78, blue: 0.35, alpha: 1),
                bands: 4
            )
        }
    }

    private static func stripes(_ a: UIColor, _ b: UIColor, bands: Int) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        return UIGraphicsImageRenderer(size: CGSize(width: 128, height: 128), format: format).image { ctx in
            let step = 128 / CGFloat(max(bands, 1))
            for index in 0..<bands {
                (index % 2 == 0 ? a : b).setFill()
                ctx.fill(CGRect(x: 0, y: CGFloat(index) * step, width: 128, height: step + 1))
            }
        }
    }
}

/// Sorties, medals, and the best line, kept for the hangar board.
enum PilotLog {
    private static let flightsKey = "nr2.flights"
    private static let bogeysKey = "nr2.bogeys"
    private static let deliveredKey = "nr2.delivered"
    private static let streakKey = "nr2.bestStreak"
    private static let bountyKey = "nr2.bestBounty"
    private static let medalsKey = "nr2.medals"

    static func commit(kills: Int, deliveries: Int, bounty: Int, streak: Int) -> [String] {
        let store = UserDefaults.standard
        store.set(store.integer(forKey: flightsKey) + 1, forKey: flightsKey)
        store.set(store.integer(forKey: bogeysKey) + kills, forKey: bogeysKey)
        store.set(store.integer(forKey: deliveredKey) + deliveries, forKey: deliveredKey)
        store.set(max(store.integer(forKey: streakKey), streak), forKey: streakKey)
        store.set(max(store.integer(forKey: bountyKey), bounty), forKey: bountyKey)
        let owned = Set(store.stringArray(forKey: medalsKey) ?? [])
        var next = owned
        if kills >= 1 { next.insert("FIRST BLOOD") }
        if streak >= 3 { next.insert("ON A TEAR") }
        if deliveries >= 1 { next.insert("HAULER") }
        if deliveries >= 3 { next.insert("FULL HOLD") }
        if bounty >= 800 { next.insert("HUNTER") }
        if bounty >= 2400 { next.insert("ACE") }
        store.set(Array(next).sorted(), forKey: medalsKey)
        return Array(next.subtracting(owned)).sorted()
    }

    static func hangarText() -> String {
        let store = UserDefaults.standard
        let flights = store.integer(forKey: flightsKey)
        guard flights > 0 else { return "NO SORTIES YET" }
        let medals = store.stringArray(forKey: medalsKey) ?? []
        let medalLine = medals.isEmpty ? "NO MEDALS YET" : medals.joined(separator: "  ·  ")
        let bounty = store.integer(forKey: bountyKey)
        let rank = bounty >= 2400 ? "ACE" : (bounty >= 800 ? "HUNTER" : "ROOKIE")
        return """
        FLIGHTS \(flights)    BEST \(bounty)    RANK \(rank)
        BOGEYS \(store.integer(forKey: bogeysKey))    DELIVERED \(store.integer(forKey: deliveredKey))    STREAK \(store.integer(forKey: streakKey))
        \(medalLine)
        """
    }

    static func medalLine() -> String {
        let medals = UserDefaults.standard.stringArray(forKey: medalsKey) ?? []
        return medals.isEmpty ? "" : medals.joined(separator: "  ·  ")
    }
}

/// The rift remembers the last crossing. A clean scar makes the next line faster.
/// A sloppy one makes the warden meaner.
enum RiftScar: String {
    case none
    case clean
    case sloppy

    private static let key = "nr2.rift.scar"

    static var current: RiftScar {
        get { RiftScar(rawValue: UserDefaults.standard.string(forKey: key) ?? "") ?? .none }
        set { UserDefaults.standard.set(newValue.rawValue, forKey: key) }
    }

    static func commit(clean: Bool) {
        current = clean ? .clean : .sloppy
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
