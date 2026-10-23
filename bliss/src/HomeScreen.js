import { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

export default function HomeScreen({ modes, onOpen }) {
  const scheme = useColorScheme();
  const theme = scheme === 'dark' ? themes.dark : themes.light;
  const insets = useSafeAreaInsets();
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
    <ScrollView
      style={{ backgroundColor: theme.bg }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
    >
      <View style={styles.hero}>
        <Animated.View
          pointerEvents="none"
          style={[styles.glow, { backgroundColor: theme.glow, opacity, transform: [{ scale }] }]}
        >
          <View style={[styles.core, { backgroundColor: theme.core }]} />
        </Animated.View>
        <Text style={[styles.title, { color: theme.fg }]}>Bliss</Text>
      </View>

      <View style={styles.cards}>
        {modes.map((mode) => (
          <Pressable
            key={mode.key}
            onPress={() => onOpen(mode.key)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.card, { backgroundColor: theme.card, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={[styles.cardTitle, { color: theme.cardFg }]}>{mode.title}</Text>
            <Text style={[styles.cardBody, { color: theme.cardMuted }]}>{mode.body}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 32,
  },
  hero: {
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    alignItems: 'center',
    justifyContent: 'center',
  },
  core: {
    width: 110,
    height: 110,
    borderRadius: 55,
    opacity: 0.35,
  },
  title: {
    fontFamily: 'serif',
    fontSize: 72,
    letterSpacing: 3,
  },
  cards: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: 12,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 22,
    gap: 4,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: '600',
  },
  cardBody: {
    fontSize: 15,
  },
});
