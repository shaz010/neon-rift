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
        window.rootViewController = FlightViewController()
        window.makeKeyAndVisible()
        self.window = window
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        AudioSession.engage()
    }
}
