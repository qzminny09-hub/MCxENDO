import { useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';

const themes = {
  light: { bg: '#EEF2EE', fg: '#1F2E2A', muted: '#5D6F69', glow: '#B9D8CF', core: '#6FA89A' },
  dark: { bg: '#111917', fg: '#E4ECE8', muted: '#8FA39C', glow: '#2A4A42', core: '#3F7366' },
};

export default function App() {
  const scheme = useColorScheme();
  const theme = scheme === 'dark' ? themes.dark : themes.light;
  const breath = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let loop;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(breath, { toValue: 1, duration: 4000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(breath, { toValue: 0, duration: 4000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      );
      loop.start();
    });
    return () => loop?.stop();
  }, [breath]);

  const scale = breath.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.04] });
  const opacity = breath.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] });

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <Animated.View
        pointerEvents="none"
        style={[styles.glow, { backgroundColor: theme.glow, opacity, transform: [{ scale }] }]}
      >
        <View style={[styles.core, { backgroundColor: theme.core }]} />
      </Animated.View>
      <View style={styles.brand}>
        <Text style={[styles.title, { color: theme.fg }]}>Bliss</Text>
        <Text style={[styles.tagline, { color: theme.muted }]}>A BLANK APP, READY TO GROW</Text>
      </View>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  glow: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    alignItems: 'center',
    justifyContent: 'center',
  },
  core: {
    width: 150,
    height: 150,
    borderRadius: 75,
    opacity: 0.35,
  },
  brand: {
    alignItems: 'center',
    gap: 14,
  },
  title: {
    fontFamily: 'serif',
    fontSize: 84,
    letterSpacing: 3,
  },
  tagline: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 2.2,
  },
});
