import { Pressable, Text, SafeAreaView, Ionicons, useLocale } from '../../src/localized-ui';

import { LinearGradient } from 'expo-linear-gradient';

import { router } from '../../src/navigation';
import { useEffect } from 'react';
import { Image, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, FadeIn, FadeInDown, FadeInRight, FadeInUp, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { PressScale } from '../../src/components';
import { useApp } from '../../src/store';
import { colors, radius, shadow, shadowStrong, space } from '../../src/theme';
import { personas } from '../../src/types';

const modes = [
  { title: 'Face-to-face', detail: 'One phone · Two people', progress: .72, icon: 'people', tint: colors.pastelPurple, route: '/conversation?partner=hearing&face=1' },
  { title: 'Live captions', detail: 'English + Urdu', progress: .46, icon: 'mic', tint: colors.pastelBlue, route: '/transcription' },
  { title: 'Sign Assistant', detail: 'Practice mode · Beta', progress: .28, icon: 'hand-left', tint: colors.pastelPink, route: '/sign-assistant' },
] as const;

const actions = [
  { label: 'Quick Speak', icon: 'volume-high', tint: colors.pastelPurple, color: colors.primary, route: '/quick-speak' },
  { label: 'AI Vision', icon: 'scan', tint: colors.pastelBlue, color: '#2E8DBA', route: '/vision' },
  { label: 'Passport', icon: 'qr-code', tint: colors.pastelGreen, color: '#31996D', route: '/passport' },
  { label: 'Emergency', icon: 'medical', tint: colors.pastelPink, color: colors.red, route: '/emergency' },
] as const;

function HeroCharacter() {
  const reduced = useReducedMotion();
  const y = useSharedValue(5);
  const angle = useSharedValue(-1);
  useEffect(() => {
    cancelAnimation(y);
    cancelAnimation(angle);
    if (reduced) { y.value = 0; angle.value = 0; return; }
    y.value = withDelay(650, withRepeat(withSequence(withTiming(0, { duration: 1800, easing: Easing.inOut(Easing.sin) }), withTiming(5, { duration: 1800, easing: Easing.inOut(Easing.sin) })), -1, true));
    angle.value = withDelay(650, withRepeat(withSequence(withTiming(1, { duration: 2300, easing: Easing.inOut(Easing.sin) }), withTiming(-1, { duration: 2300, easing: Easing.inOut(Easing.sin) })), -1, true));
    return () => { cancelAnimation(y); cancelAnimation(angle); };
  }, [reduced, y, angle]);
  const motion = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }, { rotate: `${angle.value}deg` }] }));
  return <Animated.View entering={reduced ? undefined : FadeInRight.delay(210).springify().damping(17)} style={s.characterWrap}><Animated.View style={[{ flex: 1 }, motion]}><View style={s.speech}><View style={s.onlineDot}/><Text style={s.speechText}>Ready to connect</Text></View><Image source={require('../../assets/illustrations/home-character.png')} resizeMode="contain" style={s.character}/></Animated.View></Animated.View>;
}

function HeroProgress() {
  const reduced = useReducedMotion();
  const scale = useSharedValue(reduced ? .72 : 0);
  useEffect(() => { scale.value = reduced ? .72 : withDelay(360, withSpring(.72, { damping: 18, stiffness: 95 })); }, [reduced]);
  const motion = useAnimatedStyle(() => ({ transform: [{ scaleX: scale.value }] }));
  return <View style={s.heroProgress}><Animated.View style={[s.heroProgressFill,motion]}/></View>;
}

export default function Home() {
  const { persona, passport } = useApp();
  const { t } = useLocale();
  return <SafeAreaView style={s.safe} edges={['top']}>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
      <Animated.View entering={FadeIn.duration(350)} style={s.top}>
        <View style={s.brand}><View style={s.brandMark}><Ionicons name="pulse" size={18} color={colors.surface}/></View><Text style={s.brandText}>Hum Ahang</Text></View>
        <PressScale label="Open settings" onPress={()=>router.push('/settings')} style={s.settingsButton}><Ionicons name="options-outline" size={21} color={colors.ink}/></PressScale>
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(50).duration(420)}><Text verbatim style={s.hello}>{passport.name ? t('Hello, {name}!', { name: passport.name }) : t('Hello there!')}</Text><Text style={s.sub}>How would you like to communicate today?</Text></Animated.View>
      <Animated.View entering={FadeInUp.delay(110).duration(500)}>
        <PressScale label="Continue adaptive conversation" onPress={() => router.push('/partner')} style={s.heroWrap}>
          <LinearGradient {...(Platform.OS === 'web' ? { dir: 'ltr' } : {})} colors={['#8063F7', '#6948ED']} start={{x:0,y:0}} end={{x:1,y:1}} style={s.hero}>
            <View style={s.heroBubbleOne}/><View style={s.heroBubbleTwo}/>
            <View style={s.heroCopy}><Text style={s.heroKicker}>Continue your last session</Text><Text style={s.heroTitle}>Adaptive conversation</Text><View style={s.progressRow}><HeroProgress/><Text style={s.heroPercent}>72%</Text></View><View style={s.heroButton}><Text style={s.heroButtonText}>Continue</Text><View style={s.heroArrow}><Ionicons name="arrow-forward" size={15} color={colors.surface}/></View></View></View>
            <HeroCharacter/>
          </LinearGradient>
        </PressScale>
      </Animated.View>
      <View style={s.sectionRow}><Text style={s.section}>Communication modes</Text><Pressable onPress={() => router.push('/(tabs)/communicate')} hitSlop={10}><Text style={s.viewAll}>View all</Text></Pressable></View>
      <View style={s.modeList}>{modes.map((mode, index) => <Animated.View key={mode.title} entering={FadeInDown.delay(150 + index * 45).springify().damping(20)}><PressScale label={t('Open {name}', { name: t(mode.title) })} onPress={() => router.push(mode.route as any)} style={s.modeCard}><View style={[s.modeIcon,{backgroundColor:mode.tint}]}><View style={s.iconHighlight}/><Ionicons name={mode.icon} size={23} color={index===0?colors.primary:index===1?'#248DBB':'#E65A84'}/></View><View style={s.modeInfo}><Text style={s.modeTitle}>{mode.title}</Text><Text style={s.modeDetail}>{mode.detail}</Text><View style={s.modeProgress}><View style={[s.modeProgressFill,{width:`${mode.progress*100}%`}]} /></View></View><View style={s.chevron}><Ionicons name="chevron-forward" size={16} color="#9794A4"/></View></PressScale></Animated.View>)}</View>
      <View style={s.sectionRow}><Text style={s.section}>Today’s goal</Text><Pressable hitSlop={10}><Text style={s.viewAll}>Edit goal</Text></Pressable></View>
      <Animated.View entering={FadeInDown.delay(340).duration(420)} style={s.goalCard}><View style={s.goalIcon}><Ionicons name="chatbubbles" size={23} color={colors.primary}/></View><View style={s.goalInfo}><Text style={s.goalTitle}>Complete one conversation</Text><Text style={s.goalMeta}>1 of 2 activities</Text><View style={s.goalProgress}><View style={s.goalProgressFill}/></View></View><View style={s.gift}><Ionicons name="gift" size={25} color="#F2A93B"/></View></Animated.View>
      <View style={s.quickHeading}><Text style={s.section}>Quick actions</Text><Text style={s.quickSub}>{personas[persona].title}</Text></View>
      <View style={s.quickRow}>{actions.map((item,index)=><Animated.View key={item.label} entering={FadeInDown.delay(400+index*45).springify().damping(19)} style={s.quickItem}><PressScale label={item.label} onPress={()=>router.push(item.route as any)} style={[s.quickIcon,{backgroundColor:item.tint}]}><View style={s.quickShine}/><Ionicons name={item.icon} size={23} color={item.color}/></PressScale><Text style={s.quickLabel}>{item.label}</Text></Animated.View>)}</View>
    </ScrollView>
  </SafeAreaView>;
}

const s=StyleSheet.create({
  safe:{flex:1,backgroundColor:colors.cream},content:{paddingHorizontal:space.lg,paddingTop:4,paddingBottom:28},top:{height:46,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},brand:{flexDirection:'row',alignItems:'center',gap:9},brandMark:{width:32,height:32,borderRadius:11,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',...shadow},brandText:{fontSize:15,fontWeight:'700',letterSpacing:-.2,color:colors.ink},settingsButton:{width:42,height:42,borderRadius:15,backgroundColor:colors.surface,alignItems:'center',justifyContent:'center',...shadow},
  hello:{fontSize:25,lineHeight:31,fontWeight:'700',letterSpacing:-.65,color:colors.ink,marginTop:8},sub:{fontSize:13,lineHeight:19,color:colors.muted,marginTop:2,marginBottom:16},heroWrap:{borderRadius:radius.hero,...shadowStrong},hero:{...Platform.select({ native: { direction: 'ltr' as const } }),minHeight:218,borderRadius:radius.hero,overflow:'hidden',padding:18},heroBubbleOne:{position:'absolute',width:130,height:130,borderRadius:65,right:-38,top:-45,backgroundColor:'#FFFFFF12'},heroBubbleTwo:{position:'absolute',width:90,height:90,borderRadius:45,right:65,bottom:-44,backgroundColor:'#FFFFFF0D'},heroCopy:{width:'59%',zIndex:2},heroKicker:{fontSize:10,fontWeight:'600',letterSpacing:.1,color:'#F2EFFF'},heroTitle:{fontSize:24,lineHeight:28,fontWeight:'700',letterSpacing:-.5,color:colors.surface,marginTop:7},progressRow:{flexDirection:'row',alignItems:'center',gap:7,marginTop:13},heroProgress:{height:5,width:108,borderRadius:3,backgroundColor:'#FFFFFF42',overflow:'hidden'},heroProgressFill:{width:'100%',height:'100%',borderRadius:3,backgroundColor:colors.surface,transformOrigin:'left'},heroPercent:{fontSize:10,fontWeight:'600',color:colors.surface},heroButton:{marginTop:14,height:40,width:126,paddingLeft:14,paddingRight:7,borderRadius:13,backgroundColor:colors.surface,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},heroButtonText:{fontSize:12,fontWeight:'700',color:colors.primaryDark},heroArrow:{width:26,height:26,borderRadius:13,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'},characterWrap:{position:'absolute',right:-12,bottom:-7,width:181,height:216},character:{position:'absolute',right:-12,bottom:-8,width:198,height:198},speech:{position:'absolute',right:14,top:6,zIndex:2,backgroundColor:'#FFFFFFE8',paddingHorizontal:9,paddingVertical:7,borderRadius:15,flexDirection:'row',alignItems:'center',gap:5,...shadow},onlineDot:{width:6,height:6,borderRadius:3,backgroundColor:'#38B982'},speechText:{fontSize:9,fontWeight:'700',color:colors.primaryDark},
  sectionRow:{marginTop:24,marginBottom:10,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},section:{fontSize:17,fontWeight:'700',letterSpacing:-.35,color:colors.ink},viewAll:{fontSize:12,fontWeight:'600',color:colors.primary},modeList:{gap:9},modeCard:{minHeight:78,paddingVertical:10,borderRadius:18,backgroundColor:colors.surface,paddingHorizontal:11,flexDirection:'row',alignItems:'center',gap:11,...shadow},modeIcon:{width:46,height:46,borderRadius:14,alignItems:'center',justifyContent:'center',overflow:'hidden'},iconHighlight:{position:'absolute',width:34,height:20,borderRadius:20,backgroundColor:'#FFFFFF8F',top:-5,right:-5,transform:[{rotate:'-18deg'}]},modeInfo:{flex:1},modeTitle:{fontSize:14,fontWeight:'700',color:colors.ink},modeDetail:{fontSize:11,color:colors.muted,marginTop:2},modeProgress:{height:4,borderRadius:2,backgroundColor:'#EFEEF4',overflow:'hidden',marginTop:6,width:'88%'},modeProgressFill:{height:'100%',borderRadius:2,backgroundColor:colors.primary},chevron:{width:28,height:28,borderRadius:10,backgroundColor:'#F8F7FB',alignItems:'center',justifyContent:'center'},
  goalCard:{minHeight:78,paddingVertical:10,borderRadius:18,backgroundColor:colors.surface,paddingHorizontal:11,flexDirection:'row',alignItems:'center',gap:11,...shadow},goalIcon:{width:45,height:45,borderRadius:14,backgroundColor:colors.primaryLight,alignItems:'center',justifyContent:'center'},goalInfo:{flex:1},goalTitle:{fontSize:13,fontWeight:'700',color:colors.ink},goalMeta:{fontSize:10,color:colors.muted,marginTop:2},goalProgress:{height:4,borderRadius:2,backgroundColor:'#EFEEF4',marginTop:6,overflow:'hidden'},goalProgressFill:{height:'100%',width:'50%',borderRadius:2,backgroundColor:colors.primary},gift:{width:42,height:42,borderRadius:14,backgroundColor:colors.pastelYellow,alignItems:'center',justifyContent:'center'},quickHeading:{gap:8,flexWrap:'wrap',marginTop:24,marginBottom:11,flexDirection:'row',alignItems:'baseline',justifyContent:'space-between'},quickSub:{fontSize:10,color:colors.muted},quickRow:{flexDirection:'row',justifyContent:'space-between'},quickItem:{width:'23%',alignItems:'center'},quickIcon:{width:54,height:54,borderRadius:17,alignItems:'center',justifyContent:'center',overflow:'hidden',...shadow},quickShine:{position:'absolute',width:42,height:20,borderRadius:20,backgroundColor:'#FFFFFF8A',top:-6,right:-8,transform:[{rotate:'-20deg'}]},quickLabel:{textAlign:'center',fontSize:10,fontWeight:'600',color:colors.ink,marginTop:7,maxWidth:'100%'},
});
