import { Ionicons, useLocale } from '../../src/localized-ui';

import { Tabs } from 'expo-router';
import { colors, sizes, tabShadow } from '../../src/theme';
const TabIcon=({name,color}:{name:any;color:any;focused:boolean})=><Ionicons name={name} size={21} color={color}/>;
export default function TabsLayout(){const { t } = useLocale(); return <Tabs screenOptions={{headerShown:false,tabBarActiveTintColor:colors.primary,tabBarInactiveTintColor:'#AAA9B4',tabBarStyle:{height:sizes.tabBar,paddingTop:8,paddingBottom:8,borderTopWidth:1,borderTopColor:colors.line,backgroundColor:colors.surface,...tabShadow},tabBarItemStyle:{paddingVertical:1},tabBarLabelStyle:{fontSize:10,fontWeight:'700',marginTop:2}}}>
 <Tabs.Screen name="index" options={{title:t('Home'),tabBarIcon:(p)=><TabIcon {...p} name={p.focused?'home':'home-outline'}/>}}/>
 <Tabs.Screen name="communicate" options={{title:t('Communicate'),tabBarIcon:(p)=><TabIcon {...p} name={p.focused?'chatbubbles':'chatbubbles-outline'}/>}}/>
 <Tabs.Screen name="assist" options={{title:t('Assist'),tabBarIcon:(p)=><TabIcon {...p} name={p.focused?'sparkles':'sparkles-outline'}/>}}/>
 <Tabs.Screen name="profile" options={{title:t('Profile'),tabBarIcon:(p)=><TabIcon {...p} name={p.focused?'person':'person-outline'}/>}}/>
 </Tabs>}
