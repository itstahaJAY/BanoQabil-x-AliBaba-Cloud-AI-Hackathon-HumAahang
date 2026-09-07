import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Platform, View } from 'react-native';
import { AppProvider, useApp } from '../src/store';
import { colors } from '../src/theme';
import { NavigationFocus } from '../src/navigation';
import { LocaleView } from '../src/localized-ui';
import { NavigationGestures } from '../src/navigation-gestures';
export default function RootLayout(){return <AppProvider><AppShell/></AppProvider>}
function AppShell() {
  const { ready } = useApp();
  // Do not flash English screens or seed demo messages before the saved locale is read.
  return <><StatusBar style="dark"/><LocaleView style={{flex:1,backgroundColor:Platform.OS==='web'?'#F1EFF8':colors.cream}}><View style={{flex:1,width:'100%',maxWidth:Platform.OS==='web'?430:undefined,alignSelf:'center',boxShadow:Platform.OS==='web'?'0 0 52px rgba(70,52,135,.12)':undefined}}>{ready ? <NavigationFocus><View style={{ flex: 1, minHeight: 0 }}><View style={{ flex: 1 }}><Stack screenOptions={{headerShown:false,contentStyle:{backgroundColor:colors.cream},animation:'slide_from_right'}}/></View><NavigationGestures/></View></NavigationFocus> : <View style={{flex:1,justifyContent:'center'}}><ActivityIndicator color={colors.primary}/></View>}</View></LocaleView></>;
}
