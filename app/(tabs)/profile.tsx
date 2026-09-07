import { Pressable, Text, SafeAreaView, Ionicons, useLocale } from '../../src/localized-ui';

import { LinearGradient } from 'expo-linear-gradient';

import { router } from '../../src/navigation';
import { Image, ScrollView, StyleSheet, View } from 'react-native';

import { PressScale } from '../../src/components';
import { useApp } from '../../src/store';
import { colors, radius, shadow, space } from '../../src/theme';
import { personas } from '../../src/types';

const rows=[
  {title:'Accessibility Passport',detail:'View your communication card',icon:'id-card-outline',tint:colors.pastelPurple,route:'/passport'},
  {title:'Saved phrases',detail:'8 phrases · 3 favourites',icon:'bookmark-outline',tint:colors.pastelBlue,route:'/quick-speak'},
  {title:'Settings',detail:'Passport details and accessibility',icon:'options-outline',tint:colors.pastelGreen,route:'/settings'},
] as const;

export default function Profile(){
  const app=useApp();
  const { t } = useLocale();
  return <SafeAreaView style={s.safe} edges={['top']}><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
    <View style={s.top}><View><Text style={s.eyebrow}>YOUR SPACE</Text><Text style={s.heading}>Profile</Text></View><PressScale label="Open settings" onPress={()=>router.push('/settings')} style={s.settings}><Ionicons name="settings-outline" size={21} color={colors.ink}/></PressScale></View>
    <LinearGradient colors={['#F1EDFF','#E7F8F0']} start={{x:0,y:0}} end={{x:1,y:1}} style={s.identity}>
      <View style={s.identityGlow}/><View style={s.avatar}><Image source={require('../../assets/illustrations/home-character.png')} style={s.avatarImage} resizeMode="cover"/></View>
      <View style={s.identityCopy}><Text verbatim style={s.name} numberOfLines={2}>{app.passport.name || t('Your profile')}</Text><Text style={s.meta}>{personas[app.persona].title}</Text><View style={s.language}><Ionicons name="language-outline" size={14} color={colors.primary}/><Text style={s.languageText}>{app.language}</Text></View></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Edit profile in Settings" onPress={()=>router.push('/settings')} hitSlop={10} style={s.edit}><Ionicons name="pencil" size={16} color={colors.primary}/></Pressable>
    </LinearGradient>
    <View style={s.stats}><View style={s.stat}><Text style={s.statValue}>8</Text><Text style={s.statLabel}>Phrases</Text></View><View style={s.divider}/><View style={s.stat}><Text style={s.statValue}>4</Text><Text style={s.statLabel}>Sessions</Text></View><View style={s.divider}/><View style={s.stat}><View style={s.privateValue}><View style={s.privateDot}/><Text style={s.statValueSmall}>On-device</Text></View><Text style={s.statLabel}>Privacy</Text></View></View>
    <View style={s.sectionRow}><Text style={s.section}>Personal tools</Text><Text style={s.sectionHint}>Stored locally</Text></View>
    <View style={s.panel}>{rows.map((item,index)=><PressScale key={item.title} label={item.title} onPress={()=>router.push(item.route as any)} style={[s.row,index<rows.length-1&&s.rowBorder]}><View style={[s.rowIcon,{backgroundColor:item.tint}]}><Ionicons name={item.icon} size={21} color={colors.primary}/></View><View style={s.rowCopy}><Text style={s.rowTitle}>{item.title}</Text><Text style={s.rowDetail}>{item.detail}</Text></View><Ionicons name="chevron-forward" size={17} color="#A4A1AE"/></PressScale>)}</View>
    <View style={s.privacy}><View style={s.privacyIcon}><Ionicons name="shield-checkmark" size={20} color="#299267"/></View><View style={{flex:1}}><Text style={s.privacyTitle}>You choose what to show</Text><Text style={s.privacyText}>Manage passport visibility in Settings. Saved details stay local until you share them.</Text></View></View>
    <PressScale label="Replay onboarding" onPress={()=>{app.reset();router.replace('/onboarding')}} style={s.replay}><Ionicons name="refresh-outline" size={18} color={colors.primary}/><Text style={s.replayText}>Replay onboarding</Text></PressScale>
  </ScrollView></SafeAreaView>;
}

const s=StyleSheet.create({
  safe:{flex:1,backgroundColor:colors.cream},content:{paddingHorizontal:space.lg,paddingTop:8,paddingBottom:32},top:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:18},eyebrow:{fontSize:10,fontWeight:'700',letterSpacing:1.3,color:colors.primary},heading:{fontSize:27,lineHeight:33,fontWeight:'700',letterSpacing:-.7,color:colors.ink,marginTop:2},settings:{width:44,height:44,borderRadius:15,alignItems:'center',justifyContent:'center',backgroundColor:colors.surface,...shadow},
  identity:{minHeight:142,borderRadius:24,padding:18,flexDirection:'row',alignItems:'center',overflow:'hidden'},identityGlow:{position:'absolute',width:150,height:150,borderRadius:75,right:-45,top:-70,backgroundColor:'#FFFFFF70'},avatar:{width:82,height:82,borderRadius:25,overflow:'hidden',backgroundColor:'#DCD3FF'},avatarImage:{width:125,height:125,marginLeft:-22,marginTop:0},identityCopy:{flex:1,marginStart:15},name:{fontSize:22,fontWeight:'700',letterSpacing:-.4,color:colors.ink},meta:{fontSize:12,color:colors.muted,marginTop:3},language:{alignSelf:'flex-start',minHeight:28,paddingHorizontal:9,borderRadius:14,backgroundColor:'#FFFFFFB5',flexDirection:'row',alignItems:'center',gap:5,marginTop:10},languageText:{fontSize:11,fontWeight:'600',color:colors.primaryDark},edit:{width:38,height:38,borderRadius:14,backgroundColor:'#FFFFFFC9',alignItems:'center',justifyContent:'center',alignSelf:'flex-start'},
  stats:{height:78,marginTop:12,borderRadius:20,backgroundColor:colors.surface,flexDirection:'row',alignItems:'center',...shadow},stat:{flex:1,alignItems:'center'},statValue:{fontSize:18,fontWeight:'700',color:colors.ink},statValueSmall:{fontSize:12,fontWeight:'700',color:colors.ink},statLabel:{fontSize:10,color:colors.muted,marginTop:3},divider:{width:1,height:30,backgroundColor:colors.line},privateValue:{height:22,flexDirection:'row',alignItems:'center',gap:5},privateDot:{width:7,height:7,borderRadius:4,backgroundColor:'#35B67D'},
  sectionRow:{flexDirection:'row',alignItems:'baseline',justifyContent:'space-between',marginTop:24,marginBottom:10},section:{fontSize:17,fontWeight:'700',letterSpacing:-.3,color:colors.ink},sectionHint:{fontSize:11,color:colors.muted},panel:{borderRadius:20,backgroundColor:colors.surface,paddingHorizontal:12,...shadow},row:{minHeight:72,flexDirection:'row',alignItems:'center',gap:11},rowBorder:{borderBottomWidth:1,borderBottomColor:colors.line},rowIcon:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center'},rowCopy:{flex:1},rowTitle:{fontSize:14,fontWeight:'600',color:colors.ink},rowDetail:{fontSize:11,color:colors.muted,marginTop:3},
  privacy:{minHeight:72,marginTop:14,padding:13,borderRadius:18,backgroundColor:colors.pastelGreen,flexDirection:'row',alignItems:'center',gap:11},privacyIcon:{width:42,height:42,borderRadius:14,backgroundColor:'#FFFFFFA8',alignItems:'center',justifyContent:'center'},privacyTitle:{fontSize:13,fontWeight:'700',color:'#205E49'},privacyText:{fontSize:11,lineHeight:16,color:'#4E7165',marginTop:2},replay:{height:48,marginTop:14,borderRadius:16,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},replayText:{fontSize:13,fontWeight:'600',color:colors.primary},
});
