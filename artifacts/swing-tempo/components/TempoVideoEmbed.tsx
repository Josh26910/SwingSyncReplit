import React from "react";
import { StyleSheet, View } from "react-native";
import YoutubePlayer from "react-native-youtube-iframe";

interface TempoVideoEmbedProps {
  youtubeId: string;
  clipStartSec?: number | null;
  clipEndSec?: number | null;
}

// Native only — react-native-youtube-iframe's web build pulls in
// react-native-web-webview (not installed, and not something we want to
// depend on), so this file must never be imported by the web bundle. See
// TempoVideoEmbed.web.tsx for the web fallback; Metro picks whichever
// matches the target platform via the .web.tsx suffix.
export default function TempoVideoEmbed({ youtubeId, clipStartSec, clipEndSec }: TempoVideoEmbedProps) {
  return (
    <View style={styles.wrap}>
      <YoutubePlayer
        height={200}
        videoId={youtubeId}
        initialPlayerParams={{
          start: clipStartSec ? Math.round(clipStartSec) : undefined,
          end: clipEndSec ? Math.round(clipEndSec) : undefined,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 14, overflow: "hidden", marginBottom: 24 },
});
