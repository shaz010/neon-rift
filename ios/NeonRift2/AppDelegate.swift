import AVFoundation
import Darwin
import UIKit

/// Holds the shared audio session in Playback so the score ignores the silent switch.
enum AudioSession {
    static func engage() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, mode: .default, options: [])
            try session.setActive(true)
        } catch {
            NSLog("Neon Rift 2 audio session: \(error.localizedDescription)")
        }
    }
}

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        setbuf(stdout, nil)
        NSLog("NR2 boot")
        print("NR2 boot")
        fflush(stdout)
        AudioSession.engage()
        return true
    }

    func application(
        _ application: UIApplication,
        configurationForConnecting connectingSceneSession: UISceneSession,
        options: UIScene.ConnectionOptions
    ) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default", sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        AudioSession.engage()
    }

    func application(
        _ application: UIApplication,
        supportedInterfaceOrientationsFor window: UIWindow?
    ) -> UIInterfaceOrientationMask {
        UIDevice.current.userInterfaceIdiom == .pad ? .all : .portrait
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let windowScene = scene as? UIWindowScene else { return }
        AudioSession.engage()
        if #available(iOS 16.0, *), UIDevice.current.userInterfaceIdiom != .pad {
            windowScene.requestGeometryUpdate(.iOS(interfaceOrientations: .portrait))
        }
        let window = UIWindow(windowScene: windowScene)
        window.backgroundColor = .black
        window.rootViewController = rootController()
        window.makeKeyAndVisible()
        self.window = window
    }

    /// The reel passes -showcase and must open straight into the flight.
    /// A normal launch stops in the hangar. -showroom opens the inspection pad.
    private func rootController() -> UIViewController {
        let args = ProcessInfo.processInfo.arguments
        let env = ProcessInfo.processInfo.environment
        if args.contains("-showcase") || env["NR2_SHOWCASE"] == "1" {
            return FlightViewController()
        }
        if args.contains("-showroom") || env["NR2_SHOWROOM"] == "1" {
            return ShipShowroomViewController(mode: .inspect, announce: true)
        }
        return ShipShowroomViewController(mode: .menu)
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        AudioSession.engage()
    }
}
