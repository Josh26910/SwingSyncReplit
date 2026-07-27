/**
 * Frame-capture thumbnails for imported swing videos. Native-only — there's
 * no cross-platform way to grab a video frame on web without a real
 * <video> element and canvas dance, and the payoff (a static thumbnail on
 * a swing card) doesn't justify that on the one platform used mainly for
 * development.
 */
import * as VideoThumbnails from "expo-video-thumbnails";
import { Platform } from "react-native";

export async function generateThumbnail(videoUri: string): Promise<string | null> {
  if (Platform.OS === "web") return null;
  try {
    const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, { time: 0 });
    return uri;
  } catch {
    return null;
  }
}
