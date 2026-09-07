import { Camera, CameraView, type PermissionResponse } from 'expo-camera';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, StyleSheet, View } from 'react-native';
import { Ionicons, Pressable, Text } from './localized-ui';
import { colors } from './theme';

export type CapturedPhoto = {
  base64: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  uri: string;
};

type Props = {
  onCapture: (photo: CapturedPhoto) => void;
  onCancel: () => void;
  facing?: 'back' | 'front';
};

const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

/** Mount after a user requests a photo; the owner unmounts on route blur/background. */
export function PhotoCapture({ onCapture, onCancel, facing: initialFacing = 'back' }: Props) {
  const camera = useRef<CameraView>(null);
  const active = useRef(true);
  const operation = useRef(0);
  const capturePending = useRef(false);
  const [permission, setPermission] = useState<PermissionResponse | null>(null);
  const [checking, setChecking] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [facing, setFacing] = useState(initialFacing);
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState('');
  const [cameraFailed, setCameraFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    active.current = true;
    const current = ++operation.current;
    // A permission query never opens the system prompt. Requesting is a separate tap.
    Camera.getCameraPermissionsAsync().then(value => {
      if (active.current && current === operation.current) setPermission(value);
    }).catch(() => {
      // Some browsers cannot query permissions; the explicit request still works.
    }).finally(() => {
      if (active.current && current === operation.current) setChecking(false);
    });
    return () => { active.current = false; operation.current += 1; };
  }, []);

  useEffect(() => {
    if (!permission?.granted || ready || cameraFailed) return;
    const timeout = setTimeout(() => {
      if (!active.current) return;
      setCameraFailed(true);
      setError('Camera did not start. Close other camera apps, then try again.');
    }, 12000);
    return () => clearTimeout(timeout);
  }, [permission?.granted, ready, cameraFailed, attempt, facing]);

  const close = () => {
    active.current = false;
    operation.current += 1;
    onCancel();
  };

  const requestPermission = async () => {
    if (requesting) return;
    const current = ++operation.current;
    setRequesting(true);
    setError('');
    try {
      const result = await Camera.requestCameraPermissionsAsync();
      if (!active.current || current !== operation.current) return;
      setPermission(result);
      if (!result.granted) setError('Camera access was not allowed. You can retry or change camera permission in settings.');
    } catch {
      if (active.current && current === operation.current) setError('Camera access is unavailable. Check camera permission and try again.');
    } finally {
      if (active.current && current === operation.current) setRequesting(false);
    }
  };

  const capture = async () => {
    if (!ready || !camera.current || capturePending.current || cameraFailed) return;
    capturePending.current = true;
    const current = ++operation.current;
    setCapturing(true);
    setError('');
    try {
      // Native returns a temporary cache file; no gallery or permanent file is written.
      const photo = await camera.current.takePictureAsync({
        base64: true, quality: 0.6, exif: false, skipProcessing: false,
        ...(Platform.OS === 'web' ? { imageType: 'jpg' as const, scale: 0.75 } : {}),
      });
      if (!active.current || current !== operation.current) return;
      const raw = photo?.base64;
      if (!raw) throw new Error('missing_photo');
      // Expo web supplies a complete data URL; native supplies only the encoded body.
      const dataUrl = /^data:(image\/(?:jpeg|jpg|png|webp));base64,/i.exec(raw);
      const base64 = dataUrl ? raw.slice(dataUrl[0].length) : raw;
      const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
      if (Math.floor(base64.length * 3 / 4) - padding > MAX_PHOTO_BYTES) {
        setError('This photo is too large. Move closer to one object and take another photo.');
        return;
      }
      const detectedType = dataUrl?.[1]?.toLowerCase();
      const mimeType: CapturedPhoto['mimeType'] = detectedType === 'image/png' || photo.format === 'png'
        ? 'image/png' : detectedType === 'image/webp' ? 'image/webp' : 'image/jpeg';
      onCapture({ base64, mimeType, uri: photo.uri });
    } catch {
      if (active.current && current === operation.current) setError('The photo could not be captured. Hold the phone steady and try again.');
    } finally {
      capturePending.current = false;
      if (active.current && current === operation.current) setCapturing(false);
    }
  };

  const onReady = useCallback(() => { if (active.current) setReady(true); }, []);
  const onMountError = useCallback(() => {
    if (!active.current) return;
    setReady(false);
    setCameraFailed(true);
    setError('Camera did not start. Close other camera apps, then try again.');
  }, []);

  const retryCamera = () => {
    setReady(false);
    setCameraFailed(false);
    setError('');
    setAttempt(value => value + 1);
  };

  return <View style={s.container}>
    <View style={s.header}>
      <Text accessibilityRole="header" style={s.title}>Take a photo</Text>
      <Pressable onPress={close} style={s.close} accessibilityLabel="Close camera">
        <Ionicons name="close" size={24} color={colors.ink}/>
      </Pressable>
    </View>
    {permission?.granted && !cameraFailed ? <>
      <View style={s.preview}>
        <CameraView key={`${facing}-${attempt}`} ref={camera} style={StyleSheet.absoluteFill}
          facing={facing} mode="picture" flash="off" mute
          onCameraReady={onReady} onMountError={onMountError}/>
        {!ready && <View style={s.starting} pointerEvents="none">
          <ActivityIndicator color="#FFFFFF"/>
          <Text style={s.previewText}>Starting camera…</Text>
        </View>}
        <View pointerEvents="none" style={s.previewHint}><Text style={s.previewText}>Hold steady and keep the object in view</Text></View>
      </View>
      <View style={s.controls}>
        <View style={s.sideSpace}/>
        <Pressable onPress={capture} disabled={!ready || capturing}
          accessibilityLabel={capturing ? 'Capturing photo…' : 'Capture photo'}
          accessibilityState={{ disabled: !ready || capturing, busy: capturing }}
          style={[s.shutter, (!ready || capturing) && s.disabled]}>
          {capturing ? <ActivityIndicator color={colors.primaryDark}/> : <Ionicons name="camera" size={29} color={colors.primaryDark}/>}
        </Pressable>
        <Pressable disabled={capturing || !ready} onPress={() => {
          setReady(false); setError(''); setFacing(value => value === 'back' ? 'front' : 'back');
        }} accessibilityLabel="Switch front or back camera" accessibilityState={{ disabled: capturing || !ready }}
          style={[s.flip, (capturing || !ready) && s.disabled]}>
          <Ionicons name="camera-reverse-outline" size={26} color={colors.ink}/>
        </Pressable>
      </View>
    </> : <View style={s.permission}>
      <View style={s.permissionIcon}><Ionicons name="camera-outline" size={36} color={colors.primaryDark}/></View>
      <Text style={s.permissionTitle}>{checking ? 'Checking camera access…' : cameraFailed ? 'Camera unavailable' : 'Allow camera access to take a photo'}</Text>
      <Text style={s.description}>Only a photo is captured. No audio is recorded.</Text>
      {Platform.OS === 'web' && <Text style={s.description}>In a browser, use HTTPS or localhost and allow this site to use the camera.</Text>}
      {checking ? <ActivityIndicator color={colors.primaryDark}/> : <Pressable
        onPress={cameraFailed ? retryCamera : requestPermission} disabled={requesting}
        accessibilityState={{ disabled: requesting, busy: requesting }} style={[s.primary, requesting && s.disabled]}>
        {requesting && <ActivityIndicator color="#FFFFFF"/>}
        <Text style={s.primaryText}>{requesting ? 'Waiting for camera permission…' : cameraFailed ? 'Retry camera' : 'Allow camera'}</Text>
      </Pressable>}
      {permission && !permission.granted && Platform.OS !== 'web' && !permission.canAskAgain && <Pressable style={s.settings} onPress={() => {
        Linking.openSettings().catch(() => { if (active.current) setError('Open your device settings and allow camera access for this app.'); });
      }}><Text style={s.settingsText}>Open device settings</Text></Pressable>}
    </View>}
    {!!error && <View style={s.error} accessibilityLiveRegion="polite"><Text style={s.errorText}>{error}</Text></View>}
  </View>;
}

const s = StyleSheet.create({
  container: { flex: 1, minHeight: 360, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { flex: 1, color: colors.ink, fontSize: 20, fontWeight: '800' },
  close: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  preview: { flex: 1, minHeight: 240, backgroundColor: '#171829', borderRadius: 22, overflow: 'hidden' },
  starting: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, justifyContent: 'center', alignItems: 'center', gap: 10, backgroundColor: '#17182999' },
  previewHint: { position: 'absolute', bottom: 14, left: 12, right: 12, alignItems: 'center', backgroundColor: '#171829B3', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  previewText: { color: '#FFFFFF', fontSize: 13, lineHeight: 20, textAlign: 'center', fontWeight: '600' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28 },
  sideSpace: { width: 48 },
  shutter: { width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: colors.primary, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  flip: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.5 },
  permission: { flex: 1, padding: 18, minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: colors.surface, borderRadius: 22 },
  permissionIcon: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryLight },
  permissionTitle: { fontSize: 18, fontWeight: '700', lineHeight: 26, color: colors.ink, textAlign: 'center' },
  description: { fontSize: 13, lineHeight: 20, color: colors.muted, textAlign: 'center' },
  primary: { minHeight: 50, borderRadius: 16, paddingHorizontal: 24, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: colors.primaryDark },
  primaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', flexShrink: 1, textAlign: 'center' },
  settings: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 12 },
  settingsText: { color: colors.primaryDark, fontSize: 14, fontWeight: '600' },
  error: { borderRadius: 14, padding: 14, backgroundColor: colors.redSoft },
  errorText: { color: '#842334', fontSize: 13, lineHeight: 20 },
});
