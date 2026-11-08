package expo.modules.gamesfx

import android.media.AudioAttributes
import android.media.SoundPool
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import java.util.concurrent.ConcurrentHashMap

// SoundPool, not expo-audio's ExoPlayer-backed AudioPlayer, because this is
// exactly the case SoundPool is for: a handful of short one-shot SFX that
// need to overlap cleanly and play with no perceptible trigger latency.
// ExoPlayer is a full streaming media pipeline — building 30+ instances of
// it for burst/tap/whoosh variants meant each one's native output stream
// only actually opened on its OWN first real play() (isLoaded/STATE_READY
// only confirms decode, not that), which is what caused "random sound
// missing right after launch" even with every pool fully preloaded. A single
// SoundPool loads every clip once and plays them all from one pre-warmed
// native stream, so there's no per-sound "first play" tax to pay.
class ExpoGameSfxModule : Module() {
  private var pool: SoundPool? = null

  // key -> SoundPool sample id, and the reverse set of ids still waiting on
  // their onLoadComplete callback so loadSound's promise can resolve/reject
  // at the right time instead of guessing with a delay.
  private val soundIds = ConcurrentHashMap<String, Int>()
  private val pendingLoads = ConcurrentHashMap<Int, Promise>()

  private fun ensurePool(): SoundPool {
    pool?.let { return it }
    val attrs = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_GAME)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()
    // 16 concurrent streams is comfortably above anything this game's
    // tap/burst/whoosh sounds need at once, even during a big chain reaction.
    val created = SoundPool.Builder()
      .setMaxStreams(16)
      .setAudioAttributes(attrs)
      .build()
    created.setOnLoadCompleteListener { _, sampleId, status ->
      val promise = pendingLoads.remove(sampleId) ?: return@setOnLoadCompleteListener
      if (status == 0) {
        promise.resolve(null)
      } else {
        promise.reject("ERR_SFX_LOAD", "SoundPool failed to decode sound (status=$status)", null)
      }
    }
    pool = created
    return created
  }

  override fun definition() = ModuleDefinition {
    Name("ExpoGameSfx")

    // uri may be a plain path or a file:// URI — SoundPool.load(path, priority)
    // takes a filesystem path, so a file:// scheme (if present) is stripped.
    AsyncFunction("loadSound") { key: String, uri: String, promise: Promise ->
      try {
        val path = Uri.parse(uri).let { if (it.scheme != null) it.path ?: uri else uri }
        val id = ensurePool().load(path, 1)
        if (id == 0) {
          promise.reject("ERR_SFX_LOAD", "SoundPool rejected load for '$key'", null)
          return@AsyncFunction
        }
        soundIds[key] = id
        pendingLoads[id] = promise
      } catch (e: Exception) {
        promise.reject("ERR_SFX_LOAD", e.message ?: "unknown error loading '$key'", e)
      }
    }

    // Fire-and-forget by design, same as the rest of this app's SFX calls —
    // a single play missing shouldn't affect gameplay, so this never throws.
    Function("play") { key: String ->
      val id = soundIds[key] ?: return@Function
      pool?.play(id, 1f, 1f, 1, 0, 1f)
    }

    OnDestroy {
      pool?.release()
      pool = null
      soundIds.clear()
      pendingLoads.clear()
    }
  }
}
