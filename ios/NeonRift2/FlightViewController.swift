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
    private let pauseButton = UIButton(type: .system)
    private let pausedLabel = UILabel()
    private var flightPaused = false
    private var hangarAtBottom = false
    private let faceButton = UIButton(type: .system)
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
        logLine("NR2 flight view")
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
        promptLabel.numberOfLines = 1
        promptLabel.adjustsFontSizeToFitWidth = true
        promptLabel.minimumScaleFactor = 0.7
        promptLabel.text = "LEFT DRIVES  ·  RIGHT AIMS"
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
            self.world?.inputAim = self.touch.aim
            self.world?.inputFire = self.touch.firing
            if self.touch.consumeBoost() { self.world?.requestBoost() }
            switch self.touch.consumeTrick() {
            case 1: self.world?.requestLoop(direction: 1)
            case 4: self.world?.requestLoop(direction: -1)
            case 2: self.world?.requestRoll(direction: 1)
            case 3: self.world?.requestRoll(direction: -1)
            default: break
            }
        }
        touch.onTap = { [weak self] point in
            guard let self, let id = self.overlay.targetID(at: point) else { return false }
            self.world?.selectTarget(id: id)
            return true
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
        configure(pauseButton, title: "PAUSE", action: #selector(togglePause))
        pauseButton.isHidden = true
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
        pausedLabel.font = UIFont.monospacedSystemFont(ofSize: 22, weight: .medium)
        pausedLabel.textColor = UIColor(white: 0.95, alpha: 1)
        pausedLabel.textAlignment = .center
        pausedLabel.text = "PAUSED"
        pausedLabel.isHidden = true
        pausedLabel.isUserInteractionEnabled = false
        view.addSubview(pausedLabel)

        for label in [clockLabel, navLabel, speedLabel, weaponLabel, compassLabel, shieldLabel] {
            view.addSubview(label)
        }

        NotificationCenter.default.addObserver(self, selector: #selector(pauseScene), name: UIApplication.didEnterBackgroundNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(resumeScene), name: UIApplication.didBecomeActiveNotification, object: nil)

        startWorld()
        logLine("NR2 flight ready")
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
        requestShowcaseOrientation()
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
        clockLabel.alpha = 0
        navLabel.alpha = 0
        speedLabel.alpha = combat && !m.cockpit ? 1 : 0
        weaponLabel.alpha = 0
        compassLabel.alpha = 0
        shieldLabel.alpha = combat && !m.cockpit ? 1 : 0
        promptLabel.text = m.phase == .combat ? m.objective : "LEFT DRIVES  ·  RIGHT AIMS"
        promptLabel.alpha = m.phase == .combat ? 1 : (m.phase == .cinema && m.titleAlpha < 0.25 ? 1 : 0)
        calloutLabel.text = m.callout
        calloutLabel.alpha = CGFloat(m.calloutAlpha)
        titleLabel.alpha = CGFloat(m.titleAlpha)
        flashView.alpha = min(0.6, CGFloat(m.flash) * 0.45 + CGFloat(m.trickShot) * 0.12)
        skipButton.isHidden = m.phase != .cinema
        let inFlight = m.phase == .combat || m.phase == .warden
        touch.isUserInteractionEnabled = combat && !flightPaused
        replayButton.isHidden = !m.showResults
        hangarAtBottom = m.showResults
        hangarButton.isHidden = !(inFlight || m.showResults)
        pauseButton.isHidden = !inFlight
        if m.showResults || inFlight { view.bringSubviewToFront(hangarButton) }
        view.bringSubviewToFront(pauseButton)
        resultsLabel.alpha = m.showResults ? 1 : 0
        beamButton.isHidden = m.phase != .combat || !m.beamReady
        beamButton.setTitle(m.towing ? "RELEASE" : "BEAM NOW", for: .normal)
        let beamHot = m.beamReady && !m.towing
        beamButton.layer.borderColor = (beamHot ? UIColor(red: 1, green: 0.72, blue: 0.28, alpha: 1) : UIColor(white: 0.75, alpha: 0.85)).cgColor
        beamButton.backgroundColor = beamHot ? UIColor(red: 0.35, green: 0.16, blue: 0.02, alpha: 0.8) : UIColor(white: 0, alpha: 0.35)
        viewButton.setTitle("VIEW: \(m.viewName)", for: .normal)
        viewButton.isHidden = m.phase != .combat
        cycleButton.isHidden = true  // b17: auto-lock only
        faceButton.isHidden = true  // b17: auto-lock only
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
        overlay.aimOrigin = touch.aimOrigin
        overlay.aim = touch.aim
        overlay.lockPoint = project(m.lockWorld)
        overlay.leadPoint = project(m.leadWorld)
        overlay.hurt = CGFloat(m.hurt)
        overlay.streakCount = m.streakCount
        overlay.speedValue = CGFloat(m.speedValue)
        overlay.lockTitle = m.lockTitle
        overlay.lockHealth = CGFloat(m.lockHealth)
        overlay.lockMissile = m.lockMissile
        overlay.cockpit = m.cockpit
        overlay.lockID = m.lockID
        overlay.lockDistance = CGFloat(m.lockDistance)
        overlay.lockChosen = m.lockChosen
        overlay.lockAge = CGFloat(m.lockAge)
        overlay.lockCritical = m.lockCritical
        overlay.heat = CGFloat(m.heat)
        overlay.overheated = m.overheated
        overlay.overdrive = CGFloat(m.overdrive)
        overlay.hintPoint = project(m.hintWorld)
        overlay.bossTitle = m.bossTitle
        overlay.bossHealth = CGFloat(m.bossHealth)
        overlay.guideTitle = m.guideTitle
        overlay.guideBearing = CGFloat(m.guideBearing)
        overlay.guideDistance = CGFloat(m.guideDistance)
        overlay.guidePoint = project(m.guideWorld)
        overlay.gems = m.gems.compactMap { gem in
            guard let point = project(gem.0) else { return nil }
            return (point, gem.1)
        }
        overlay.marks = m.contacts.map { contact in
            HudMark(point: project(contact.world), kind: contact.kind, distance: contact.distance, bearing: contact.bearing, id: contact.id, health: contact.health)
        }
        overlay.blips = m.blips.map { HudBlipView(x: CGFloat($0.x), y: CGFloat($0.y), kind: $0.kind, id: $0.id) }
        overlay.pickupPoints = m.pickups.compactMap { project($0) }
        overlay.sunPoint = project(m.sunWorld)
        overlay.popups = m.popups.compactMap { item in
            guard let p = project(item.0) else { return nil }
            return HudPopup(point: p, text: item.1, age: item.2)
        }
        overlay.setNeedsDisplay()
        let speedNumber = m.speed.replacingOccurrences(of: "SPD ", with: "")
        let targetLine = m.lockTitle.isEmpty ? "NO LOCK" : m.lockTitle
        world?.applyCockpitReadout(speed: speedNumber, target: targetLine)

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
        promptLabel.frame = CGRect(x: b.midX - 110 * scale, y: safe.top + 46 * scale, width: 220 * scale, height: 22 * scale)
        calloutLabel.frame = CGRect(x: 20 * scale, y: b.midY - 70 * scale, width: b.width - 40 * scale, height: 28 * scale)
        let buttonW = 92 * scale
        let buttonH = 32 * scale
        viewButton.frame = CGRect(x: safe.left + 16 * scale, y: safe.top + 8 * scale, width: buttonW, height: buttonH)
        faceButton.frame = CGRect(x: safe.left + 16 * scale, y: safe.top + 46 * scale, width: buttonW, height: buttonH)
        cycleButton.frame = CGRect(x: b.width - safe.right - buttonW - 16 * scale, y: safe.top + 48 * scale, width: buttonW, height: buttonH)
        beamButton.frame = CGRect(x: b.width - safe.right - buttonW * 1.2 - 16 * scale, y: b.height - safe.bottom - 210 * scale, width: buttonW * 1.2, height: buttonH)
        creditsLabel.frame = CGRect(x: 28 * scale, y: b.height * 0.72 - creditScroll * 34 * scale, width: b.width - 56 * scale, height: 520 * scale)
        if hangarAtBottom {
            hangarButton.frame = CGRect(
                x: b.midX - 78 * scale,
                y: b.height - safe.bottom - 58 * scale,
                width: 156 * scale,
                height: 40 * scale
            )
        } else {
            hangarButton.frame = CGRect(
                x: b.width - safe.right - buttonW - 12 * scale,
                y: safe.top + 8 * scale,
                width: buttonW,
                height: buttonH
            )
        }
        pauseButton.frame = CGRect(
            x: b.width - safe.right - buttonW * 2 - 20 * scale,
            y: safe.top + 8 * scale,
            width: buttonW,
            height: buttonH
        )
        pausedLabel.frame = CGRect(x: 20 * scale, y: b.midY - 20 * scale, width: b.width - 40 * scale, height: 36 * scale)
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

    private func logLine(_ line: String) {
        NSLog("%@", line)
        print(line)
        fflush(stdout)
    }

    private func logOrientation(_ bounds: CGRect) {
        guard bounds.width > 1, bounds.height > 1 else { return }
        let orient = bounds.width > bounds.height ? "landscape" : "portrait"
        let line = "NR2 orientation \(orient) \(Int(bounds.width.rounded()))x\(Int(bounds.height.rounded()))"
        guard line != lastOrientationLog else { return }
        lastOrientationLog = line
        logLine(line)
    }

    /// Simulator smoke launches pass -portrait or -landscape. iPhone stays portrait.
    /// A missing window must retry on the next layout, so the flag is set only
    /// after the scene is in hand.
    private func requestShowcaseOrientation() {
        guard !requestedOrientation else { return }
        guard isPad else {
            requestedOrientation = true
            return
        }
        let args = ProcessInfo.processInfo.arguments
        let mask: UIInterfaceOrientationMask
        if args.contains("-landscape") {
            mask = .landscapeRight
        } else if args.contains("-portrait") {
            mask = .portrait
        } else {
            requestedOrientation = true
            return
        }
        guard let scene = view.window?.windowScene else { return }
        guard #available(iOS 16.0, *) else {
            requestedOrientation = true
            return
        }
        requestedOrientation = true
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

    @objc private func skipCinema() { world?.skipCinema() }

    @objc private func flyAgain() {
        world?.onFrame = nil
        scnView.scene = nil
        scnView.delegate = nil
        startWorld()
    }

    @objc private func togglePause() {
        flightPaused.toggle()
        scnView.scene?.isPaused = flightPaused
        pauseButton.setTitle(flightPaused ? "RESUME" : "PAUSE", for: .normal)
        pausedLabel.isHidden = !flightPaused
        touch.isUserInteractionEnabled = !flightPaused
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
        if !flightPaused { scnView.scene?.isPaused = false }
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
    var id: Int = -1
    var health: Float = 1
}

struct HudBlipView {
    var x: CGFloat
    var y: CGFloat
    var kind: Int
    var id: Int = -1
}

final class HudOverlay: UIView {
    var combat = false
    var stick = CGPoint.zero
    var firing = false
    var lockPoint: CGPoint?
    var lockTitle = ""
    var lockHealth: CGFloat = 0
    var lockMissile = false
    var lockID = -1
    var lockDistance: CGFloat = 0
    var lockChosen = false
    var lockAge: CGFloat = 0
    var lockCritical = false
    var heat: CGFloat = 0
    var overheated = false
    var overdrive: CGFloat = 0
    var hintPoint: CGPoint?
    var bossTitle = ""
    var bossHealth: CGFloat = 0
    var cockpit = false
    var leadPoint: CGPoint?
    var hurt: CGFloat = 0
    var streakCount = 0
    var speedValue: CGFloat = 0
    var guideTitle = ""
    var guideBearing: CGFloat = 0
    var guideDistance: CGFloat = 0
    var guidePoint: CGPoint?
    var gems: [(CGPoint, String)] = []
    var pickupPoints: [CGPoint] = []
    var sunPoint: CGPoint?
    var popups: [HudPopup] = []
    var marks: [HudMark] = []
    var blips: [HudBlipView] = []
    var dragOrigin: CGPoint?
    var aimOrigin: CGPoint?
    var aim = CGPoint.zero
    var leftCenter = CGPoint.zero
    var rightCenter = CGPoint.zero
    var radius: CGFloat = 74
    var scale: CGFloat = 1

    override func draw(_ rect: CGRect) {
        guard let ctx = UIGraphicsGetCurrentContext() else { return }
        let s = max(scale, 0.5)
        if let sun = sunPoint, rect.insetBy(dx: -40 * s, dy: -40 * s).contains(sun) {
            ctx.setFillColor(UIColor(red: 1, green: 0.9, blue: 0.7, alpha: 0.1).cgColor)
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
            if let origin = aimOrigin {
                strokeRing(ctx, origin, radius * 0.55, UIColor(red: 1, green: 0.7, blue: 0.35, alpha: 0.45))
                let knob = CGPoint(x: origin.x + aim.x * radius * 0.4, y: origin.y - aim.y * radius * 0.4)
                let knobR = 14 * s
                ctx.setFillColor(UIColor(red: 1, green: 0.72, blue: 0.35, alpha: 0.9).cgColor)
                ctx.fillEllipse(in: CGRect(x: knob.x - knobR, y: knob.y - knobR, width: knobR * 2, height: knobR * 2))
            }
            strokeRing(ctx, rightCenter, radius, firing ? UIColor(red: 1, green: 0.55, blue: 0.2, alpha: 0.55) : UIColor(white: 1, alpha: 0.2))
            if firing {
                let fireR = 22 * s
                ctx.setFillColor(UIColor(red: 1, green: 0.45, blue: 0.12, alpha: 0.35).cgColor)
                ctx.fillEllipse(in: CGRect(x: rightCenter.x - fireR, y: rightCenter.y - fireR, width: fireR * 2, height: fireR * 2))
            }
            if !cockpit { drawRadar(ctx, rect, s) }
            drawMarks(ctx, rect, s)
            if !cockpit { drawLock(ctx, rect, s) }
            drawHeat(ctx, rect, s)
            drawBoss(ctx, rect, s)
            if let hint = hintPoint, rect.contains(hint) {
                let pulse = 0.5 + 0.5 * CGFloat(sin(CACurrentMediaTime() * 9))
                bracket(ctx, hint, (22 + 6 * pulse) * s, UIColor(red: 0.5, green: 1, blue: 0.9, alpha: 0.55 + 0.4 * pulse))
                let attrs: [NSAttributedString.Key: Any] = [
                    .font: UIFont.monospacedSystemFont(ofSize: 10 * s, weight: .bold),
                    .foregroundColor: UIColor(red: 0.5, green: 1, blue: 0.9, alpha: 0.9),
                ]
                ("NEXT" as NSString).draw(at: CGPoint(x: hint.x - 12 * s, y: hint.y + 30 * s), withAttributes: attrs)
            }
            drawGuide(ctx, rect, s)
            if cockpit {
                drawCockpitGlass(ctx, rect, s)
            } else {
            let reticle = CGPoint(x: rect.midX, y: rect.midY - 8 * s)
            ctx.setStrokeColor(UIColor(white: 1, alpha: 0.9).cgColor)
            ctx.setLineWidth(max(1.4, 1.4 * s))
            let gap = 7 * s
            let arm = 16 * s
            ctx.move(to: CGPoint(x: reticle.x - gap - arm, y: reticle.y))
            ctx.addLine(to: CGPoint(x: reticle.x - gap, y: reticle.y))
            ctx.move(to: CGPoint(x: reticle.x + gap, y: reticle.y))
            ctx.addLine(to: CGPoint(x: reticle.x + gap + arm, y: reticle.y))
            ctx.move(to: CGPoint(x: reticle.x, y: reticle.y - gap - arm))
            ctx.addLine(to: CGPoint(x: reticle.x, y: reticle.y - gap))
            ctx.move(to: CGPoint(x: reticle.x, y: reticle.y + gap))
            ctx.addLine(to: CGPoint(x: reticle.x, y: reticle.y + gap + arm))
            ctx.strokePath()
            }
        }
        for gem in gems {
            let point = gem.0
            ctx.setStrokeColor(UIColor(red: 1, green: 0.82, blue: 0.35, alpha: 0.9).cgColor)
            ctx.setLineWidth(2 * s)
            ctx.move(to: CGPoint(x: point.x, y: point.y - 12 * s))
            ctx.addLine(to: CGPoint(x: point.x + 8 * s, y: point.y))
            ctx.addLine(to: CGPoint(x: point.x, y: point.y + 12 * s))
            ctx.addLine(to: CGPoint(x: point.x - 8 * s, y: point.y))
            ctx.closePath()
            ctx.strokePath()
        }
        for popup in popups {
            let alpha = CGFloat(max(0, 1 - popup.age / 1.4))
            let big = popup.text.hasPrefix("+") || popup.text.hasPrefix("KILL") || popup.text == "TRICK SHOT"
                || popup.text == "OVERDRIVE" || popup.text.hasPrefix("WARDEN")
            let attrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.monospacedSystemFont(ofSize: (big ? 22 : 13) * s, weight: big ? .heavy : .light),
                .foregroundColor: UIColor(red: 1, green: 0.86, blue: 0.55, alpha: alpha),
            ]
            let origin = CGPoint(x: popup.point.x - 22 * s, y: popup.point.y - 30 * s - CGFloat(popup.age) * 18 * s)
            (popup.text as NSString).draw(at: origin, withAttributes: attrs)
        }
    }

    private func drawRadar(_ ctx: CGContext, _ rect: CGRect, _ s: CGFloat) {
        let center = radarCenter(rect, s)
        let rad = 52 * s
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

    private func drawGuide(_ ctx: CGContext, _ rect: CGRect, _ s: CGFloat) {
        guard !guideTitle.isEmpty else { return }
        let y = 78 * s
        let mid = rect.midX
        let width = min(rect.width * 0.42, 180 * s)
        ctx.setStrokeColor(UIColor(white: 1, alpha: 0.35).cgColor)
        ctx.setLineWidth(max(1, s))
        ctx.move(to: CGPoint(x: mid - width * 0.5, y: y))
        ctx.addLine(to: CGPoint(x: mid + width * 0.5, y: y))
        ctx.strokePath()
        let offset = CGFloat(sin(guideBearing)) * width * 0.46
        let pip = CGPoint(x: mid + offset, y: y)
        ctx.setFillColor(UIColor(red: 0.45, green: 0.95, blue: 1, alpha: 0.95).cgColor)
        ctx.fillEllipse(in: CGRect(x: pip.x - 4 * s, y: pip.y - 4 * s, width: 8 * s, height: 8 * s))
        let attrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 11 * s, weight: .medium),
            .foregroundColor: UIColor(red: 0.7, green: 0.95, blue: 1, alpha: 1),
        ]
        let title = "\(guideTitle)  \(Int(guideDistance))m"
        (title as NSString).draw(at: CGPoint(x: mid - 46 * s, y: y + 6 * s), withAttributes: attrs)
        let inset = rect.insetBy(dx: 36 * s, dy: 48 * s)
        if guidePoint == nil || (guidePoint.map { !inset.contains($0) } ?? true) {
            let tip = CGPoint(
                x: rect.midX + CGFloat(sin(guideBearing)) * inset.width * 0.46,
                y: rect.midY - CGFloat(cos(guideBearing)) * inset.height * 0.42
            )
            ctx.setFillColor(UIColor(red: 0.45, green: 0.95, blue: 1, alpha: 0.95).cgColor)
            ctx.move(to: tip)
            let back = guideBearing
            ctx.addLine(to: CGPoint(x: tip.x + CGFloat(sin(back + 2.6)) * 18 * s, y: tip.y - CGFloat(cos(back + 2.6)) * 18 * s))
            ctx.addLine(to: CGPoint(x: tip.x + CGFloat(sin(back - 2.6)) * 18 * s, y: tip.y - CGFloat(cos(back - 2.6)) * 18 * s))
            ctx.closePath()
            ctx.fillPath()
        }
    }

    private func radarCenter(_ rect: CGRect, _ s: CGFloat) -> CGPoint {
        CGPoint(x: rect.width - 78 * s, y: 188 * s)
    }

    /// b18: tap-to-lock lookup. Brackets within 44pt, or a radar blip.
    func targetID(at point: CGPoint) -> Int? {
        let s = max(scale, 0.5)
        var best: (Int, CGFloat)?
        for mark in marks where mark.id >= 0 && mark.kind != 2 {
            guard let p = mark.point else { continue }
            let d = hypot(p.x - point.x, p.y - point.y)
            if d < 44 * s && (best == nil || d < best!.1) { best = (mark.id, d) }
        }
        if let best { return best.0 }
        if !cockpit {
            let center = radarCenter(bounds, s)
            let rad = 52 * s
            for blip in blips where blip.id >= 0 && blip.kind != 2 && blip.kind != 3 {
                let p = CGPoint(x: center.x + blip.x * rad * 0.86, y: center.y - blip.y * rad * 0.86)
                let d = hypot(p.x - point.x, p.y - point.y)
                if d < 18 * s && (best == nil || d < best!.1) { best = (blip.id, d) }
            }
        }
        return best?.0
    }

    /// b19 cockpit glass HUD: centre crosshair (red + LOCKED when the lock is near it),
    /// lead pip, target ring, speed, heat and combo, plus flicker and sparks on hits.
    private func drawCockpitGlass(_ ctx: CGContext, _ rect: CGRect, _ s: CGFloat) {
        let c = CGPoint(x: rect.midX, y: rect.midY)
        let glass = UIColor(red: 0.45, green: 1, blue: 0.95, alpha: 0.9)
        var onTarget = false
        if let lock = lockPoint, !lockTitle.isEmpty {
            onTarget = hypot(lock.x - c.x, lock.y - c.y) < 70 * s
        }
        let red = UIColor(red: 1, green: 0.2, blue: 0.15, alpha: 0.95)
        let col = onTarget ? red : glass
        ctx.saveGState()
        ctx.setShadow(offset: .zero, blur: 8 * s, color: col.withAlphaComponent(0.8).cgColor)
        ctx.setStrokeColor(col.cgColor)
        ctx.setLineWidth(1.6 * s)
        let gap = 8 * s, arm = 18 * s
        for (dx, dy) in [(-1.0, 0.0), (1.0, 0.0), (0.0, -1.0), (0.0, 1.0)] as [(CGFloat, CGFloat)] {
            ctx.move(to: CGPoint(x: c.x + dx * gap, y: c.y + dy * gap))
            ctx.addLine(to: CGPoint(x: c.x + dx * (gap + arm), y: c.y + dy * (gap + arm)))
        }
        ctx.strokePath()
        ctx.fillEllipse(in: CGRect(x: c.x - 1.5 * s, y: c.y - 1.5 * s, width: 3 * s, height: 3 * s))
        // Target ring: lock health around the crosshair.
        let ringR = 44 * s
        ctx.setStrokeColor(col.withAlphaComponent(0.25).cgColor)
        ctx.strokeEllipse(in: CGRect(x: c.x - ringR, y: c.y - ringR, width: ringR * 2, height: ringR * 2))
        if !lockTitle.isEmpty {
            ctx.setLineWidth(3 * s)
            ctx.setStrokeColor(col.cgColor)
            ctx.addArc(center: c, radius: ringR, startAngle: -.pi / 2,
                       endAngle: -.pi / 2 + 2 * .pi * max(0, min(1, lockHealth)), clockwise: false)
            ctx.strokePath()
        }
        let font: (CGFloat) -> [NSAttributedString.Key: Any] = { size in
            [.font: UIFont.monospacedSystemFont(ofSize: size * s, weight: .bold), .foregroundColor: col]
        }
        if onTarget {
            ("LOCKED" as NSString).draw(at: CGPoint(x: c.x - 22 * s, y: c.y + ringR + 6 * s), withAttributes: font(11))
        }
        if let lock = lockPoint, !lockTitle.isEmpty, rect.contains(lock) {
            bracket(ctx, lock, 26 * s, red.withAlphaComponent(0.8))
            ("\(Int(lockDistance))m" as NSString).draw(at: CGPoint(x: lock.x + 30 * s, y: lock.y - 6 * s), withAttributes: font(10))
        }
        if let lead = leadPoint, !lockTitle.isEmpty, rect.contains(lead) {
            let r = 7 * s
            ctx.setLineWidth(2 * s)
            ctx.setStrokeColor(UIColor(red: 1, green: 0.85, blue: 0.3, alpha: 0.95).cgColor)
            ctx.strokeEllipse(in: CGRect(x: lead.x - r, y: lead.y - r, width: r * 2, height: r * 2))
            if let lock = lockPoint {
                ctx.setLineWidth(1 * s)
                ctx.move(to: lock)
                ctx.addLine(to: lead)
                ctx.strokePath()
            }
        }
        // Glass panel left: speed. Right: heat. Top: combo.
        let panelY = c.y + 90 * s
        ("SPD \(Int(speedValue))" as NSString).draw(at: CGPoint(x: c.x - 120 * s, y: panelY), withAttributes: font(13))
        let barW = 70 * s
        let heatRect = CGRect(x: c.x + 50 * s, y: panelY + 4 * s, width: barW, height: 6 * s)
        ctx.setStrokeColor(glass.withAlphaComponent(0.5).cgColor)
        ctx.setLineWidth(1 * s)
        ctx.stroke(heatRect)
        let hot = overheated ? red : UIColor(red: 1, green: 0.6 + 0.4 * (1 - heat), blue: 0.2, alpha: 0.9)
        ctx.setFillColor(hot.cgColor)
        ctx.fill(CGRect(x: heatRect.minX, y: heatRect.minY, width: barW * max(0, min(1, heat)), height: heatRect.height))
        ((overheated ? "OVERHEAT" : "HEAT") as NSString).draw(at: CGPoint(x: heatRect.minX, y: panelY - 12 * s), withAttributes: font(9))
        if streakCount >= 2 {
            ("COMBO x\(streakCount)" as NSString).draw(at: CGPoint(x: c.x - 36 * s, y: c.y - ringR - 24 * s), withAttributes: font(12))
        }
        ctx.restoreGState()
        // Hit: frame lights flicker red and sparks spit from the canopy edges.
        if hurt > 0 {
            let on = Int(CACurrentMediaTime() * 30) % 3 != 0
            if on {
                ctx.setFillColor(UIColor(red: 1, green: 0.1, blue: 0.05, alpha: 0.16 * min(1, hurt)).cgColor)
                ctx.fill(rect)
            }
            ctx.setStrokeColor(UIColor(red: 1, green: 0.85, blue: 0.4, alpha: min(1, hurt)).cgColor)
            ctx.setLineWidth(1.5 * s)
            for _ in 0..<8 {
                let left = Bool.random()
                let start = CGPoint(x: left ? rect.minX + 6 * s : rect.maxX - 6 * s,
                                    y: CGFloat.random(in: rect.height * 0.2...rect.height * 0.8))
                let len = CGFloat.random(in: 10...34) * s
                let ang = CGFloat.random(in: -0.8...0.8) + (left ? 0 : .pi)
                ctx.move(to: start)
                ctx.addLine(to: CGPoint(x: start.x + cos(ang) * len, y: start.y + sin(ang) * len))
            }
            ctx.strokePath()
        }
    }

    private func drawLock(_ ctx: CGContext, _ rect: CGRect, _ s: CGFloat) {
        guard !lockTitle.isEmpty, lockID >= 0 || lockPoint != nil else { return }
        let color = lockTitle == "BANDIT"
            ? UIColor(red: 1, green: 0.62, blue: 0.18, alpha: 1)
            : UIColor(red: 1, green: 0.22, blue: 0.12, alpha: 1)
        let inset = rect.insetBy(dx: 30 * s, dy: 40 * s)
        guard let lock = lockPoint, inset.contains(lock) else {
            // Off-screen arrow toward the locked target.
            guard let mark = marks.first(where: { $0.id == lockID }) else { return }
            let b = CGFloat(mark.bearing)
            let tip = CGPoint(x: rect.midX + sin(b) * inset.width * 0.47, y: rect.midY - cos(b) * inset.height * 0.44)
            ctx.setFillColor(color.cgColor)
            ctx.move(to: tip)
            ctx.addLine(to: CGPoint(x: tip.x + sin(b + 2.5) * 26 * s, y: tip.y - cos(b + 2.5) * 26 * s))
            ctx.addLine(to: CGPoint(x: tip.x + sin(b - 2.5) * 26 * s, y: tip.y - cos(b - 2.5) * 26 * s))
            ctx.closePath()
            ctx.fillPath()
            let attrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.monospacedSystemFont(ofSize: 11 * s, weight: .bold),
                .foregroundColor: color,
            ]
            ("\(Int(lockDistance))m" as NSString).draw(at: CGPoint(x: tip.x - 16 * s, y: tip.y + 8 * s), withAttributes: attrs)
            return
        }
        // Closing brackets that snap in over 0.3s.
        let close = max(0, 1 - lockAge / 0.3)
        bracket(ctx, lock, (40 + 50 * close) * s, color.withAlphaComponent(1 - 0.4 * close))
        // Health ring.
        let ringR = 30 * s
        ctx.setLineWidth(3 * s)
        ctx.setStrokeColor(UIColor(white: 1, alpha: 0.2).cgColor)
        ctx.strokeEllipse(in: CGRect(x: lock.x - ringR, y: lock.y - ringR, width: ringR * 2, height: ringR * 2))
        let h = max(0, min(1, lockHealth))
        let ringColor = lockCritical ? UIColor(red: 1, green: 0.95, blue: 0.3, alpha: 1) : color
        ctx.setStrokeColor(ringColor.cgColor)
        ctx.addArc(center: lock, radius: ringR, startAngle: -.pi / 2, endAngle: -.pi / 2 + 2 * .pi * h, clockwise: false)
        ctx.strokePath()
        let attrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 13 * s, weight: .medium),
            .foregroundColor: color,
        ]
        (lockTitle as NSString).draw(at: CGPoint(x: lock.x - 30 * s, y: lock.y - 68 * s), withAttributes: attrs)
        let small: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 11 * s, weight: .bold),
            .foregroundColor: color,
        ]
        if lockAge > 0.3 {
            let tag = lockChosen ? "◆ LOCKED" : "LOCKED"
            (tag as NSString).draw(at: CGPoint(x: lock.x - 28 * s, y: lock.y + 44 * s), withAttributes: small)
        }
        ("\(Int(lockDistance))m" as NSString).draw(at: CGPoint(x: lock.x + 40 * s, y: lock.y - 6 * s), withAttributes: small)
        if lockMissile {
            ("MSL" as NSString).draw(at: CGPoint(x: lock.x - 72 * s, y: lock.y - 6 * s), withAttributes: small)
        }
    }

    private func drawHeat(_ ctx: CGContext, _ rect: CGRect, _ s: CGFloat) {
        let r = radius + 8 * s
        ctx.setLineWidth(5 * s)
        ctx.setStrokeColor(UIColor(white: 1, alpha: 0.12).cgColor)
        ctx.addArc(center: rightCenter, radius: r, startAngle: .pi * 0.8, endAngle: .pi * 0.2, clockwise: false)
        ctx.strokePath()
        let color: UIColor = overdrive > 0
            ? UIColor(red: 0.5, green: 1, blue: 0.95, alpha: 1)
            : (overheated ? UIColor(red: 1, green: 0.15, blue: 0.1, alpha: 1) : UIColor(red: 1, green: 0.4 + 0.4 * (1 - heat), blue: 0.15, alpha: 0.95))
        let frac = overdrive > 0 ? overdrive : heat
        if frac > 0.01 {
            ctx.setStrokeColor(color.cgColor)
            ctx.addArc(center: rightCenter, radius: r, startAngle: .pi * 0.8, endAngle: .pi * 0.8 + .pi * 1.4 * min(1, frac), clockwise: false)
            ctx.strokePath()
        }
        let label = overdrive > 0 ? "OVERDRIVE" : (overheated ? "OVERHEAT" : "HEAT")
        let attrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 10 * s, weight: .bold),
            .foregroundColor: color,
        ]
        (label as NSString).draw(at: CGPoint(x: rightCenter.x - 26 * s, y: rightCenter.y - r - 18 * s), withAttributes: attrs)
    }

    private func drawBoss(_ ctx: CGContext, _ rect: CGRect, _ s: CGFloat) {
        guard !bossTitle.isEmpty else { return }
        let w = min(rect.width * 0.7, 320 * s)
        let bar = CGRect(x: rect.midX - w / 2, y: 112 * s, width: w, height: 6 * s)
        ctx.setFillColor(UIColor(white: 1, alpha: 0.18).cgColor)
        ctx.fill(bar)
        ctx.setFillColor(UIColor(red: 1, green: 0.3, blue: 0.12, alpha: 1).cgColor)
        ctx.fill(CGRect(x: bar.minX, y: bar.minY, width: bar.width * max(0, min(1, bossHealth)), height: bar.height))
        let attrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 12 * s, weight: .heavy),
            .foregroundColor: UIColor(red: 1, green: 0.5, blue: 0.3, alpha: 1),
        ]
        (bossTitle as NSString).draw(at: CGPoint(x: bar.minX, y: bar.maxY + 4 * s), withAttributes: attrs)
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
                if let lock = lockPoint, hypot(point.x - lock.x, point.y - lock.y) < 36 * s { continue }
                let near = mark.distance < 140
                let fade = near ? 0.95 : max(0.18, 1 - Double(mark.distance - 140) / 380)
                let faded = color.withAlphaComponent(mark.kind == 2 ? 0.95 : CGFloat(fade))
                let arm: CGFloat = mark.kind == 0 ? 26 : 18
                bracket(ctx, point, arm * s, faded)
            } else if mark.kind == 2 {
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
    var aim = CGPoint.zero
    var aimOrigin: CGPoint? { rightOrigin }
    var firing = false
    var leftCenter = CGPoint.zero
    var rightCenter = CGPoint.zero
    var radius: CGFloat = 74
    var onChange: (() -> Void)?
    /// Short, still tap. Return true if it locked a target.
    var onTap: ((CGPoint) -> Bool)?
    var dragOrigin: CGPoint?
    private var leftTouch: UITouch?
    private var rightTouch: UITouch?
    private var rightOrigin: CGPoint?
    private var rightBegan: TimeInterval = 0
    private var rightMoved: CGFloat = 0
    private var dragMoved: CGFloat = 0
    private var dragBegan: TimeInterval = 0
    private var lastPoint = CGPoint.zero
    private var lastEnded: TimeInterval = 0
    private var lastWasTap = false
    private var boostArmed = false
    private var trickCode = 0
    // b18 two-finger swipe tricks.
    private var pair: [UITouch] = []
    private var pairBegan: TimeInterval = 0
    private var pairOrigin = CGPoint.zero
    private var pairDone = false
    private var lastTrick: TimeInterval = 0
    private var recent: [(UITouch, TimeInterval)] = []

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
        if let rightTouch, touches.contains(rightTouch) { updateAim(rightTouch) }
        if !pair.isEmpty && !pairDone && touches.contains(where: { t in pair.contains { $0 === t } }) {
            checkSwipe(now: touches.first?.timestamp ?? 0)
        }
        onChange?()
    }
    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) { release(touches) }
    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) { release(touches) }

    private func centroid(_ list: [UITouch]) -> CGPoint {
        guard !list.isEmpty else { return .zero }
        var x: CGFloat = 0, y: CGFloat = 0
        for t in list {
            let p = t.location(in: self)
            x += p.x
            y += p.y
        }
        return CGPoint(x: x / CGFloat(list.count), y: y / CGFloat(list.count))
    }

    private func claim(_ touches: Set<UITouch>) {
        let now = touches.first?.timestamp ?? 0
        recent.removeAll { now - $0.1 > 0.15 || $0.0.phase == .ended || $0.0.phase == .cancelled }
        for touch in touches {
            // Two fingers landing within ~0.15s become a swipe gesture, not stick or fire.
            if pair.isEmpty, let partner = recent.first(where: { $0.0 !== touch })?.0 {
                pair = [partner, touch]
                pairBegan = now
                pairOrigin = centroid(pair)
                pairDone = false
                recent.removeAll()
                if partner === leftTouch {
                    leftTouch = nil
                    dragOrigin = nil
                    stick = .zero
                    boostArmed = false
                }
                if partner === rightTouch {
                    rightTouch = nil
                    firing = false
                    rightOrigin = nil
                    aim = .zero
                }
                continue
            }
            recent.append((touch, touch.timestamp))
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
                rightOrigin = p
                rightBegan = touch.timestamp
                rightMoved = 0
                aim = .zero
            }
        }
        onChange?()
    }

    private func checkSwipe(now: TimeInterval) {
        let c = centroid(pair)
        let dx = c.x - pairOrigin.x
        let dy = pairOrigin.y - c.y
        guard now - pairBegan < 0.45, now - lastTrick > 0.8 else { return }
        if hypot(dx, dy) > 60 {
            pairDone = true
            lastTrick = now
            if abs(dx) > abs(dy) {
                trickCode = dx > 0 ? 2 : 3
            } else {
                trickCode = dy > 0 ? 1 : 4
            }
        }
    }

    private func release(_ touches: Set<UITouch>) {
        for touch in touches {
            if let i = pair.firstIndex(where: { $0 === touch }) {
                if !pairDone { checkSwipe(now: touch.timestamp) }
                pair.remove(at: i)
                if pair.isEmpty { pairDone = false }
                continue
            }
            if touch === leftTouch {
                let elapsed = touch.timestamp - dragBegan
                if elapsed < 0.25 && dragMoved < 12, let origin = dragOrigin, onTap?(origin) == true {
                    lastWasTap = false
                } else {
                    lastWasTap = dragMoved < 26
                }
                lastEnded = touch.timestamp
                leftTouch = nil
                dragOrigin = nil
                stick = .zero
            }
            if touch === rightTouch {
                if touch.timestamp - rightBegan < 0.25 && rightMoved < 12, let origin = rightOrigin {
                    _ = onTap?(origin)
                }
                rightTouch = nil
                firing = false
                rightOrigin = nil
                aim = .zero
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

    private func updateAim(_ touch: UITouch) {
        let p = touch.location(in: self)
        let origin = rightOrigin ?? p
        let dx = p.x - origin.x
        let dy = origin.y - p.y
        rightMoved = max(rightMoved, hypot(dx, dy))
        let mag = hypot(dx, dy)
        let limit = max(radius * 0.62, 54)
        let scale = mag > limit ? limit / mag : 1
        var x = dx * scale / limit
        var y = dy * scale / limit
        if hypot(x, y) < 0.08 {
            x = 0
            y = 0
        }
        aim = CGPoint(x: x, y: y)
    }
}
