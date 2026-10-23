import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Haptics from 'expo-haptics';
import { Accelerometer } from 'expo-sensors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const BACKGROUND = '#111917';

// Hosts one of the canvas simulations from ./sims and bridges it to the phone:
// back navigation, haptic taps, and accelerometer gravity while the page asks for tilt.
export default function SimScreen({ html, onBack }) {
  const insets = useSafeAreaInsets();
  const webview = useRef(null);
  const [tilt, setTilt] = useState(false);

  useEffect(() => {
    if (!tilt) return undefined;
    Accelerometer.setUpdateInterval(33);
    // Android reports the reaction to gravity, so screen-space gravity is (-x, +y).
    const sub = Accelerometer.addListener(({ x, y }) => {
      webview.current?.injectJavaScript(`window.onTilt && window.onTilt(${-x}, ${y}); true;`);
    });
    return () => sub.remove();
  }, [tilt]);

  const onMessage = (event) => {
    let message;
    try {
      message = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (message.type === 'back') onBack();
    if (message.type === 'buzz') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (message.type === 'tilt') setTilt(Boolean(message.on));
  };

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right },
      ]}
    >
      <WebView
        ref={webview}
        source={{ html }}
        originWhitelist={['*']}
        onMessage={onMessage}
        style={styles.web}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        setBuiltInZoomControls={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BACKGROUND,
  },
  web: {
    flex: 1,
    backgroundColor: BACKGROUND,
  },
});
