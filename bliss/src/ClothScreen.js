import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import clothHtml from './cloth/clothHtml';

const BACKGROUND = '#111917';

export default function ClothScreen({ onBack }) {
  const insets = useSafeAreaInsets();

  const onMessage = (event) => {
    let message;
    try {
      message = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (message.type === 'back') onBack();
    if (message.type === 'tear') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right },
      ]}
    >
      <WebView
        source={{ html: clothHtml }}
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
