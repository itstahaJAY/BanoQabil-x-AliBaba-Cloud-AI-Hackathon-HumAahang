import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useApp } from '../src/store';
import { colors } from '../src/theme';
export default function Index(){const {ready,onboarded}=useApp();if(!ready)return <View style={{flex:1,alignItems:'center',justifyContent:'center'}}><ActivityIndicator color={colors.emerald}/></View>;return <Redirect href={onboarded?'/(tabs)':'/onboarding'}/>}
