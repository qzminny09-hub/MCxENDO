import { useEffect, useState } from 'react';
import { BackHandler, useColorScheme } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import HomeScreen from './src/HomeScreen';
import SimScreen from './src/SimScreen';
import clothHtml from './src/sims/cloth';
import waterHtml from './src/sims/water';
import sandHtml from './src/sims/sand';

const MODES = [
  { key: 'cloth', title: 'Cloth', body: 'Pull it, stretch it, rip it apart.', html: clothHtml },
  { key: 'water', title: 'Water', body: 'Pour, stir and tilt your phone to slosh it.', html: waterHtml },
  { key: 'sand', title: 'Sand', body: 'Pour grains, build walls, watch it pile up.', html: sandHtml },
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
