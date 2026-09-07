import { Text, SafeAreaView, Ionicons } from '../../src/localized-ui';


import { router } from '../../src/navigation';
import { ScrollView, StyleSheet, View } from 'react-native';

import { PressScale } from '../../src/components';
import { colors,shadow,space } from '../../src/theme';

const tools=[
  {title:'AI Vision',detail:'Understand the scene around you',icon:'scan-outline',tint:colors.pastelPurple,color:colors.primary,route:'/vision'},
  {title:'Live transcription',detail:'Turn nearby speech into text',icon:'mic-outline',tint:colors.pastelBlue,color:'#278DB8',route:'/transcription'},
  {title:'Quick Speak',detail:'Say a phrase with one tap',icon:'volume-high-outline',tint:colors.pastelYellow,color:'#D99022',route:'/quick-speak'},
  {title:'Accessibility passport',detail:'Share how to communicate with you',icon:'qr-code-outline',tint:colors.pastelGreen,color:'#279167',route:'/passport'},
] as const;

export default function Assist(){return <SafeAreaView style={s.safe} edges={['top']}><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
  <Text style={s.eyebrow}>ASSIST</Text><Text style={s.heading}>A little help, right when you need it.</Text><Text style={s.intro}>Focused tools for seeing, hearing and responding.</Text>
  <View style={s.grid}>{tools.map((tool,index)=><PressScale key={tool.title} label={tool.title} onPress={()=>router.push(tool.route as any)} style={[s.card,index===0&&s.featured]}><View style={[s.icon,{backgroundColor:tool.tint}]}><Ionicons name={tool.icon} size={index===0?29:24} color={tool.color}/></View><Text style={s.title}>{tool.title}</Text><Text style={s.detail}>{tool.detail}</Text><Ionicons name="arrow-up" size={17} color={tool.color} style={s.arrow}/></PressScale>)}</View>
  <Text style={s.section}>Safety and records</Text>
  <PressScale label="Open Emergency Mode" onPress={()=>router.push('/emergency')} style={s.emergency}><View style={s.emergencyIcon}><Ionicons name="medical-outline" size={22} color={colors.red}/></View><View style={{flex:1}}><Text style={s.emergencyTitle}>Emergency mode</Text><Text style={s.emergencyText}>Essential help, available locally</Text></View><Ionicons name="chevron-forward" size={18} color="#A29FAA"/></PressScale>
  <PressScale label="Open Conversation History" onPress={()=>router.push('/history')} style={s.history}><Ionicons name="time-outline" size={20} color={colors.primary}/><Text style={s.historyText}>Conversation history</Text><Text style={s.historyCount}>4 sessions</Text></PressScale>
</ScrollView></SafeAreaView>}

const s=StyleSheet.create({safe:{flex:1,backgroundColor:colors.cream},content:{padding:space.lg,paddingBottom:34},eyebrow:{fontSize:10,fontWeight:'700',letterSpacing:1.4,color:colors.primary},heading:{fontSize:28,lineHeight:34,fontWeight:'700',letterSpacing:-.8,color:colors.ink,marginTop:5,maxWidth:340},intro:{fontSize:13,lineHeight:19,color:colors.muted,marginTop:5,marginBottom:19},grid:{flexDirection:'row',flexWrap:'wrap',gap:11},card:{flexBasis:'45%',flexGrow:1,minWidth:0,minHeight:170,borderRadius:21,backgroundColor:colors.surface,padding:14,paddingBottom:40,...shadow},featured:{backgroundColor:'#F4F1FF'},icon:{width:48,height:48,borderRadius:16,alignItems:'center',justifyContent:'center'},title:{fontSize:14,fontWeight:'700',lineHeight:18,color:colors.ink,marginTop:14},detail:{fontSize:11,lineHeight:16,color:colors.muted,marginTop:4,paddingRight:8},arrow:{position:'absolute',right:14,bottom:14,transform:[{rotate:'45deg'}]},section:{fontSize:17,fontWeight:'700',color:colors.ink,marginTop:25,marginBottom:10},emergency:{minHeight:76,borderRadius:20,backgroundColor:colors.surface,padding:12,flexDirection:'row',alignItems:'center',gap:11,...shadow},emergencyIcon:{width:48,height:48,borderRadius:16,backgroundColor:colors.pastelPink,alignItems:'center',justifyContent:'center'},emergencyTitle:{fontSize:14,fontWeight:'700',color:colors.ink},emergencyText:{fontSize:11,color:colors.muted,marginTop:3},history:{minHeight:52,paddingVertical:10,marginTop:10,borderRadius:17,paddingHorizontal:14,backgroundColor:colors.surface,flexDirection:'row',alignItems:'center',gap:9},historyText:{fontSize:13,fontWeight:'600',color:colors.ink,flex:1},historyCount:{fontSize:11,color:colors.muted}});
