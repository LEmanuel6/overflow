import ExpoModulesCore
import AVFoundation

// AVAudioPlayer, not expo-audio's AVPlayer-backed AudioPlayer — AVPlayer is
// built for streaming/long-form playback, and a pool of 30+ instances of it
// meant each one's underlying output path only actually opened on its OWN
// first real play() call, well after isLoaded/readyToPlay had already
// fired. That's what caused "random sound missing right after launch" even
// with every pool preloaded. AVAudioPlayer is Apple's own lightweight class
// for exactly this (short, cached, one-shot SFX); prepareToPlay() during
// loadSound() actually primes its audio buffers up front, so there's no
// leftover "first play" tax for play() to pay later.
public class ExpoGameSfxModule: Module {
  // Small pool per key, round-robined — lets a fast chain reaction's bursts
  // (or two whoosh sweeps a beat apart) overlap instead of the newest play()
  // cutting off one still in flight.
  private let poolSize = 4
  private var pools: [String: [AVAudioPlayer]] = [:]
  private var nextIndex: [String: Int] = [:]

  public func definition() -> ModuleDefinition {
    Name("ExpoGameSfx")

    AsyncFunction("loadSound") { (key: String, uri: String, promise: Promise) in
      let url = uri.hasPrefix("file://") ? URL(fileURLWithPath: String(uri.dropFirst(7))) : URL(fileURLWithPath: uri)
      do {
        var players: [AVAudioPlayer] = []
        for _ in 0..<self.poolSize {
          let player = try AVAudioPlayer(contentsOf: url)
          player.prepareToPlay()
          players.append(player)
        }
        self.pools[key] = players
        self.nextIndex[key] = 0
        promise.resolve(nil)
      } catch {
        promise.reject("ERR_SFX_LOAD", "Failed to load sound '\(key)': \(error.localizedDescription)")
      }
    }

    // Fire-and-forget by design, same as the rest of this app's SFX calls —
    // a single play missing shouldn't affect gameplay, so this never throws.
    Function("play") { (key: String) in
      guard let players = self.pools[key], !players.isEmpty else { return }
      let i = self.nextIndex[key] ?? 0
      self.nextIndex[key] = (i + 1) % players.count
      let player = players[i]
      player.currentTime = 0
      player.play()
    }

    OnDestroy {
      self.pools.removeAll()
      self.nextIndex.removeAll()
    }
  }
}
