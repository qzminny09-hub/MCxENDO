import { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';

const themes = {
  light: {
    bg: '#EEF2EE', fg: '#1F2E2A', muted: '#5D6F69', glow: '#B9D8CF', core: '#6FA89A',
    card: '#1F2E2A', cardFg: '#EEF2EE', cardMuted: '#A9BDB6',
  },
  dark: {
    bg: '#111917', fg: '#E4ECE8', muted: '#8FA39C', glow: '#2A4A42', core: '#3F7366',
    card: '#E4ECE8', cardFg: '#111917', cardMuted: '#4A5C56',
  },
};

export default function HomeScreen({ onOpenCloth }) {
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
      <View style={styles.hero}>
        <Animated.View
          pointerEvents="none"
          style={[styles.glow, { backgroundColor: theme.glow, opacity, transform: [{ scale }] }]}
        >
          <View style={[styles.core, { backgroundColor: theme.core }]} />
        </Animated.View>
        <Text style={[styles.title, { color: theme.fg }]}>Bliss</Text>
      </View>

      <Pressable
        onPress={onOpenCloth}
        accessibilityRole="button"
        style={({ pressed }) => [styles.card, { backgroundColor: theme.card, opacity: pressed ? 0.85 : 1 }]}
      >
        <Text style={[styles.cardLabel, { color: theme.cardMuted }]}>SIMULATION</Text>
        <Text style={[styles.cardTitle, { color: theme.cardFg }]}>Cloth</Text>
        <Text style={[styles.cardBody, { color: theme.cardMuted }]}>Pull it, stretch it, rip it apart.</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 48,
  },
  hero: {
    width: 300,
    height: 300,
    alignItems: 'center',
    justifyContent: 'center',
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
  title: {
    fontFamily: 'serif',
    fontSize: 84,
    letterSpacing: 3,
  },
  card: {
    alignSelf: 'stretch',
    maxWidth: 420,
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 22,
    gap: 4,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.6,
  },
  cardTitle: {
    fontSize: 26,
    fontWeight: '600',
  },
  cardBody: {
    fontSize: 15,
  },
});
