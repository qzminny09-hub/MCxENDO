import { useEffect, useState } from 'react';
import { BackHandler, useColorScheme } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import HomeScreen from './src/HomeScreen';
import ClothScreen from './src/ClothScreen';

export default function App() {
  const scheme = useColorScheme();
  const [screen, setScreen] = useState('home');

  useEffect(() => {
    if (screen === 'home') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setScreen('home');
      return true;
    });
    return () => sub.remove();
  }, [screen]);

  return (
    <SafeAreaProvider>
      {screen === 'cloth' ? (
        <ClothScreen onBack={() => setScreen('home')} />
      ) : (
        <HomeScreen onOpenCloth={() => setScreen('cloth')} />
      )}
      <StatusBar style={screen === 'cloth' || scheme === 'dark' ? 'light' : 'dark'} />
    </SafeAreaProvider>
  );
}
