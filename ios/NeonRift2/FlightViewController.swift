import Darwin
import SceneKit
import UIKit

final class FlightViewController: UIViewController {
    private let scnView = SCNView()
    private let audio = FlightAudio()
    private let haptics = FlightHaptics()
    private let showcase: Bool
    private var profile: RenderProfile
    private var world: FlightWorld!
    private let touch = TouchPad()
    private let overlay = HudOverlay()
    private let flashView = UIView()
    private let grainView = UIView()
    private let topBar = UIView()
    private let bottomBar = UIView()
    private let titleLabel = UILabel()
    private let clockLabel = UILabel()
    private let navLabel = UILabel()
    private let speedLabel = UILabel()
    private let weaponLabel = UILabel()
    private let compassLabel = UILabel()
    private let shieldLabel = UILabel()
    private let promptLabel = UILabel()
    private let resultsLabel = UILabel()
    private let skipButton = UIButton(type: .system)
    private let replayButton = UIButton(type: .custom)
    private let calloutLabel = UILabel()
    private let creditsLabel = UILabel()
    private let viewButton = UIButton(type: .system)
    private let cycleButton = UIButton(type: .system)
    private let beamButton = UIButton(type: .system)
    private let hangarButton = UIButton(type: .system)
    private let faceButton = UIButton(type: .system)
    private let loopButton = UIButton(type: .system)
    private let rollButton = UIButton(type: .system)
    private var creditScroll: CGFloat = 0
    private var grainIndex = 0
    private var letterboxAmount: CGFloat = 1
    private var appliedScale: CGFloat = 0
    private var lastOrientationLog = ""
    private var requestedOrientation = false

    init() {
        let args = ProcessInfo.processInfo.arguments
        let env = ProcessInfo.processInfo.environment
        showcase = args.contains("-showcase") || env["NR2_SHOWCASE"] == "1"
        profile = RenderProfile.detect(showcase: showcase)
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { return nil }

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        isPad ? .all : .portrait
    }
    override var preferredInterfaceOrientationForPresentation: UIInterfaceOrientation { .portrait }

    private var isPad: Bool { UIDevice.current.userInterfaceIdiom == .pad }

    /// Short side drives the scale, so rotating an iPad does not resize the HUD.
    private var hudScale: CGFloat {
        let shortSide = min(view.bounds.width, view.bounds.height)
        guard shortSide > 1 else { return isPad ? 1.4 : 1 }
        if isPad {
            return min(1.65, max(1.25, shortSide / 520))
        }
        return min(1.15, max(0.9, shortSide / 390))
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        scnView.frame = view.bounds
        scnView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        scnView.backgroundColor = .black
        scnView.antialiasingMode = profile.msaa
        scnView.preferredFramesPerSecond = 60
        scnView.rendersContinuously = true
        scnView.isUserInteractionEnabled = false
        scnView.autoenablesDefaultLighting = false
        view.addSubview(scnView)

        flashView.backgroundColor = .white
        flashView.alpha = 0
        flashView.isUserInteractionEnabled = false
        view.addSubview(flashView)

        grainView.isUserInteractionEnabled = false
        grainView.alpha = 0.16
        grainView.layer.compositingFilter = "softLightBlendMode"
        grainView.backgroundColor = UIColor(patternImage: ArtSet.shared.grains[0])
        grainView.isHidden = !profile.grain
        view.addSubview(grainView)

        for bar in [topBar, bottomBar] {
            bar.backgroundColor = .black
            bar.isUserInteractionEnabled = false
            view.addSubview(bar)
        }

        style(clockLabel, align: .left)
        style(navLabel, align: .left)
        style(speedLabel, align: .right)
        style(weaponLabel, align: .right)
        style(compassLabel, align: .center)
        style(shieldLabel, align: .center)
        promptLabel.font = UIFont.monospacedSystemFont(ofSize: 13, weight: .light)
        promptLabel.textColor = UIColor(white: 0.92, alpha: 1)
        promptLabel.textAlignment = .center
        promptLabel.numberOfLines = 2
        promptLabel.text = "SWIPE UP TO LOOP  ·  SWIPE SIDEWAYS TO ROLL\nDOUBLE-TAP TO BOOST"
        promptLabel.isUserInteractionEnabled = false
        view.addSubview(promptLabel)

        titleLabel.attributedText = tracked("NEON RIFT 2", size: 26, kern: 9)
        titleLabel.textAlignment = .center
        titleLabel.isUserInteractionEnabled = false
        view.addSubview(titleLabel)

        resultsLabel.font = UIFont.monospacedSystemFont(ofSize: 15, weight: .light)
        resultsLabel.textColor = UIColor(white: 0.9, alpha: 1)
        resultsLabel.textAlignment = .center
        resultsLabel.numberOfLines = 0
        resultsLabel.isUserInteractionEnabled = false
        resultsLabel.alpha = 0
        view.addSubview(resultsLabel)

        overlay.isUserInteractionEnabled = false
        overlay.backgroundColor = .clear
        overlay.contentMode = .redraw
        view.addSubview(overlay)

        touch.onChange = { [weak self] in
            guard let self else { return }
            self.world?.inputStick = self.touch.stick
            self.world?.inputFire = self.touch.firing
            if self.touch.consumeBoost() { self.world?.requestBoost() }
            switch self.touch.consumeTrick() {
            case 1: self.world?.requestLoop()
            case 2: self.world?.requestRoll(direction: 1)
            case 3: self.world?.requestRoll(direction: -1)
            default: break
            }
        }
        view.addSubview(touch)

        calloutLabel.font = UIFont.monospacedSystemFont(ofSize: 18, weight: .medium)
        calloutLabel.textColor = UIColor(red: 1, green: 0.86, blue: 0.55, alpha: 1)
        calloutLabel.textAlignment = .center
        calloutLabel.alpha = 0
        view.addSubview(calloutLabel)

        creditsLabel.font = UIFont.monospacedSystemFont(ofSize: 15, weight: .light)
        creditsLabel.textColor = UIColor(white: 0.9, alpha: 1)
        creditsLabel.textAlignment = .center
        creditsLabel.numberOfLines = 0
        creditsLabel.alpha = 0
        view.addSubview(creditsLabel)

        configure(viewButton, title: "COCKPIT", action: #selector(toggleView))
        configure(cycleButton, title: "CYCLE", action: #selector(cycleTarget))
        configure(beamButton, title: "BEAM", action: #selector(toggleBeam))
        configure(faceButton, title: "FACE", action: #selector(faceTarget))
        configure(loopButton, title: "LOOP", action: #selector(doLoop))
        configure(rollButton, title: "ROLL", action: #selector(doRoll))
        beamButton.isHidden = true

        skipButton.setTitle("SKIP", for: .normal)
        skipButton.titleLabel?.font = UIFont.systemFont(ofSize: 13, weight: .light)
        skipButton.setTitleColor(UIColor(white: 0.88, alpha: 1), for: .normal)
        skipButton.layer.borderWidth = 1
        skipButton.layer.borderColor = UIColor(white: 0.75, alpha: 0.9).cgColor
        skipButton.addTarget(self, action: #selector(skipCinema), for: .touchUpInside)
        view.addSubview(skipButton)

        replayButton.addTarget(self, action: #selector(flyAgain), for: .touchUpInside)
        replayButton.isHidden = true
        view.addSubview(replayButton)

        configure(hangarButton, title: "HANGAR", action: #selector(returnToHangar))
        hangarButton.isHidden = true

        for label in [clockLabel, navLabel, speedLabel, weaponLabel, compassLabel, shieldLabel] {
            view.addSubview(label)
        }

        NotificationCenter.default.addObserver(self, selector: #selector(pauseScene), name: UIApplication.didEnterBackgroundNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(resumeScene), name: UIApplication.didBecomeActiveNotification, object: nil)

        startWorld()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        requestShowcaseOrientation()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let b = view.bounds
        scnView.frame = b
        flashView.frame = b
        grainView.frame = b
        overlay.frame = b
        touch.frame = b
        replayButton.frame = b
        let safe = view.safeAreaInsets
        let scale = hudScale
        applyScaleIfNeeded(scale)
        let centers = controlCenters(scale: scale)
        touch.leftCenter = centers.0
        touch.rightCenter = centers.1
        touch.radius = centers.2
        overlay.leftCenter = centers.0
        overlay.rightCenter = centers.1
        overlay.radius = centers.2
        overlay.scale = scale
        skipButton.frame = CGRect(
            x: b.width - safe.right - 92 * scale,
            y: safe.top + 8 * scale,
            width: 76 * scale,
            height: 36 * scale
        )
        layoutChrome(letterbox: letterboxAmount)
        publishViewport()
        logOrientation(b)
    }

    private func startWorld() {
        let next = FlightWorld(audio: audio, haptics: haptics, showcase: showcase, profile: profile)
        world = next
        scnView.scene = next.scene
        scnView.pointOfView = next.cameraNode
        scnView.delegate = next
        next.onFrame = { [weak self] snapshot in
            self?.apply(snapshot)
        }
        next.boot()
        publishViewport()
    }

    private func apply(_ snapshot: HudSnapshot) {
        let m = snapshot.model
        clockLabel.text = m.clock
        navLabel.text = m.nav
        speedLabel.text = m.speed
        weaponLabel.text = "WPN \(m.weapon)%"
        compassLabel.text = "\(cardinal(m.heading))  \(String(format: "%03d", Int(m.heading.rounded()) % 360))"
        shieldLabel.text = "SHLD \(m.shield)    HULL \(m.hull)"
        let combat = m.phase == .combat && !m.showResults
        clockLabel.alpha = combat ? 1 : 0
        navLabel.alpha = combat ? 1 : 0
        speedLabel.alpha = combat ? 1 : 0
        weaponLabel.alpha = combat ? 1 : 0
        compassLabel.alpha = combat ? 1 : 0
        shieldLabel.alpha = combat ? 1 : 0
        promptLabel.text = m.phase == .combat ? m.objective : "SWIPE UP TO LOOP  ·  SWIPE SIDEWAYS TO ROLL\nDOUBLE-TAP TO BOOST"
        promptLabel.alpha = m.phase == .combat ? 1 : (m.phase == .cinema && m.titleAlpha < 0.25 ? 1 : 0)
        calloutLabel.text = m.callout
        calloutLabel.alpha = CGFloat(m.calloutAlpha)
        titleLabel.alpha = CGFloat(m.titleAlpha)
        flashView.alpha = CGFloat(m.flash) * 0.45
        skipButton.isHidden = m.phase != .cinema
        touch.isUserInteractionEnabled = combat
        replayButton.isHidden = !m.showResults
        hangarButton.isHidden = !m.showResults
        if m.showResults { view.bringSubviewToFront(hangarButton) }
        resultsLabel.alpha = m.showResults ? 1 : 0
        beamButton.isHidden = m.phase != .combat || !m.beamReady
        beamButton.setTitle(m.towing ? "RELEASE" : "BEAM", for: .normal)
        viewButton.setTitle(m.cockpit ? "CHASE" : "COCKPIT", for: .normal)
        viewButton.isHidden = m.phase != .combat
        cycleButton.isHidden = m.phase != .combat
        faceButton.isHidden = m.phase != .combat
        loopButton.isHidden = m.phase != .combat
        rollButton.isHidden = m.phase != .combat
        if m.showResults {
            resultsLabel.text = "NEON RIFT 2\n\n" + m.resultsBody
            creditsLabel.text = m.credits
        }
        creditsLabel.alpha = m.showResults ? 1 : 0
        creditScroll = CGFloat(m.creditScroll)
        topBar.isHidden = m.letterbox < 0.02
        bottomBar.isHidden = m.letterbox < 0.02
        letterboxAmount = CGFloat(m.letterbox)
        layoutChrome(letterbox: letterboxAmount)

        overlay.combat = combat
        overlay.stick = m.stick
        overlay.firing = m.firing
        overlay.dragOrigin = touch.dragOrigin
        overlay.lockPoint = project(m.lockWorld)
        overlay.lockTitle = m.lockTitle
        overlay.lockHealth = CGFloat(m.lockHealth)
        overlay.lockMissile = m.lockMissile
        overlay.gems = m.gems.compactMap { gem in
            guard let point = project(gem.0) else { return nil }
            return (point, gem.1)
        }
        overlay.marks = m.contacts.map { contact in
            HudMark(point: project(contact.world), kind: contact.kind, distance: contact.distance, bearing: contact.bearing)
        }
        overlay.blips = m.blips.map { HudBlipView(x: CGFloat($0.x), y: CGFloat($0.y), kind: $0.kind) }
        overlay.pickupPoints = m.pickups.compactMap { project($0) }
        overlay.sunPoint = project(m.sunWorld)
        overlay.popups = m.popups.compactMap { item in
            guard let p = project(item.0) else { return nil }
            return HudPopup(point: p, text: item.1, age: item.2)
        }
        overlay.setNeedsDisplay()

        if snapshot.grain {
            grainView.isHidden = false
            let slot = Int(m.phase == .results ? 0 : CACurrentMediaTime() * 10) % 3
            if slot != grainIndex {
                grainIndex = slot
                grainView.backgroundColor = UIColor(patternImage: ArtSet.shared.grains[slot])
            }
        } else {
            grainView.isHidden = true
        }
        if snapshot.reduced {
            scnView.antialiasingMode = .none
        }
    }

    private func layoutChrome(letterbox: CGFloat) {
        let b = view.bounds
        let safe = view.safeAreaInsets
        let scale = hudScale
        let bar = b.height * 0.105 * max(0, min(1, letterbox))
        topBar.frame = CGRect(x: 0, y: 0, width: b.width, height: bar)
        bottomBar.frame = CGRect(x: 0, y: b.height - bar, width: b.width, height: bar)
        titleLabel.frame = CGRect(x: 16 * scale, y: b.height - bar, width: b.width - 32 * scale, height: max(bar, 36 * scale))
        let rowH = 18 * scale
        let colW = 160 * scale
        clockLabel.frame = CGRect(x: safe.left + 18 * scale, y: safe.top + 16 * scale, width: colW, height: rowH)
        navLabel.frame = CGRect(x: safe.left + 18 * scale, y: safe.top + 36 * scale, width: colW, height: rowH)
        speedLabel.frame = CGRect(x: b.width - safe.right - colW - 18 * scale, y: safe.top + 16 * scale, width: colW, height: rowH)
        weaponLabel.frame = CGRect(x: b.width - safe.right - colW - 18 * scale, y: safe.top + 36 * scale, width: colW, height: rowH)
        compassLabel.frame = CGRect(x: b.midX - colW / 2, y: safe.top + 18 * scale, width: colW, height: 22 * scale)
        let stickY = controlCenters(scale: scale).0.y
        shieldLabel.frame = CGRect(x: 20 * scale, y: stickY - 78 * scale, width: b.width - 40 * scale, height: rowH)
        promptLabel.frame = CGRect(x: 24 * scale, y: safe.top + 58 * scale, width: b.width - 48 * scale, height: 48 * scale)
        calloutLabel.frame = CGRect(x: 20 * scale, y: b.midY - 70 * scale, width: b.width - 40 * scale, height: 28 * scale)
        let buttonW = 92 * scale
        let buttonH = 32 * scale
        viewButton.frame = CGRect(x: safe.left + 16 * scale, y: safe.top + 8 * scale, width: buttonW, height: buttonH)
        faceButton.frame = CGRect(x: safe.left + 16 * scale, y: safe.top + 46 * scale, width: buttonW, height: buttonH)
        loopButton.frame = CGRect(x: safe.left + 16 * scale, y: safe.top + 84 * scale, width: buttonW * 0.72, height: buttonH)
        rollButton.frame = CGRect(x: safe.left + 16 * scale + buttonW * 0.78, y: safe.top + 84 * scale, width: buttonW * 0.72, height: buttonH)
        cycleButton.frame = CGRect(x: b.width - safe.right - buttonW - 16 * scale, y: safe.top + 48 * scale, width: buttonW, height: buttonH)
        beamButton.frame = CGRect(x: b.width - safe.right - buttonW - 16 * scale, y: b.height - safe.bottom - 210 * scale, width: buttonW, height: buttonH)
        creditsLabel.frame = CGRect(x: 28 * scale, y: b.height * 0.72 - creditScroll * 34 * scale, width: b.width - 56 * scale, height: 520 * scale)
        hangarButton.frame = CGRect(
            x: b.midX - 78 * scale,
            y: b.height - safe.bottom - 58 * scale,
            width: 156 * scale,
            height: 40 * scale
        )
        let resultsDy = b.width > b.height ? b.height * 0.16 : b.height * 0.28
        resultsLabel.frame = b.insetBy(dx: 36 * scale, dy: resultsDy)
    }

    /// Thumb pads stay in the lower corners. Radius and insets grow with the iPad.
    private func controlCenters(scale: CGFloat) -> (CGPoint, CGPoint, CGFloat) {
        let b = view.bounds
        let safe = view.safeAreaInsets
        let radius = 74 * scale
        let insetX = 92 * scale
        let insetY = 112 * scale
        let y = b.height - safe.bottom - insetY
        let left = CGPoint(x: safe.left + insetX, y: y)
        let right = CGPoint(x: b.width - safe.right - insetX, y: y)
        return (left, right, radius)
    }

    private func applyScaleIfNeeded(_ scale: CGFloat) {
        guard abs(scale - appliedScale) > 0.01 else { return }
        appliedScale = scale
        let font = UIFont.monospacedSystemFont(ofSize: 12 * scale, weight: .light)
        for label in [clockLabel, navLabel, speedLabel, weaponLabel, compassLabel, shieldLabel] {
            label.font = font
        }
        promptLabel.font = UIFont.monospacedSystemFont(ofSize: 13 * scale, weight: .light)
        resultsLabel.font = UIFont.monospacedSystemFont(ofSize: 15 * scale, weight: .light)
        titleLabel.attributedText = tracked("NEON RIFT 2", size: 26 * scale, kern: 9 * scale)
        skipButton.titleLabel?.font = UIFont.systemFont(ofSize: 13 * scale, weight: .light)
        hangarButton.titleLabel?.font = UIFont.systemFont(ofSize: 14 * scale, weight: .medium)
    }

    private func publishViewport() {
        let b = view.bounds
        guard b.height > 1 else { return }
        world?.viewportAspect = Float(b.width / b.height)
    }

    private func logOrientation(_ bounds: CGRect) {
        guard bounds.width > 1, bounds.height > 1 else { return }
        let orient = bounds.width > bounds.height ? "landscape" : "portrait"
        let line = "NR2 orientation \(orient) \(Int(bounds.width.rounded()))x\(Int(bounds.height.rounded()))"
        guard line != lastOrientationLog else { return }
        lastOrientationLog = line
        NSLog("%@", line)
        print(line)
        fflush(stdout)
    }

    /// Simulator smoke launches pass -portrait or -landscape. iPhone stays portrait.
    private func requestShowcaseOrientation() {
        guard !requestedOrientation else { return }
        requestedOrientation = true
        guard isPad, let scene = view.window?.windowScene else { return }
        let args = ProcessInfo.processInfo.arguments
        let mask: UIInterfaceOrientationMask
        if args.contains("-landscape") {
            mask = .landscapeRight
        } else if args.contains("-portrait") {
            mask = .portrait
        } else {
            return
        }
        guard #available(iOS 16.0, *) else { return }
        setNeedsUpdateOfSupportedInterfaceOrientations()
        DispatchQueue.main.async { [weak scene] in
            scene?.requestGeometryUpdate(.iOS(interfaceOrientations: mask)) { error in
                let message = error.localizedDescription
                NSLog("NR2 geometry %@", message)
                print("NR2 geometry \(message)")
                fflush(stdout)
            }
        }
    }

    private func project(_ worldPoint: simd_float3?) -> CGPoint? {
        guard let worldPoint else { return nil }
        let p = scnView.projectPoint(SCNVector3(worldPoint.x, worldPoint.y, worldPoint.z))
        guard p.z >= 0, p.z < 1 else { return nil }
        return CGPoint(x: CGFloat(p.x), y: CGFloat(p.y))
    }

    private func style(_ label: UILabel, align: NSTextAlignment) {
        label.font = UIFont.monospacedSystemFont(ofSize: 12, weight: .light)
        label.textColor = UIColor(white: 0.82, alpha: 0.92)
        label.textAlignment = align
        label.isUserInteractionEnabled = false
    }

    private func tracked(_ text: String, size: CGFloat, kern: CGFloat) -> NSAttributedString {
        NSAttributedString(string: text, attributes: [
            .font: UIFont.systemFont(ofSize: size, weight: .ultraLight),
            .foregroundColor: UIColor(red: 0.86, green: 0.88, blue: 0.90, alpha: 1),
            .kern: kern,
        ])
    }

    private func configure(_ button: UIButton, title: String, action: Selector) {
        button.setTitle(title, for: .normal)
        button.titleLabel?.font = UIFont.systemFont(ofSize: 12, weight: .medium)
        button.setTitleColor(UIColor(white: 0.92, alpha: 1), for: .normal)
        button.layer.borderWidth = 1
        button.layer.borderColor = UIColor(white: 0.75, alpha: 0.85).cgColor
        button.backgroundColor = UIColor(white: 0, alpha: 0.35)
        button.addTarget(self, action: action, for: .touchUpInside)
        view.addSubview(button)
    }

    @objc private func toggleView() { world?.toggleView() }
    @objc private func cycleTarget() { world?.cycleTarget() }
    @objc private func toggleBeam() { world?.toggleTractor() }
    @objc private func faceTarget() { world?.requestFace() }
    @objc private func doLoop() { world?.requestLoop() }
    @objc private func doRoll() { world?.requestRoll(direction: 1) }

    @objc private func skipCinema() { world?.skipCinema() }

    @objc private func flyAgain() {
        world?.onFrame = nil
        scnView.scene = nil
        scnView.delegate = nil
        startWorld()
    }

    @objc private func returnToHangar() {
        world?.onFrame = nil
        scnView.scene = nil
        scnView.delegate = nil
        world = nil
        view.window?.rootViewController = ShipShowroomViewController(mode: .menu)
    }

    @objc private func pauseScene() {
        scnView.scene?.isPaused = true
    }

    @objc private func resumeScene() {
        AudioSession.engage()
        scnView.scene?.isPaused = false
    }
}

private func cardinal(_ degrees: Float) -> String {
    let names = ["N", "E", "S", "W"]
    var d = degrees.truncatingRemainder(dividingBy: 360)
    if d < 0 { d += 360 }
    let index = Int((d + 45) / 90) % 4
    return names[index]
}

struct HudPopup {
    var point: CGPoint
    var text: String
    var age: Float
}

struct HudMark {
    var point: CGPoint?
    var kind: Int
    var distance: Float
    var bearing: Float
}

struct HudBlipView {
    var x: CGFloat
    var y: CGFloat
    var kind: Int
}

final class HudOverlay: UIView {
    var combat = false
    var stick = CGPoint.zero
    var firing = false
    var lockPoint: CGPoint?
    var lockTitle = ""
    var lockHealth: CGFloat = 0
    var lockMissile = false
    var gems: [(CGPoint, String)] = []
    var pickupPoints: [CGPoint] = []
    var sunPoint: CGPoint?
    var popups: [HudPopup] = []
    var marks: [HudMark] = []
    var blips: [HudBlipView] = []
    var dragOrigin: CGPoint?
    var leftCenter = CGPoint.zero
    var rightCenter = CGPoint.zero
    var radius: CGFloat = 74
    var scale: CGFloat = 1

    override func draw(_ rect: CGRect) {
        guard let ctx = UIGraphicsGetCurrentContext() else { return }
        let s = max(scale, 0.5)
        if let sun = sunPoint, rect.insetBy(dx: -40 * s, dy: -40 * s).contains(sun) {
            ctx.setFillColor(UIColor(red: 1, green: 0.86, blue: 0.55, alpha: 0.22).cgColor)
            ctx.fill(CGRect(x: 0, y: sun.y - 2 * s, width: rect.width, height: 4 * s))
            ctx.setFillColor(UIColor(white: 1, alpha: 0.85).cgColor)
            let sunR = 5 * s
            ctx.fillEllipse(in: CGRect(x: sun.x - sunR, y: sun.y - sunR, width: sunR * 2, height: sunR * 2))
            ctx.setFillColor(UIColor(red: 1, green: 0.7, blue: 0.3, alpha: 0.28).cgColor)
            ctx.fillEllipse(in: CGRect(x: sun.x - 18 * s, y: sun.y + 22 * s, width: 14 * s, height: 14 * s))
            ctx.setFillColor(UIColor(red: 0.6, green: 0.8, blue: 1, alpha: 0.2).cgColor)
            ctx.fillEllipse(in: CGRect(x: sun.x + 26 * s, y: sun.y + 40 * s, width: 8 * s, height: 8 * s))
        }
        if combat {
            if let origin = dragOrigin {
                strokeRing(ctx, origin, radius * 0.72, UIColor(white: 1, alpha: 0.28))
                let knob = CGPoint(x: origin.x + stick.x * radius * 0.5, y: origin.y - stick.y * radius * 0.5)
                let knobR = 16 * s
                ctx.setFillColor(UIColor(white: 0.95, alpha: 0.9).cgColor)
                ctx.fillEllipse(in: CGRect(x: knob.x - knobR, y: knob.y - knobR, width: knobR * 2, height: knobR * 2))
            }
            strokeRing(ctx, rightCenter, radius, firing ? UIColor(red: 1, green: 0.55, blue: 0.2, alpha: 0.95) : UIColor(white: 1, alpha: 0.28))
            if firing {
                let fireR = 22 * s
                ctx.setFillColor(UIColor(red: 1, green: 0.45, blue: 0.12, alpha: 0.35).cgColor)
                ctx.fillEllipse(in: CGRect(x: rightCenter.x - fireR, y: rightCenter.y - fireR, width: fireR * 2, height: fireR * 2))
            }
            drawRadar(ctx, rect, s)
            drawMarks(ctx, rect, s)
            drawLock(ctx, rect, s)
            let reticle = CGPoint(x: rect.midX, y: rect.midY - 20 * s)
            let reticleR = 7 * s
            ctx.setStrokeColor(UIColor(white: 1, alpha: 0.35).cgColor)
            ctx.setLineWidth(max(1, s))
            ctx.stroke(CGRect(x: reticle.x - reticleR, y: reticle.y - reticleR, width: reticleR * 2, height: reticleR * 2))
        }
        let gemMarks = gems.isEmpty ? pickupPoints.map { ($0, "") } : gems
        for gem in gemMarks {
            let point = gem.0
            ctx.setStrokeColor(UIColor(red: 1, green: 0.82, blue: 0.35, alpha: 0.95).cgColor)
            ctx.setLineWidth(2 * s)
            ctx.move(to: CGPoint(x: point.x, y: point.y - 14 * s))
            ctx.addLine(to: CGPoint(x: point.x + 10 * s, y: point.y))
            ctx.addLine(to: CGPoint(x: point.x, y: point.y + 14 * s))
            ctx.addLine(to: CGPoint(x: point.x - 10 * s, y: point.y))
            ctx.closePath()
            ctx.strokePath()
            if !gem.1.isEmpty {
                let attrs: [NSAttributedString.Key: Any] = [
                    .font: UIFont.monospacedSystemFont(ofSize: 11 * s, weight: .medium),
                    .foregroundColor: UIColor(red: 1, green: 0.86, blue: 0.45, alpha: 1),
                ]
                (gem.1 as NSString).draw(at: CGPoint(x: point.x - 28 * s, y: point.y + 16 * s), withAttributes: attrs)
            }
        }
        for popup in popups {
            let alpha = CGFloat(max(0, 1 - popup.age / 0.95))
            let attrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.monospacedSystemFont(ofSize: 13 * s, weight: .light),
                .foregroundColor: UIColor(red: 1, green: 0.86, blue: 0.55, alpha: alpha),
            ]
            let origin = CGPoint(x: popup.point.x - 22 * s, y: popup.point.y - 30 * s - CGFloat(popup.age) * 18 * s)
            (popup.text as NSString).draw(at: origin, withAttributes: attrs)
        }
    }

    private func drawRadar(_ ctx: CGContext, _ rect: CGRect, _ s: CGFloat) {
        let center = CGPoint(x: rect.width - 96 * s, y: 210 * s)
        let rad = 72 * s
        ctx.setStrokeColor(UIColor(white: 1, alpha: 0.45).cgColor)
        ctx.setLineWidth(max(1.5, 1.5 * s))
        ctx.strokeEllipse(in: CGRect(x: center.x - rad, y: center.y - rad, width: rad * 2, height: rad * 2))
        ctx.setStrokeColor(UIColor(white: 1, alpha: 0.2).cgColor)
        ctx.strokeEllipse(in: CGRect(x: center.x - rad * 0.55, y: center.y - rad * 0.55, width: rad * 1.1, height: rad * 1.1))
        ctx.setStrokeColor(UIColor(white: 1, alpha: 0.35).cgColor)
        ctx.move(to: CGPoint(x: center.x, y: center.y - rad))
        ctx.addLine(to: CGPoint(x: center.x, y: center.y + rad))
        ctx.move(to: CGPoint(x: center.x - rad, y: center.y))
        ctx.addLine(to: CGPoint(x: center.x + rad, y: center.y))
        ctx.strokePath()
        let sweep = CGFloat(CACurrentMediaTime().truncatingRemainder(dividingBy: 2.4) / 2.4) * 2 * .pi
        ctx.setStrokeColor(UIColor(red: 0.5, green: 1, blue: 0.85, alpha: 0.7).cgColor)
        ctx.move(to: center)
        ctx.addLine(to: CGPoint(x: center.x + sin(sweep) * rad, y: center.y - cos(sweep) * rad))
        ctx.strokePath()
        for blip in blips {
            let color: UIColor
            switch blip.kind {
            case 1: color = UIColor(red: 1, green: 0.62, blue: 0.2, alpha: 1)
            case 2: color = UIColor(red: 0.95, green: 0.85, blue: 0.4, alpha: 1)
            case 3: color = UIColor(red: 0.4, green: 0.9, blue: 1, alpha: 1)
            default: color = UIColor(red: 1, green: 0.2, blue: 0.12, alpha: 1)
            }
            ctx.setFillColor(color.cgColor)
            let p = CGPoint(x: center.x + blip.x * rad * 0.86, y: center.y - blip.y * rad * 0.86)
            let dot: CGFloat = blip.kind == 0 ? 8 : 6.5
            ctx.fillEllipse(in: CGRect(x: p.x - dot * s * 0.5, y: p.y - dot * s * 0.5, width: dot * s, height: dot * s))
        }
    }

    private func drawLock(_ ctx: CGContext, _ rect: CGRect, _ s: CGFloat) {
        guard let lock = lockPoint, !lockTitle.isEmpty else { return }
        let color = lockTitle == "BANDIT"
            ? UIColor(red: 1, green: 0.62, blue: 0.18, alpha: 1)
            : UIColor(red: 1, green: 0.22, blue: 0.12, alpha: 1)
        bracket(ctx, lock, 46 * s, color)
        let attrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 13 * s, weight: .medium),
            .foregroundColor: color,
        ]
        (lockTitle as NSString).draw(at: CGPoint(x: lock.x - 28 * s, y: lock.y - 68 * s), withAttributes: attrs)
        let bar = CGRect(x: lock.x - 36 * s, y: lock.y - 50 * s, width: 72 * s, height: 5 * s)
        ctx.setFillColor(UIColor(white: 1, alpha: 0.25).cgColor)
        ctx.fill(bar)
        ctx.setFillColor(color.cgColor)
        ctx.fill(CGRect(x: bar.minX, y: bar.minY, width: bar.width * max(0, min(1, lockHealth)), height: bar.height))
        if lockMissile {
            let lockAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.monospacedSystemFont(ofSize: 12 * s, weight: .bold),
                .foregroundColor: UIColor(red: 1, green: 0.55, blue: 0.15, alpha: 1),
            ]
            ("LOCK" as NSString).draw(at: CGPoint(x: lock.x - 16 * s, y: lock.y + 50 * s), withAttributes: lockAttrs)
        }
    }

    private func drawMarks(_ ctx: CGContext, _ rect: CGRect, _ s: CGFloat) {
        let inset = rect.insetBy(dx: 28 * s, dy: 36 * s)
        for mark in marks {
            let color: UIColor
            switch mark.kind {
            case 1: color = UIColor(red: 1, green: 0.62, blue: 0.18, alpha: 0.95)
            case 2: color = UIColor(red: 1, green: 0.86, blue: 0.4, alpha: 0.95)
            case 3: color = UIColor(red: 0.45, green: 0.9, blue: 1, alpha: 0.95)
            default: color = UIColor(red: 1, green: 0.18, blue: 0.08, alpha: 0.95)
            }
            if let point = mark.point, inset.contains(point) {
                let arm: CGFloat = mark.kind == 0 ? 34 : (mark.kind == 3 ? 18 : 28)
                bracket(ctx, point, arm * s, color)
                let label = "\(Int(mark.distance))m"
                let attrs: [NSAttributedString.Key: Any] = [
                    .font: UIFont.monospacedSystemFont(ofSize: 11 * s, weight: .light),
                    .foregroundColor: color,
                ]
                (label as NSString).draw(at: CGPoint(x: point.x - 16 * s, y: point.y + 18 * s), withAttributes: attrs)
            } else {
                let rx = inset.width * 0.48
                let ry = inset.height * 0.46
                let tip = CGPoint(
                    x: rect.midX + CGFloat(sin(mark.bearing)) * rx,
                    y: rect.midY - CGFloat(cos(mark.bearing)) * ry
                )
                ctx.setFillColor(color.cgColor)
                ctx.move(to: tip)
                let back = CGFloat(mark.bearing)
                ctx.addLine(to: CGPoint(x: tip.x + CGFloat(sin(back + 2.6)) * 20 * s, y: tip.y - CGFloat(cos(back + 2.6)) * 20 * s))
                ctx.addLine(to: CGPoint(x: tip.x + CGFloat(sin(back - 2.6)) * 20 * s, y: tip.y - CGFloat(cos(back - 2.6)) * 20 * s))
                ctx.closePath()
                ctx.fillPath()
            }
        }
    }

    private func strokeRing(_ ctx: CGContext, _ center: CGPoint, _ radius: CGFloat, _ color: UIColor) {
        ctx.setStrokeColor(color.cgColor)
        ctx.setLineWidth(1.25 * max(scale, 0.5))
        ctx.strokeEllipse(in: CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2))
    }

    private func bracket(_ ctx: CGContext, _ center: CGPoint, _ arm: CGFloat, _ color: UIColor) {
        let s = max(scale, 0.5)
        ctx.setStrokeColor(color.cgColor)
        ctx.setLineWidth(2.2 * s)
        let tick = 12 * s
        let corners: [(CGFloat, CGFloat, CGFloat, CGFloat)] = [
            (-1, -1, 1, 1), (1, -1, -1, 1), (-1, 1, 1, -1), (1, 1, -1, -1),
        ]
        for (sx, sy, dx, dy) in corners {
            let x = center.x + sx * arm
            let y = center.y + sy * arm
            ctx.move(to: CGPoint(x: x, y: y + dy * tick))
            ctx.addLine(to: CGPoint(x: x, y: y))
            ctx.addLine(to: CGPoint(x: x + dx * tick, y: y))
            ctx.strokePath()
        }
    }
}

final class TouchPad: UIView {
    var stick = CGPoint.zero
    var firing = false
    var leftCenter = CGPoint.zero
    var rightCenter = CGPoint.zero
    var radius: CGFloat = 74
    var onChange: (() -> Void)?
    var dragOrigin: CGPoint?
    private var leftTouch: UITouch?
    private var rightTouch: UITouch?
    private var dragMoved: CGFloat = 0
    private var dragBegan: TimeInterval = 0
    private var lastPoint = CGPoint.zero
    private var lastEnded: TimeInterval = 0
    private var lastWasTap = false
    private var boostArmed = false
    private var trickCode = 0

    func consumeBoost() -> Bool {
        let armed = boostArmed
        boostArmed = false
        return armed
    }

    func consumeTrick() -> Int {
        let code = trickCode
        trickCode = 0
        return code
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        isMultipleTouchEnabled = true
    }

    required init?(coder: NSCoder) { return nil }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) { claim(touches) }
    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
        if let leftTouch, touches.contains(leftTouch) { updateStick(leftTouch) }
        onChange?()
    }
    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) { release(touches) }
    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) { release(touches) }

    private func claim(_ touches: Set<UITouch>) {
        for touch in touches {
            let p = touch.location(in: self)
            if p.x < bounds.midX {
                if leftTouch == nil {
                    if lastWasTap && touch.timestamp - lastEnded < 0.32 {
                        boostArmed = true
                    }
                    leftTouch = touch
                    dragOrigin = p
                    lastPoint = p
                    dragMoved = 0
                    dragBegan = touch.timestamp
                    stick = .zero
                }
            } else if rightTouch == nil {
                rightTouch = touch
                firing = true
            }
        }
        onChange?()
    }

    private func release(_ touches: Set<UITouch>) {
        for touch in touches {
            if touch === leftTouch {
                let elapsed = touch.timestamp - dragBegan
                let origin = dragOrigin ?? lastPoint
                let dx = lastPoint.x - origin.x
                let dy = origin.y - lastPoint.y
                if elapsed < 0.38 && dragMoved > 78 {
                    if abs(dx) > abs(dy) * 1.15 && abs(dx) > 64 {
                        trickCode = dx > 0 ? 2 : 3
                    } else if dy > 64 && dy > abs(dx) {
                        trickCode = 1
                    }
                }
                lastWasTap = dragMoved < 26
                lastEnded = touch.timestamp
                leftTouch = nil
                dragOrigin = nil
                stick = .zero
            }
            if touch === rightTouch {
                rightTouch = nil
                firing = false
            }
        }
        onChange?()
    }

    private func updateStick(_ touch: UITouch) {
        let p = touch.location(in: self)
        lastPoint = p
        let origin = dragOrigin ?? p
        let dx = p.x - origin.x
        let dy = origin.y - p.y
        dragMoved = max(dragMoved, hypot(dx, dy))
        let mag = hypot(dx, dy)
        let limit = max(radius * 0.85, 64)
        let scale = mag > limit ? limit / mag : 1
        var x = dx * scale / limit
        var y = dy * scale / limit
        if hypot(x, y) < 0.12 {
            x = 0
            y = 0
        }
        stick = CGPoint(x: x, y: y)
    }
}
