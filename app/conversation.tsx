import { Pressable, Text, TextInput, SafeAreaView, Ionicons, useLocale } from '../src/localized-ui';

import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { useLocalSearchParams } from 'expo-router';
import { router } from '../src/navigation';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, findNodeHandle, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { RecordingStatus } from '../src/recording-status';
import { FaceToFace } from '../src/face-to-face';
import { appendMessage, Message, Sender } from '../src/conversation-model';
import { getCommunicationConfig } from '../src/router';
import { useApp } from '../src/store';
import { colors } from '../src/theme';
import { Persona, personas } from '../src/types';
import { useSpeechInput } from '../src/use-speech-input';

const demos: Record<Persona, Message[]> = {
  deaf: [
    { id: 1, sender: 'partner', text: 'Hello! Which department do you need?' },
    { id: 2, sender: 'you', text: 'Computer Science Department.' },
  ],
  blind: [
    { id: 1, sender: 'you', text: 'Can I help you?' },
    { id: 2, sender: 'partner', text: 'Yes, please.' },
  ],
  mute: [
    { id: 1, sender: 'partner', text: 'Would you like me to type my response?' },
    { id: 2, sender: 'you', text: 'Yes, that would be easier.' },
  ],
  hearing: [
    { id: 1, sender: 'partner', text: 'Hello! How can I help?' },
    { id: 2, sender: 'you', text: 'Please speak toward the phone.' },
  ],
};

export default function Conversation() {
  const { ready } = useApp();
  return ready ? <ReadyConversation/> : <SafeAreaView><Text>Loading saved details…</Text></SafeAreaView>;
}
function ReadyConversation() {
  const { persona, prefs, language } = useApp();
  const { t } = useLocale();
  const params = useLocalSearchParams<{ partner?: string; face?: string }>();
  const partner: Persona = Object.prototype.hasOwnProperty.call(personas, params.partner || '')
    ? params.partner as Persona : 'hearing';
  const [face, setFace] = useState(params.face === '1');
  useEffect(() => setFace(params.face === '1'), [params.face]);
  const [activeSender, setActiveSender] = useState<Sender>('you');
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [showSessionDetails, setShowSessionDetails] = useState(false);
  const [drafts, setDrafts] = useState<Record<Sender, string>>({ you: '', partner: '' });
  const voice = useSpeechInput((owner, value) => setDrafts(previous => ({ ...previous, [owner]: value })));
  const recordingSender = voice.busy ? voice.owner : null;
  const [speechLocale, setSpeechLocale] = useState(language === 'English' ? 'en-US' : 'ur-PK');
  useEffect(() => { voice.cancel(); setSpeechLocale(language === 'English' ? 'en-US' : 'ur-PK'); }, [language, voice.cancel]);
  const toggleSpeechLocale = () => setSpeechLocale(previous => previous === 'en-US' ? 'ur-PK' : 'en-US');
  useEffect(() => { voice.cancel(); setShowQuickReplies(false); setShowSessionDetails(false); }, [face, voice.cancel]);
  const text = drafts[activeSender];
  const [messages, setMessages] = useState<Message[]>(() => demos[partner].map(message => ({ ...message, text: t(message.text) })));
  const transcript = useRef<ScrollView>(null);
  const firstQuickReply = useRef<View>(null);
  const config = useMemo(() => getCommunicationConfig(persona, partner), [persona, partner]);
  const partnerName = t(personas[partner].title);
  const senderLabel = t(activeSender === 'you' ? 'You' : 'Partner');
  const conversion = activeSender === 'you' ? config.preferredAtoBConversion : config.preferredBtoAConversion;
  const scrollToLatest = () => requestAnimationFrame(() => transcript.current?.scrollToEnd({ animated: false }));


  const send = (value: string, sender: Sender) => {
    if (!value.trim()) return;
    voice.clearFeedback();
    setMessages(previous => appendMessage(previous, sender, value));
    if (prefs.haptics) void Haptics.selectionAsync().catch(() => {});
  };
  const sendTyped = () => {
    send(text, activeSender);
    setDrafts(previous => ({ ...previous, [activeSender]: '' }));
  };
  const sendQuickReply = (reply: string) => {
    send(t(reply), activeSender);
  };
  useEffect(() => {
    if (!showQuickReplies) return;
    const frame = requestAnimationFrame(() => {
      if (Platform.OS === 'web') (firstQuickReply.current as unknown as HTMLElement | null)?.focus({ preventScroll: true });
      else {
        const tag = findNodeHandle(firstQuickReply.current);
        if (tag) AccessibilityInfo.setAccessibilityFocus(tag);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [showQuickReplies]);

  if (face) return <FaceToFace
    messages={messages} drafts={drafts}
    labels={{ you: personas[persona].title, partner: personas[partner].title }}
    onDraft={(sender, value) => setDrafts(previous => ({ ...previous, [sender]: value }))}
    onSend={send}
    onBack={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/communicate')}
    onChat={() => { setFace(false); router.setParams({ face: '0' }); }}
    voice={voice} speechLocale={speechLocale} onSpeechLocale={toggleSpeechLocale}
  />;

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1, minHeight: 0 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="End conversation" onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/communicate')} style={s.iconButton}>
            <Ionicons name="close" size={24} color={colors.ink} />
          </Pressable>
          <View style={{ flex: 1 }}><Text style={s.session}>LIVE CONVERSATION</Text><Text accessibilityRole="header" numberOfLines={1} style={s.headerTitle}>{t('You')} ↔ {partnerName}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Open face-to-face mode" onPress={() => { voice.cancel(); setFace(true); router.setParams({ face: '1' }); }} style={s.iconButton}>
            <Ionicons name="swap-vertical" size={23} color={colors.emerald} />
          </Pressable>
        </View>
        <View testID="conversation-controls" style={senderStyles.toolbar}>
          <View accessibilityLabel={t('Who’s sending? Switch when you pass the phone.')} style={senderStyles.options}>
            {(['you', 'partner'] as const).map(sender => <Pressable key={sender}
              accessibilityRole="button" accessibilityLabel={t('Select {name} as sender', { name: t(sender === 'you' ? 'You' : 'Partner') })}
              accessibilityState={{ selected: activeSender === sender, disabled: !!recordingSender }}
              disabled={!!recordingSender} onPress={() => setActiveSender(sender)}
              style={[senderStyles.option, activeSender === sender && senderStyles.selected]}>
              <Text style={[senderStyles.personLetter, activeSender === sender && senderStyles.selectedText]}>{sender === 'you' ? 'A' : 'B'}</Text>
              <Text numberOfLines={1} style={[senderStyles.label, activeSender === sender && senderStyles.selectedText]}>{t(sender === 'you' ? 'You' : 'Partner')}</Text>
            </Pressable>)}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={t('Speech language') + ': ' + t(speechLocale === 'ur-PK' ? 'Urdu' : 'English') + '. ' + t('Switch language')} accessibilityState={{ disabled: voice.busy }} disabled={voice.busy} onPress={toggleSpeechLocale} style={senderStyles.language}>
            <Ionicons name="language-outline" size={18} color={colors.primaryDark} />
            <Text numberOfLines={1} style={senderStyles.languageText}>{speechLocale === 'ur-PK' ? 'اردو' : 'EN'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={showSessionDetails ? 'Hide conversation details' : 'Show conversation details'} aria-expanded={showSessionDetails} accessibilityState={{ expanded: showSessionDetails }} onPress={() => { setShowQuickReplies(false); setShowSessionDetails(value => !value); }} style={[senderStyles.detailsButton, showSessionDetails && senderStyles.detailsButtonActive]}>
            <Ionicons name={showSessionDetails ? 'close' : 'information-circle-outline'} size={21} color={colors.primaryDark} />
          </Pressable>
        </View>
        {showSessionDetails && <View style={s.details}>
          <View style={s.detailRow}><Ionicons name="sparkles" size={15} color={colors.emerald} /><Text style={s.detailText}>{senderLabel} → {t(activeSender === 'you' ? 'Partner' : 'You')} · {t('Suggested')}: {t(conversion)}</Text></View>
          <Text style={s.detailHint}>{recordingSender ? 'Finish or cancel voice input before switching people' : 'Switch A/B when you pass the phone.'}</Text>
          <Text style={s.detailHint}>Device speech may process audio online.</Text>
        </View>}
        <ScrollView testID="conversation-transcript" ref={transcript} style={s.transcript} contentContainerStyle={s.messages} keyboardShouldPersistTaps="handled" onLayout={scrollToLatest} onContentSizeChange={scrollToLatest}>
          {messages.map((message, index) => {
            const own = message.sender === 'you';
            return <View key={message.id} testID={'message-' + message.id} accessibilityLiveRegion={index === messages.length - 1 ? 'polite' : 'none'} style={[s.bubble, own ? s.outgoing : s.incoming]}>
              <Text style={[s.speaker, own && { color: colors.surface }]}>{own ? t('You') : t('Partner') + ' · ' + partnerName}</Text>
              <Text verbatim style={[s.message, own && { color: colors.surface }, /[؀-ۿ]/.test(message.text) && { writingDirection: 'rtl', textAlign: 'right' }]}>{message.text}</Text>
            </View>;
          })}
        </ScrollView>
        {!!voice.message && <View style={s.voiceNotice}><Ionicons name="mic-outline" size={18} color={colors.primaryDark}/><Text accessibilityLiveRegion="polite" style={s.voiceNoticeText}>{voice.owner === 'partner' ? 'Partner' : 'You'}: {voice.message}</Text>{!voice.busy && <Pressable accessibilityRole="button" accessibilityLabel="Dismiss voice notice" onPress={voice.clearFeedback} style={s.noticeDismiss}><Ionicons name="close" size={19} color={colors.primaryDark}/></Pressable>}</View>}
        {showQuickReplies && !recordingSender && <View testID="quick-replies" style={s.replies}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.replyContent}>
            {['Yes', 'No', 'Thank you', 'Please call my family'].map((reply, index) => <Pressable ref={index === 0 ? firstQuickReply : undefined} key={reply} accessibilityRole="button" accessibilityLabel={t('Send as {name}', { name: senderLabel }) + ': ' + t(reply)} onPress={() => sendQuickReply(reply)} style={s.reply}><Text style={s.replyText}>{reply}</Text></Pressable>)}
          </ScrollView>
        </View>}
        {recordingSender ? <View style={{ padding: 12, backgroundColor: colors.cream }}>
          <RecordingStatus active={voice.phase === 'listening'} title={voice.phase === 'permission' ? 'Microphone access' : voice.phase === 'stopping' ? 'Finishing' : 'Listening'} detailVerbatim detail={voice.preview || t(recordingSender === 'you' ? 'You' : 'Partner') + ' · ' + t('Speak, then review your draft')} action="stop" onAction={voice.stop} />
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel voice input" onPress={voice.cancel} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={senderStyles.caption}>Cancel · keep my existing draft</Text></Pressable>
        </View> : <View style={s.composer}>
          <Pressable onPress={() => { setShowQuickReplies(false); setShowSessionDetails(false); void Speech.stop().catch(() => {}); voice.start(activeSender, text, speechLocale); }} accessibilityRole="button" accessibilityLabel={t('Start voice input') + ': ' + senderLabel} style={s.mic}><Ionicons name="mic" size={24} color={colors.surface} /></Pressable>
          <Pressable onPress={() => { setShowSessionDetails(false); setShowQuickReplies(value => !value); }} accessibilityRole="button" accessibilityLabel={showQuickReplies ? 'Close quick messages' : 'Open quick messages'} aria-expanded={showQuickReplies} accessibilityState={{ expanded: showQuickReplies }} style={[s.quickButton, showQuickReplies && s.quickButtonActive]}><Ionicons name={showQuickReplies ? 'close' : 'chatbubble-ellipses-outline'} size={22} color={colors.primaryDark} /></Pressable>
          <TextInput accessibilityLabel={t('Message from {name}', { name: senderLabel })} value={text} onChangeText={value => setDrafts(previous => ({ ...previous, [activeSender]: value }))} placeholder={t("{name}'s message…", { name: senderLabel })} placeholderTextColor={colors.muted} style={s.input} multiline />
          <Pressable onPress={sendTyped} disabled={!text.trim()} accessibilityState={{ disabled: !text.trim() }} accessibilityRole="button" accessibilityLabel={t('Send as {name}', { name: senderLabel })} style={[s.send, !text.trim() && { opacity: 0.45 }]}><Ionicons name="arrow-up" size={22} color={colors.ink} /></Pressable>
        </View>}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const senderStyles = StyleSheet.create({
  toolbar: { minHeight: 56, paddingHorizontal: 12, paddingVertical: 4, backgroundColor: colors.surface, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 8 },
  caption: { color: colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 8 },
  options: { flex: 1, flexDirection: 'row', gap: 4, padding: 3, borderRadius: 14, backgroundColor: colors.cream },
  option: { flex: 1, minHeight: 44, paddingHorizontal: 8, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  selected: { backgroundColor: colors.emerald },
  selectedText: { color: colors.surface },
  personLetter: { color: colors.primaryDark, fontSize: 11, fontWeight: '900' },
  label: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  language: { minWidth: 64, minHeight: 44, paddingHorizontal: 9, borderRadius: 13, backgroundColor: colors.primaryLight, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  languageText: { color: colors.primaryDark, fontSize: 12, fontWeight: '900' },
  detailsButton: { width: 44, height: 44, borderRadius: 13, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' },
  detailsButtonActive: { backgroundColor: colors.primaryLight },
});
const s=StyleSheet.create({safe:{flex:1,minHeight:0,backgroundColor:colors.cream},header:{minHeight:56,paddingHorizontal:12,paddingVertical:4,flexDirection:'row',gap:10,alignItems:'center',backgroundColor:colors.cream},iconButton:{width:44,height:44,borderRadius:14,backgroundColor:colors.surface,alignItems:'center',justifyContent:'center'},session:{fontSize:9,fontWeight:'900',letterSpacing:1.35,color:colors.emerald},headerTitle:{fontSize:18,fontWeight:'900',color:colors.ink,marginTop:2},details:{paddingHorizontal:14,paddingVertical:9,backgroundColor:colors.mint,gap:4,borderBottomWidth:1,borderColor:colors.line},detailRow:{flexDirection:'row',alignItems:'center',gap:7},detailText:{flex:1,fontSize:12,lineHeight:17,fontWeight:'800',color:colors.emeraldDark},detailHint:{fontSize:11,lineHeight:16,color:colors.muted},transcript:{flex:1,minHeight:0},messages:{paddingHorizontal:14,paddingVertical:12,gap:10,flexGrow:1,justifyContent:'flex-end'},bubble:{maxWidth:'86%',paddingHorizontal:14,paddingVertical:11,borderRadius:19},incoming:{alignSelf:'flex-start',backgroundColor:colors.surface,borderBottomLeftRadius:5},outgoing:{alignSelf:'flex-end',backgroundColor:colors.emerald,borderBottomRightRadius:5},speaker:{fontSize:9,fontWeight:'900',color:colors.emerald,letterSpacing:.6,marginBottom:4},message:{fontSize:18,lineHeight:25,fontWeight:'700',color:colors.ink},voiceNotice:{minHeight:44,paddingLeft:14,paddingRight:6,backgroundColor:colors.primaryLight,flexDirection:'row',alignItems:'center',gap:8,borderTopWidth:1,borderColor:colors.line},voiceNoticeText:{flex:1,fontSize:12,lineHeight:17,color:colors.primaryDark},noticeDismiss:{width:44,height:44,alignItems:'center',justifyContent:'center'},replies:{minHeight:58,paddingVertical:7,paddingLeft:12,backgroundColor:colors.primaryLight,borderTopWidth:1,borderColor:'#DED6FF'},replyContent:{gap:8,paddingRight:12},reply:{minHeight:44,justifyContent:'center',paddingHorizontal:15,borderRadius:99,backgroundColor:colors.surface,borderWidth:1,borderColor:'#D9D0FF'},replyText:{fontSize:13,fontWeight:'800',color:colors.ink},composer:{minHeight:66,paddingHorizontal:10,paddingVertical:7,flexDirection:'row',alignItems:'flex-end',gap:7,backgroundColor:colors.surface,borderTopWidth:1,borderColor:colors.line},mic:{width:48,height:50,borderRadius:16,backgroundColor:colors.emerald,alignItems:'center',justifyContent:'center'},quickButton:{width:46,height:50,borderRadius:16,backgroundColor:colors.primaryLight,alignItems:'center',justifyContent:'center'},quickButtonActive:{backgroundColor:'#DED6FF'},input:{flex:1,height:50,minHeight:50,maxHeight:50,paddingHorizontal:13,paddingVertical:8,borderRadius:16,backgroundColor:colors.cream,color:colors.ink,fontSize:16},send:{width:46,height:50,borderRadius:16,backgroundColor:colors.lime,alignItems:'center',justifyContent:'center'}});
