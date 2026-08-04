import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

import type { Swing, SwingOrigin } from "@/context/SwingLibraryContext";

const KEY = "swingTempo:swingLibrary";

/**
 * Cap the library so storage can't grow without bound. Videos live on disk,
 * not in AsyncStorage — this only bounds the metadata index.
 */
const MAX_SWINGS_PER_ORIGIN = 100;

export interface StoredLibrary {
  swings: Swing[];
  proSwings: Swing[];
}

export const EMPTY_LIBRARY: StoredLibrary = { swings: [], proSwings: [] };

/**
 * Where imported clips are copied to. `ImagePicker` hands back a URI inside
 * the OS cache directory, which iOS and Android are both free to reclaim at
 * any time — so a swing imported today can have a dangling `uri` tomorrow
 * even with the metadata persisted correctly. Copying into the app's
 * document directory makes the file ours and as durable as the record
 * pointing at it.
 */
const VIDEO_DIR = `${FileSystem.documentDirectory ?? ""}swings/`;

async function ensureVideoDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(VIDEO_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(VIDEO_DIR, { intermediates: true });
  }
}

/**
 * Copies a picked clip into permanent app storage and returns the new URI.
 * Falls back to the original URI if anything goes wrong — a swing that
 * works for this session is better than a failed import. No-ops on web,
 * where there is no document directory and blob URLs can't be copied.
 */
export async function persistVideoFile(uri: string, swingId: string): Promise<string> {
  if (Platform.OS === "web" || !FileSystem.documentDirectory) return uri;
  try {
    await ensureVideoDir();
    const extension = uri.split("?")[0].split(".").pop()?.slice(0, 5) || "mov";
    const target = `${VIDEO_DIR}${swingId}.${extension}`;
    await FileSystem.copyAsync({ from: uri, to: target });
    return target;
  } catch {
    return uri;
  }
}

/** Best-effort removal of a clip we previously copied in. */
export async function deleteVideoFile(uri: string): Promise<void> {
  if (Platform.OS === "web" || !uri.startsWith(VIDEO_DIR)) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    /* ignore — a missing file is the desired end state anyway */
  }
}

export async function loadLibrary(): Promise<StoredLibrary> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return EMPTY_LIBRARY;
    const parsed = JSON.parse(raw) as Partial<StoredLibrary>;
    return {
      swings: Array.isArray(parsed.swings) ? parsed.swings : [],
      proSwings: Array.isArray(parsed.proSwings) ? parsed.proSwings : [],
    };
  } catch {
    return EMPTY_LIBRARY;
  }
}

export async function saveLibrary(library: StoredLibrary): Promise<void> {
  try {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({
        swings: library.swings.slice(0, MAX_SWINGS_PER_ORIGIN),
        proSwings: library.proSwings.slice(0, MAX_SWINGS_PER_ORIGIN),
      }),
    );
  } catch {
    /* ignore */
  }
}

export function originKey(origin: SwingOrigin): keyof StoredLibrary {
  return origin === "mine" ? "swings" : "proSwings";
}
