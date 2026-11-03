import AVFoundation
// Rebuilds the b18 FlightAudio graph offline (manual rendering) and reports whether it starts and makes sound.
let dir = CommandLine.arguments[1]
let variant = CommandLine.arguments.count > 2 ? CommandLine.arguments[2] : "b18"
func load(_ n: String) -> AVAudioPCMBuffer {
    let f = try! AVAudioFile(forReading: URL(fileURLWithPath: "\(dir)/\(n).wav"))
    let b = AVAudioPCMBuffer(pcmFormat: f.processingFormat, frameCapacity: AVAudioFrameCount(f.length))!
    try! f.read(into: b); return b
}
let engine = AVAudioEngine()
let fmt = AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 2)!
try! engine.enableManualRenderingMode(.offline, format: fmt, maximumFrameCount: 4096)
let src = AVAudioSourceNode(format: fmt) { s, _, n, abl in
    for b in UnsafeMutableAudioBufferListPointer(abl) { memset(b.mData, 0, Int(b.mDataByteSize)) }; return noErr }
engine.attach(src); engine.connect(src, to: engine.mainMixerNode, format: fmt)
let clips: [(String, Int)] = [("nr2-shot",6),("nr2-kill",4),("nr2-lock",2),("nr2-tick0",2),("nr2-tick1",2),("nr2-tick2",2),("nr2-tick3",2),("nr2-warn",1),("nr2-boom2",4),("nr2-bigboom",2),("nr2-boost",1),("nr2-dive",1),("nr2-roll",1),("nr2-overdrive",1),("nr2-crate",1)]
var shot: AVAudioPlayerNode?
let shotBuf = load("nr2-shot")
for (n, v) in clips { let b = load(n); for _ in 0..<v { let p = AVAudioPlayerNode(); engine.attach(p); engine.connect(p, to: engine.mainMixerNode, format: b.format); if n == "nr2-shot" && shot == nil { shot = p } } }
var beds: [AVAudioPlayerNode] = []
if variant == "b18" {
  for n in ["nr2-bedA","nr2-bedB","nr2-bedC"] { let b = load(n); for _ in 0..<2 { let p = AVAudioPlayerNode(); let s = AVAudioUnitVarispeed(); engine.attach(p); engine.attach(s); engine.connect(p, to: s, format: b.format); engine.connect(s, to: engine.mainMixerNode, format: b.format); beds.append(p) } }
}
print("mixer inputs used:", engine.mainMixerNode.numberOfInputs, "next bus:", engine.mainMixerNode.nextAvailableInputBus)
do { try engine.start(); print("START OK") } catch { print("START FAILED:", error) ; exit(0) }
shot!.scheduleBuffer(shotBuf, at: nil); shot!.play()
let out = AVAudioPCMBuffer(pcmFormat: fmt, frameCapacity: 4096)!
var peak: Float = 0
for _ in 0..<10 { let st = try! engine.renderOffline(4096, to: out); if st != .success { print("render", st.rawValue) }
  for c in 0..<2 { let p = out.floatChannelData![c]; for i in 0..<Int(out.frameLength) { peak = max(peak, abs(p[i])) } } }
print("SHOT PEAK:", peak)
