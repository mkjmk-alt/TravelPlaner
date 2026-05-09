import { useEffect } from 'react';
import { useRouter, Stack, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_900Black } from '@expo-google-fonts/inter';
import { useAuth } from '../src/hooks/useAuth';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { user, loading: authLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_900Black,
  });

  useEffect(() => {
    // 폰트 로드 여부와 관계없이 5초 후에는 스플래시 화면을 숨김 (디버깅용)
    const timeout = setTimeout(() => {
      SplashScreen.hideAsync();
    }, 5000);

    if (fontsLoaded || fontError) {
      clearTimeout(timeout);
      SplashScreen.hideAsync();
    }
    return () => clearTimeout(timeout);
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    if (authLoading || !fontsLoaded) return;

    // 게스트 모드: 바로 지도(map) 탭으로 이동
    if (segments[0] !== '(tabs)') {
      router.replace('/(tabs)/map');
    }
  }, [authLoading, segments, fontsLoaded]);

  // 디버깅을 위해 로딩 중에도 null을 반환하지 않고 레이아웃을 렌더링합니다.
  // if ((!fontsLoaded && !fontError) || authLoading) {
  //   return null;
  // }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
