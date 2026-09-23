import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";

/**
 * Whether the app may open the video picker.
 *
 * Android: launchImageLibraryAsync uses the system Photo Picker, which needs
 * no permission — and Google Play restricts READ_MEDIA_IMAGES/VIDEO to apps
 * whose core purpose is managing media, so those permissions are blocked in
 * app.json. Requesting them here would always come back denied.
 */
export async function canPickVideos(): Promise<boolean> {
  if (Platform.OS === "android") return true;
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return status === "granted";
}
