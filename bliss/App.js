import { useEffect, useState } from 'react';
import { BackHandler, useColorScheme } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import HomeScreen from './src/HomeScreen';
import SimScreen from './src/SimScreen';
import clothHtml from './src/sims/cloth';
import waterHtml from './src/sims/water';
import sandHtml from './src/sims/sand';
import jellyHtml from './src/sims/jelly';
import fireworksHtml from './src/sims/fireworks';
import planetsHtml from './src/sims/planets';
import inkHtml from './src/sims/ink';
import ragdollHtml from './src/sims/ragdoll';
import glassHtml from './src/sims/glass';
import marblesHtml from './src/sims/marbles';

const MODES = [
  { key: 'cloth', title: 'Denim', body: 'Pull, cut, burn and pin it.', html: clothHtml },
  { key: 'water', title: 'Water', body: 'Pour, stir, tilt to slosh.', html: waterHtml },
  { key: 'sand', title: 'Sand', body: 'Pour grains, build walls.', html: sandHtml },
  { key: 'jelly', title: 'Jelly', body: 'Squish, stretch and throw.', html: jellyHtml },
  { key: 'fireworks', title: 'Fireworks', body: 'Tap the sky to launch.', html: fireworksHtml },
  { key: 'planets', title: 'Planets', body: 'Slingshot into orbit.', html: planetsHtml },
  { key: 'ink', title: 'Ink', body: 'Swirl colour through liquid.', html: inkHtml },
  { key: 'ragdoll', title: 'Ragdoll', body: 'Fling floppy figures around.', html: ragdollHtml },
  { key: 'glass', title: 'Glass', body: 'Crack and smash a window.', html: glassHtml },
  { key: 'marbles', title: 'Marbles', body: 'Drop marbles through pins.', html: marblesHtml },
];

export default function App() {
  const scheme = useColorScheme();
  const [screen, setScreen] = useState('home');
  const mode = MODES.find((m) => m.key === screen);

  useEffect(() => {
    if (!mode) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setScreen('home');
      return true;
    });
    return () => sub.remove();
  }, [mode]);

  return (
    <SafeAreaProvider>
      {mode ? (
        <SimScreen key={mode.key} html={mode.html} onBack={() => setScreen('home')} />
      ) : (
        <HomeScreen modes={MODES} onOpen={setScreen} />
      )}
      <StatusBar style={mode || scheme === 'dark' ? 'light' : 'dark'} />
    </SafeAreaProvider>
  );
}
