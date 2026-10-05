import React, {useEffect, useMemo, useRef, useState} from 'react';
import {AppState, BackHandler, Linking, PermissionsAndroid, Platform, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Switch, Text, TextInput, View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Camera, useCameraDevice, useCameraFormat} from 'react-native-vision-camera';
import {MenuRagIndex, Sonkkeut, useSonkkeut, isWalkthrough} from './src/walkthroughRuntime';
import {Walkthrough, virtualScreenNames} from './src/Walkthrough';
import type {GuidanceEvent, MenuRagResult, ModelDownloadProgress, ScreenStructure, SpeechModelStatus} from 'react-native-sonkkeut';
import type {Action, MenuItem} from './src/domain';
import {isReadableElement, OrderFlow, parseOrder, screenReading} from './src/domain';
import {clearUsage, DEFAULT_MENU, enqueueUsage, flushUsage, validateBaseUrl} from './src/backend';
import type {Step} from './src/backend';
import {APP_VERSION, BACKEND_URL, DEFAULT_STORE_CODE, MODEL_VERSION} from './src/config';
import {restoreSettings} from './src/settings';
import {useBackendConnection} from './src/useBackendConnection';
import type {ServerConfig} from './src/useBackendConnection';
import {orderProgress, readableRows, targetOverlay, visualGuidance} from './src/guidance';
import {createTheme, ThemeContext, useTheme} from './src/theme';
import type {ThemeName} from './src/theme';
import {cameraView} from './src/camera';

function Button({title, onPress, disabled = false, secondary = false}: {title: string; onPress: () => void; disabled?: boolean; secondary?: boolean}) {
  const {styles} = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={({pressed}) => [styles.button, secondary && styles.secondaryButton, disabled && styles.disabled, pressed && styles.pressed]}><Text style={[styles.buttonText, secondary && styles.secondaryText, disabled && styles.disabledText]}>{title}</Text></Pressable>;
}

export default function App() {
  const flow = useRef(new OrderFlow()).current;
  const [, redraw] = useState(0);
  const [running, setRunning] = useState(false);
  const [permission, setPermission] = useState(false);
  const [foreground, setForeground] = useState(true);
  const [paused, setPaused] = useState(false);
  const [order, setOrder] = useState('');
  const [speechResult, setSpeechResult] = useState<MenuRagResult>();
  const [speechProvider, setSpeechProvider] = useState('');
  const [heardText, setHeardText] = useState('');
  const [finishingSpeech, setFinishingSpeech] = useState(false);
  const [listening, setListening] = useState(false);
  const [speechModel, setSpeechModel] = useState<SpeechModelStatus>();
  const [modelDownloading, setModelDownloading] = useState(false);
  const [modelPreparing, setModelPreparing] = useState(false);
  const [modelProgress, setModelProgress] = useState<ModelDownloadProgress>();
  const [modelMessage, setModelMessage] = useState('자체 음성 모델 상태를 확인하고 있습니다');
  const modelMounted = useRef(true);
  const [server, setServer] = useState(BACKEND_URL);
  const [code, setCode] = useState(DEFAULT_STORE_CODE);
  const [menu, setMenu] = useState<MenuItem[]>(DEFAULT_MENU);
  const [serverConfig, setServerConfig] = useState<ServerConfig>();
  const {connection, reconnect} = useBackendConnection(isWalkthrough() ? undefined : serverConfig, foreground);
  const connectionMatches = connection.configKey === JSON.stringify([serverConfig?.server, serverConfig?.code]);
  const [guidance, setGuidance] = useState<{action: Action; event: GuidanceEvent}>();
  const [captions, setCaptions] = useState<string[]>([]);
  const [verification, setVerification] = useState<{text: string; success: boolean}>();
  const [readerScreen, setReaderScreen] = useState<ScreenStructure>();
  const [cameraError, setCameraError] = useState(false);
  const [statsEnabled, setStatsEnabled] = useState(false);
  const statsEnabledRef = useRef(statsEnabled);
  statsEnabledRef.current = statsEnabled;
  const [lowVision, setLowVision] = useState(true);
  const [themeName, setThemeName] = useState<ThemeName>('dark');
  const [textSize, setTextSize] = useState<0 | 1 | 2>(0);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [speechSpeed, setSpeechSpeed] = useState<0 | 1 | 2>(1);
  const theme = useMemo(() => createTheme(themeName, textSize), [themeName, textSize]);
  const {colors, styles} = theme;
  const [wideCamera, setWideCamera] = useState(true);
  const [wideFailed, setWideFailed] = useState(false);
  const savedSettings = useRef(restoreSettings(undefined));
  const settingsWrites = useRef<Promise<void>>(Promise.resolve());
  const [settingsMessage, setSettingsMessage] = useState('');
  const [preview, setPreview] = useState({width: 1, height: 1});
  const [settings, setSettings] = useState(false);
  const [page, setPage] = useState<'home' | 'menu' | 'order' | 'reader' | 'settings'>('home');
  const [speechSettings, setSpeechSettings] = useState(false);
  const [storeCode, setStoreCode] = useState<string>();
  const startedAt = useRef(Date.now());
  const steps = useRef<Step[]>([]);
  const applied = useRef<Action>();
  const stepStart = useRef(0);
  const reached = useRef<number>();
  const hints = useRef(0);
  const recorded = useRef(false);
  const announced = useRef('');
  const generation = useRef(0);
  const sessionConfig = useRef<{server: string; storeCode?: string}>({server: BACKEND_URL});
  if (!running) {sessionConfig.current = {server: serverConfig?.server ?? BACKEND_URL, storeCode: connectionMatches ? storeCode : undefined};}
  const menuSource = useRef<'default' | 'detected' | 'server'>('default');
  const appliedMenuVersion = useRef<number>();
  const screenSeen = useRef(false);
  const stepScreen = useRef('unknown');
  const orderPrompted = useRef(false);
  const welcomed = useRef(false);
  const standardCamera = useCameraDevice('back');
  const widerCamera = useCameraDevice('back', {physicalDevices: ['ultra-wide-angle-camera']});
  const {device, zoom, ultraWide} = cameraView(standardCamera, widerCamera, wideCamera && !wideFailed);
  const format = useCameraFormat(device, [{videoResolution: {width: 1280, height: 720}}, {fps: 15}]);
  const refresh = () => redraw(n => n + 1);
  const caption = (text: string) => setCaptions(current => current[0] === text ? current : [text, ...current].slice(0, 5));
  const ai = useSonkkeut({active: running && page === 'home' && permission && !paused && foreground && flow.state !== 'S6',
    onResult: result => {
      if (!running || page !== 'home' || flow.paused || flow.state === 'S6') {return;}
      if (result.found) {screenSeen.current = true; return;}
      if (!screenSeen.current) {return;}
      screenSeen.current = false; generation.current++; applied.current = undefined; setGuidance(undefined);
      setListening(false); Sonkkeut.cancelListening();
      Sonkkeut.clearTarget(); flow.screen = undefined;
      flow.enter(flow.confirmed ? 'SE' : 'S1', '화면을 놓쳤습니다. 손을 멈추고 휴대폰을 다시 화면 쪽으로 들어 주세요.'); refresh();
    },
    onScreen: screen => {
      if (!running || page !== 'home' || flow.paused) {return;}
      flow.acceptScreen(screen);
      if (!flow.intent && menuSource.current !== 'server' && screen.screen_type === 'menu') {
        const detected = screen.elements.filter(e => e.kind === 'menu' && e.text && isReadableElement(e))
          .map(e => ({name: e.text!.replace(/[\d,]+\s*원/g, '').trim(), price: e.price, aliases: [], sold_out: false}));
        if (detected.length) {
          menuSource.current = 'detected';
          setMenu(current => [...current.filter(item => !detected.some(found => found.name === item.name)), ...detected]);
        }
      }
      if (flow.state === 'S3' && !flow.confirmed && !orderPrompted.current) {
        orderPrompted.current = true; openPage('order'); Sonkkeut.announce('화면을 찾았습니다. 주문 입력 화면에서 주문을 알려 주세요.');
      }
      refresh();
    },
    onEvent: event => {
      if (!running || page !== 'home' || flow.paused) {return;}
      if (flow.state === 'S4' && flow.action && (!event.target_id || event.target_id === flow.action.target.id)) {
        setGuidance({action: flow.action, event});
        if (event.speak) {caption(event.speak);}
      }
      if (event.speak) {hints.current = Math.min(1000, hints.current + 1);}
      if (event.type === 'press' && flow.state === 'S4' && applied.current === flow.action && event.target_id === flow.action?.target.id) {
        reached.current = Math.max(0, Math.min(600, (Date.now() - stepStart.current) / 1000)); flow.press(); refresh();
      }
    },
    onVerdict: verdict => {
      if (!running || page !== 'home' || flow.paused || flow.state !== 'S5') {return;}
      const target = applied.current?.target;
      steps.current.push({screen_type: stepScreen.current, target_kind: target?.kind ?? 'unknown', result: verdict.result,
        reach_s: reached.current, hints: hints.current, fail_reason: verdict.result === 'success' ? undefined : verdict.reason.slice(0, 60)});
      applied.current = undefined;
      setGuidance(undefined); setVerification({text: `${target?.text || '목표 버튼'} · ${verdict.speak}`, success: verdict.result === 'success'}); caption(verdict.speak);
      flow.verdict(verdict); refresh();
    },
  });
  useEffect(() => {
    if (ai.ready && serverConfig) {Sonkkeut.configureFeedback(voiceEnabled, vibrationEnabled, [0.75, 1, 1.25][speechSpeed]);}
  }, [ai.ready, serverConfig, voiceEnabled, vibrationEnabled, speechSpeed]);
  useEffect(() => {
    if (ai.ready && serverConfig && !welcomed.current) {
      welcomed.current = true; Sonkkeut.announce('손끝길을 시작합니다. 시작 버튼을 누르고 휴대폰을 화면 쪽으로 들어 주세요.');
    }
  }, [ai.ready, serverConfig]);

  useEffect(() => {
    const lifecycleGeneration = generation;
    modelMounted.current = true;
    const progress = Sonkkeut.addModelDownloadListener(value => {
      if (modelMounted.current) {setModelProgress(value);}
    });
    Sonkkeut.getSpeechModelStatus().then(async status => {
      if (!modelMounted.current) {return;}
      setSpeechModel(status);
      if (status.installed && !status.ready) {
        setModelPreparing(true);
        setModelMessage('자체 음성 모델을 준비하고 있습니다');
        status = await Sonkkeut.prepareSpeechModel();
        if (!modelMounted.current) {return;}
        setSpeechModel(status);
      }
      setModelMessage(status.ready ? '자체 음성 모델 준비 완료 · 기기 안에서 인식합니다' : '음성 주문을 사용하려면 모델을 한 번 내려받아 주세요');
    }).catch(() => {
      if (modelMounted.current) {setModelMessage('음성 모델을 준비하지 못했습니다. 다시 시도하거나 주문을 입력해 주세요');}
    }).finally(() => {
      if (modelMounted.current) {setModelPreparing(false);}
    });
    return () => {
      modelMounted.current = false; lifecycleGeneration.current++; progress();
      Sonkkeut.cancelListening(); Sonkkeut.cancelSpeechModelDownload();
    };
  }, []);

  useEffect(() => {
    const aliases: Record<string, string> = {};
    menu.forEach(item => [item.name, ...item.aliases].forEach(alias => {aliases[alias.replace(/\s/g, '')] = item.name;}));
    Sonkkeut.setMenuAliases(aliases);
  }, [menu]);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem('settings').then(raw => {
      if (!mounted) {return;}
      const saved = restoreSettings(raw ? JSON.parse(raw) : undefined);
      savedSettings.current = saved;
      setServer(saved.server); setCode(saved.code); setStatsEnabled(isWalkthrough() ? false : saved.statsEnabled);
      setThemeName(saved.theme); setWideCamera(saved.wideCamera); setLowVision(saved.lowVision);
      setTextSize(saved.textSize); setVoiceEnabled(saved.voiceEnabled); setVibrationEnabled(saved.vibrationEnabled); setSpeechSpeed(saved.speechSpeed);
      setServerConfig({server: saved.server, code: saved.code});
      statsEnabledRef.current = !isWalkthrough() && saved.statsEnabled === true;
    }).catch(() => {if (mounted) {setServerConfig({server: BACKEND_URL, code: DEFAULT_STORE_CODE});}});
    const sub = AppState.addEventListener('change', state => {
      setForeground(state === 'active');
      if (state !== 'active') {generation.current++; flow.paused = true; setPaused(true); setListening(false); Sonkkeut.cancelListening(); Sonkkeut.silence();}
      else if (statsEnabledRef.current) {flushUsage().catch(() => {});}
    });
    return () => {mounted = false; sub.remove();};
  }, [flow]);

  useEffect(() => {
    if (!serverConfig || running) {return;}
    // A reconnect never changes the menu, aliases or statistics destination mid-order.
    if (connectionMatches && connection.menu) {
      menuSource.current = 'server'; setMenu(connection.menu.items); setStoreCode(connection.menu.store_code);
      appliedMenuVersion.current = connection.menu.menu_version;
    } else {
      menuSource.current = 'default'; setMenu(DEFAULT_MENU); setStoreCode(undefined);
      appliedMenuVersion.current = undefined;
    }
  }, [connection, connectionMatches, running, serverConfig]);

  useEffect(() => {
    if (connection.status === 'online' && statsEnabledRef.current) {flushUsage().catch(() => {});}
  }, [connection.status]);

  useEffect(() => {
    if (!running || page !== 'home' || paused || !foreground) {return;}
    if (flow.message !== announced.current) {
      announced.current = flow.message;
      caption(flow.message);
      if (flow.state !== 'S5') {Sonkkeut.announce(flow.message);}
    }
    const action = flow.action;
    if (flow.state === 'S4' && action && action !== applied.current) {
      applied.current = action; stepStart.current = Date.now(); hints.current = 0; reached.current = undefined;
      stepScreen.current = ['start', 'method', 'menu', 'option', 'cart', 'payment', 'unknown'].includes(flow.screen?.screen_type ?? '') ? flow.screen!.screen_type : 'unknown';
      const token = ++generation.current;
      Sonkkeut.setTarget(action.target.id, action.expect).then(ok => {
        if (token !== generation.current || flow.paused || flow.action !== action) {return;}
        if (!ok) {flow.enter('SE', '화면이 바뀌었습니다. 다시 확인해 주세요.'); applied.current = undefined; refresh();}
      }).catch(() => {
        if (token !== generation.current || flow.paused || flow.action !== action) {return;}
        applied.current = undefined; flow.enter('SE', '목표 버튼을 연결하지 못했습니다.'); refresh();
      });
    }
    if (flow.state === 'SE' || flow.state === 'S6') {Sonkkeut.clearTarget();}
    if (flow.state === 'S6') {record(true);}
  });

  useEffect(() => {
    if (ai.result?.target_missing && running && !flow.paused && flow.state === 'S4') {
      generation.current++; applied.current = undefined; setGuidance(undefined); Sonkkeut.clearTarget(); flow.recover(); Sonkkeut.requestKeyframe(); refresh();
    }
  }, [ai.result?.target_missing, running, flow]);

  function record(completed: boolean) {
    if (isWalkthrough()) {return;}
    if (recorded.current) {return;}
    recorded.current = true;
    if (!statsEnabledRef.current || !sessionConfig.current.server) {return;}
    try {
      const base = validateBaseUrl(sessionConfig.current.server);
      enqueueUsage(base, {store_code: sessionConfig.current.storeCode, app_version: APP_VERSION, model_version: MODEL_VERSION, completed,
        duration_s: Math.min(7200, (Date.now() - startedAt.current) / 1000), steps: steps.current.slice(0, 200),
        event_id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`}).catch(() => {});
    } catch (_) {}
  }
  async function start() {
    if (Platform.OS !== 'android') {flow.enter('SE', '안드로이드 기기에서 실행해 주세요.'); refresh(); return;}
    const camera = isWalkthrough() ? 'granted' : await Camera.requestCameraPermission();
    if (!isWalkthrough()) {await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);}
    if (camera !== 'granted') {
      flow.enter('SE', '카메라 권한이 필요합니다. 설정에서 권한을 허용해 주세요.'); Sonkkeut.announce(flow.message); refresh(); return;
    }
    if (!ai.ready) {flow.enter('SE', ai.error || '모델을 준비하고 있습니다. 잠시 후 다시 시작해 주세요.'); refresh(); return;}
    setPermission(true); setRunning(true); setPage('home'); setSettings(false); setPaused(false); setCameraError(false); setReaderScreen(undefined); setGuidance(undefined); setVerification(undefined); setCaptions([]); flow.paused = false;
    generation.current++; flow.reset(); applied.current = undefined; screenSeen.current = false; announced.current = ''; setOrder(''); setSpeechResult(undefined); setHeardText('');
    orderPrompted.current = false;
    flow.enter('S1', '휴대폰을 가슴 높이에서 화면 쪽으로 들어 주세요');
    startedAt.current = Date.now(); recorded.current = false; steps.current = []; refresh();
    Sonkkeut.requestKeyframe();
  }
  function submit(text: string) {
    setListening(false); Sonkkeut.cancelListening();
    try {
      Sonkkeut.clearTarget(); applied.current = undefined; generation.current++;
      setGuidance(undefined); setVerification(undefined);
      flow.submit(parseOrder(text, menu)); setOrder(text); refresh();
    } catch (e) {flow.intent = undefined; flow.confirmed = false; flow.remaining = []; flow.enter('S3', (e as Error).message); refresh();}
    Sonkkeut.announce(flow.message);
  }
  async function listen(provider: 'custom' | 'system' = 'custom') {
    const token = ++generation.current;
    setListening(true); setFinishingSpeech(false); setHeardText(''); setSpeechResult(undefined); setSpeechProvider(provider === 'custom' ? '자체 음성 인식' : '기기 음성 인식');
    try {
      const text = await Sonkkeut.listen(provider);
      if (token !== generation.current) {return;}
      setHeardText(text);
      const scope = JSON.stringify([sessionConfig.current.server, storeCode ?? 'detected', appliedMenuVersion.current ?? 0]);
      const result = await Sonkkeut.correctMenuSpeech(text, scope, menu);
      if (token === generation.current && page === 'order' && foreground) {
        setListening(false); setSpeechResult(result); setOrder(result.text);
        if (result.ambiguities.length) {
          Sonkkeut.clearTarget(); flow.intent = undefined; flow.confirmed = false; flow.remaining = [];
          flow.enter('S3', '비슷한 메뉴가 있습니다. 아래에서 메뉴를 선택하거나 다시 말씀해 주세요.'); refresh(); Sonkkeut.announce(flow.message);
        } else {submit(result.text);}
      }
    }
    catch (e) {if (token === generation.current && page === 'order' && foreground) {flow.enter('S3', (e as Error).message || '다시 말씀해 주세요'); refresh();}}
    finally {if (token === generation.current) {setListening(false);}}
  }
  async function downloadSpeech() {
    setModelDownloading(true); setModelProgress(undefined);
    setModelMessage('음성 모델을 내려받고 있습니다');
    try {
      const status = await Sonkkeut.downloadSpeechModel();
      if (modelMounted.current) {setSpeechModel(status); setModelMessage('자체 음성 모델 준비 완료 · 기기 안에서 인식합니다');}
    } catch (e) {
      if (modelMounted.current) {setModelMessage((e as Error).message || '모델 다운로드를 다시 시도해 주세요');}
    } finally {
      if (modelMounted.current) {setModelDownloading(false);}
    }
  }
  async function saveServer() {
    try {
      const base = validateBaseUrl(server);
      const selectedCode = code.trim().toUpperCase();
      if (selectedCode && !/^[A-Z2-9]{6}$/.test(selectedCode)) {throw new Error('매장 코드는 영문·숫자 6자리입니다');}
      await persistSettings({server: base, code: selectedCode});
      setServer(base); setCode(selectedCode); setServerConfig({server: base, code: selectedCode}); reconnect();
      setSettingsMessage('설정을 저장했습니다. 서버에 자동으로 연결합니다.');
    } catch (e) {setSettingsMessage((e as Error).message);}
  }
  function pause() {
    const next = !paused; setPaused(next); flow.paused = next;
    generation.current++; setListening(false); setGuidance(undefined);
    if (next) {applied.current = undefined; Sonkkeut.clearTarget(); Sonkkeut.stop(); Sonkkeut.silence(); Sonkkeut.cancelListening();}
    else {resumeGuidance();}
  }
  function end() {
    record(false); generation.current++; Sonkkeut.clearTarget(); Sonkkeut.stop(); Sonkkeut.silence(); Sonkkeut.cancelListening();
    flow.reset(); applied.current = undefined; setListening(false); screenSeen.current = false; setGuidance(undefined); setVerification(undefined); setReaderScreen(undefined); setCameraError(false);
    flow.enter('S0', '손끝길을 시작합니다'); setRunning(false); setPage('home'); refresh();
  }
  const target = !paused && !cameraError && (flow.state === 'S4' || flow.state === 'S5') && ai.result?.found ? flow.action?.target : undefined;
  const overlay = targetOverlay(ai.result?.target_image_box, ai.result?.frame_size, preview);
  const guide = visualGuidance(flow.state, guidance?.action === flow.action ? guidance?.event : undefined, target?.id, paused, ai.result?.found === true);
  const progress = orderProgress(flow.intent, flow.remaining);
  const rows = readableRows(readerScreen);
  const connectionStatus = connectionMatches ? connection.status : 'checking';
  const online = connectionStatus === 'online';
  function retryCamera() {
    generation.current++; applied.current = undefined; setGuidance(undefined); setCameraError(false); setPaused(false); flow.paused = false;
    flow.recover(); Sonkkeut.requestKeyframe(); refresh();
  }
  function persistSettings(patch: Partial<ReturnType<typeof restoreSettings>>) {
    savedSettings.current = {...savedSettings.current, ...patch};
    const value = JSON.stringify(savedSettings.current);
    const write = settingsWrites.current.catch(() => {}).then(() => AsyncStorage.setItem('settings', value));
    settingsWrites.current = write;
    return write;
  }
  function savePreference(patch: Partial<ReturnType<typeof restoreSettings>>) {
    persistSettings(patch).catch(() => setSettingsMessage('설정을 저장하지 못했습니다. 다시 선택해 주세요.'));
  }
  function openPage(next: typeof page) {
    if (next !== page) {generation.current++; setListening(false); Sonkkeut.cancelListening();}
    if (next !== 'home' && running) {
      generation.current++; applied.current = undefined; flow.paused = true; setPaused(true); setListening(false); setGuidance(undefined);
      Sonkkeut.clearTarget(); Sonkkeut.stop(); Sonkkeut.silence(); Sonkkeut.cancelListening();
    }
    setPage(next);
  }
  function resumeGuidance() {
    generation.current++; applied.current = undefined; setGuidance(undefined); flow.screen = undefined; screenSeen.current = false;
    flow.paused = false; setPaused(false); announced.current = ''; flow.recover(); Sonkkeut.requestKeyframe(); refresh();
  }
  function confirmOrder() {
    flow.screen = undefined; flow.paused = false; flow.confirm(); setPage('home'); resumeGuidance();
  }
  function readScreen() {
    const screen = ai.result?.found ? flow.screen : undefined;
    setReaderScreen(screen); openPage('reader');
    Sonkkeut.say(screen ? screenReading(screen) : '아직 읽은 글자가 없습니다. 메인 화면에서 키오스크 전체를 비춰 주세요.');
  }
  function repeatGuidance() {
    Sonkkeut.say(paused ? '안내가 멈췄습니다. 안내 계속 버튼을 누르면 화면을 다시 확인합니다.' : cameraError ? flow.message : guidance?.action === flow.action && guidance?.event.speak ? guidance.event.speak : flow.message);
  }
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (page !== 'home') {generation.current++; setListening(false); Sonkkeut.cancelListening(); setPage('home'); return true;}
      if (running) {openPage('menu'); return true;}
      return false;
    });
    return () => sub.remove();
  });
  const statusText = isWalkthrough() ? '체험 모드 · 카메라/음성/서버 입력은 가상입니다' : online ? '● 서버 연결됨' : connectionStatus === 'checking' ? '자동 연결 확인 중' : connectionStatus === 'error' ? '매장 설정 확인 필요' : connectionMatches && connection.menu ? '오프라인 · 저장 메뉴 사용' : '오프라인 · 연결 재시도';
  const mainCaption = cameraError ? flow.message : paused || flow.state === 'S5' || flow.state === 'S6' ? guide.detail : verification && flow.state === 'SE' ? verification.text : guidance?.action === flow.action && guidance?.event.speak ? guidance.event.speak : !ai.result?.found && ai.result?.hint && ['S1', 'S2'].includes(flow.state) ? ai.result.hint : flow.message;
  return <ThemeContext.Provider value={theme}><SafeAreaView style={styles.root}>
    <StatusBar barStyle={themeName === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={colors.background}/>
    <View style={styles.header}>
      <Text accessibilityRole="header" style={styles.title}>{page === 'home' ? '손끝길' : page === 'menu' ? '메뉴' : page === 'order' ? '주문 확인' : page === 'reader' ? '화면 글자' : '환경 설정'}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={page === 'home' ? '메뉴·설정 열기' : '메인 화면으로'} disabled={!serverConfig} accessibilityState={{disabled: !serverConfig}} style={styles.headerButton} onPress={() => {openPage(page === 'home' ? 'menu' : 'home');}}><Text style={styles.headerButtonText}>{page === 'home' ? '메뉴·설정' : '메인으로'}</Text></Pressable>
    </View>
    {page === 'home' ? <>
      <View style={styles.connection}><Text numberOfLines={1} style={styles.connectionText}>{statusText}{!running && connectionMatches && connection.menu ? ` · ${connection.menu.store_name}` : ''}</Text></View>
      <View style={styles.main} testID="main-no-scroll">
        <View style={styles.preview} testID="portrait-camera" onLayout={e => setPreview(e.nativeEvent.layout)}>
          {isWalkthrough() ? <View style={styles.placeholder}><Text style={styles.placeholderTitle}>{running ? virtualScreenNames[flow.screen?.screen_type ?? ''] || '화면 인식 대기' : '이벤트 체험'}</Text><Text style={styles.placeholderBody}>{running ? flow.action?.target.text || '아래 임시 버튼으로 진행하세요' : '실제 키오스크 없이 주문 흐름을 둘러보세요'}</Text></View> : running && device && permission && !cameraError ? <Camera style={StyleSheet.absoluteFill} device={device} zoom={zoom} format={format} fps={15} pixelFormat="yuv" resizeMode="contain" outputOrientation="preview" isActive={ai.ready && !paused && foreground && flow.state !== 'S6'} frameProcessor={ai.frameProcessor} onError={() => {
            generation.current++; applied.current = undefined; setGuidance(undefined); setListening(false); Sonkkeut.cancelListening(); Sonkkeut.clearTarget(); Sonkkeut.silence(); flow.screen = undefined;
            if (ultraWide && !wideFailed) {setWideFailed(true); flow.recover(); Sonkkeut.requestKeyframe(); refresh(); return;}
            flow.paused = true; setPaused(true); setCameraError(true); flow.enter('SE', '카메라를 열지 못했습니다. 다른 카메라 앱을 닫고 다시 시도해 주세요.'); refresh();
          }}/> : <View style={styles.placeholder}>
            {!running && <View accessible={false} style={styles.portraitFrame}><View style={styles.frameLine}/><View style={styles.frameLine}/><View style={styles.frameLine}/></View>}
            <Text style={styles.placeholderTitle}>{!running ? '키오스크 전체를\n세로로 비춰 주세요' : cameraError ? '카메라를 다시 열어 주세요' : '후면 카메라를 확인해 주세요'}</Text>
            <Text style={styles.placeholderBody}>{!running ? '시작한 뒤 주문을 확인하면\n손끝까지 안내해 드립니다.' : flow.message}</Text>
          </View>}
          {lowVision && target && overlay && <View pointerEvents="none" style={[styles.outline, overlay]}/>}
        </View>
        <View style={styles.guidance}>
          {running ? <>
            <View style={styles.guideHeading}><View accessible={false} style={styles.directionBox}><Text style={styles.direction}>{guide.symbol}</Text></View><View style={styles.guideText}><Text accessibilityLiveRegion="polite" numberOfLines={2} style={styles.guideTitle}>{guide.title}</Text></View></View>
            <Text accessibilityLiveRegion="polite" numberOfLines={2} style={styles.caption}>{target ? `목표 · ${target.text || '버튼'} / ` : ''}{mainCaption}</Text>
          </> : <Text accessibilityLiveRegion="polite" numberOfLines={3} style={styles.caption}>{ai.error || (flow.state === 'SE' ? flow.message : ai.ready ? '화면을 찾으면 주문 입력 화면이 열립니다. 추가 기능은 위의 메뉴·설정에서 선택하세요.' : 'AI 모델을 준비하고 있습니다. 잠시 기다려 주세요.')}</Text>}
        </View>
      </View>
      <View style={styles.footer}>
        {!running ? <View style={styles.flex}><Button title={ai.ready ? '손끝길 시작' : '모델 준비 중'} disabled={!ai.ready || !serverConfig} onPress={() => {start().catch(e => {flow.enter('SE', String(e)); refresh();});}}/></View> : <>
          <View style={styles.flex}><Button title={cameraError ? '카메라 다시 열기' : flow.state === 'S6' ? '안내 종료' : paused || flow.state === 'SE' ? '안내 계속' : '안내 중지'} onPress={cameraError ? retryCamera : flow.state === 'S6' ? end : flow.state === 'SE' && !paused ? resumeGuidance : pause}/></View>
          <View style={styles.flex}><Button title="재안내" secondary onPress={repeatGuidance}/></View>
        </>}
      </View>
    </> : <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      {page === 'menu' && <>
        {running && <Text style={styles.small}>메뉴를 열면 안내가 멈춥니다. 메인 화면에서 ‘안내 계속’을 눌러 주세요.</Text>}
        <Button title={running ? flow.confirmed ? '확인한 주문 보기' : '주문 입력 열기' : '손끝길 시작'} onPress={() => {
          if (!running) {start().catch(e => {flow.enter('SE', String(e)); refresh();}); return;}
          orderPrompted.current = true; if (!flow.confirmed) {flow.enter('S3', '메뉴·수량·온도와 매장 또는 포장을 알려 주세요.');} openPage('order');
        }} disabled={!ai.ready || !serverConfig}/>
        {running && <Button title="화면 글자 보기·읽기" secondary onPress={readScreen}/>}
        <Button title="화면·카메라·음성 설정" secondary onPress={() => openPage('settings')}/>
        {running && <Button title="주문 안내 종료" secondary onPress={end}/>}
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>{statusText}</Text>
          <Text style={styles.body}>{connectionMatches ? connection.message : '저장된 서버와 매장 메뉴를 확인하고 있습니다'}</Text>
          <Text style={styles.body}>{menuSource.current === 'server' ? running ? '안내 시작 시 확인한 매장 메뉴' : connection.menu?.store_name || '저장된 매장 메뉴' : menuSource.current === 'detected' ? '카메라에서 읽은 메뉴' : '시연용 기본 메뉴 · 실제 화면을 확인해 주세요'}</Text>
          <Text style={styles.small}>매장 코드 · {storeCode || '시연'}</Text>
          {running && connection.menu && (connection.menu.store_code !== storeCode || connection.menu.menu_version !== appliedMenuVersion.current) && <Text style={styles.small}>새 매장 메뉴는 안내 종료 후 적용됩니다.</Text>}
          {menu.map(item => <View key={item.name} style={styles.menuRow}><Text style={styles.body}>{item.name}{item.sold_out ? ' · 품절' : ''}</Text><Text style={styles.small}>{item.price != null ? `${item.price.toLocaleString()}원` : '금액 확인 필요'}</Text></View>)}
          <Button title="연결 다시 확인" secondary onPress={reconnect}/>
        </View>
        {flow.state === 'SE' && <View style={[styles.card, styles.warning]}><Text style={styles.sectionTitle}>직원분, 키오스크 주문을 도와주세요.</Text><Text style={styles.body}>{flow.message}</Text></View>}
        {captions.length > 0 && <View style={styles.card}><Text accessibilityRole="header" style={styles.sectionTitle}>최근 안내 자막</Text>{captions.map((text, index) => <Text key={`${index}-${text}`} style={styles.body}>{index === 0 ? '최근 · ' : '이전 · '}{text}</Text>)}</View>}
        <Text style={styles.small}>영상·OCR·자체 음성 인식은 기기 안에서 처리합니다. 결제는 키오스크에서 직접 진행합니다.</Text>
      </>}
      {page === 'order' && <>
        <Text style={styles.small}>{flow.confirmed ? '확인한 주문은 안내 도중 바꾸지 않습니다.' : '여기서는 카메라 안내가 멈춰 있습니다. 주문을 확인하면 메인 화면으로 돌아갑니다.'}</Text>
          {speechResult && <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>{speechProvider} 결과</Text>
            <Text style={styles.body}>들은 문장 · {heardText}</Text>
            {speechResult.text !== heardText && <Text style={styles.body}>메뉴와 표현 보정 · {speechResult.text}</Text>}
            <Text style={styles.small}>메뉴·수량·온도를 확인해 주세요. 확인 버튼을 누르기 전에는 주문 안내를 시작하지 않습니다.</Text>
            {speechResult.ambiguities.slice(0, 1).map(ambiguity => <View key={`${ambiguity.start}:${ambiguity.end}`}>
              <Text accessibilityLiveRegion="polite" style={styles.body}>‘{ambiguity.original}’는 어떤 메뉴인가요?</Text>
              {ambiguity.candidates.map(candidate => <Button key={candidate.name} title={`${candidate.name}${candidate.sold_out ? ' · 품절' : ' 선택'}`} disabled={candidate.sold_out || listening} secondary onPress={() => {
                const text = speechResult.original.slice(0, ambiguity.start) + candidate.name + speechResult.original.slice(ambiguity.end);
                const next = new MenuRagIndex(menu).correct(text);
                setSpeechResult(next); setOrder(next.text);
                if (!next.ambiguities.length) {submit(next.text);}
              }}/>) }
            </View>)}
          </View>}
          {flow.intent && <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>{flow.confirmed ? '확인한 주문' : '주문이 맞나요?'}</Text>
          {flow.intent.items.map((item, index) => <View key={`${item.menu}-${index}`} style={styles.menuRow}><Text style={styles.body}>{item.menu} · {item.qty}개</Text><Text style={styles.small}>{[item.options.temp === 'hot' ? '따뜻한' : item.options.temp === 'ice' ? '아이스' : '온도 선택 없음', item.options.size, flow.confirmed ? `담기 ${item.qty - (flow.remaining[index] ?? item.qty)}/${item.qty}` : undefined].filter(Boolean).join(' · ')}</Text></View>)}
          <Text style={styles.body}>이용 방법 · {flow.intent.dine || '매장 / 포장 확인 필요'}</Text>
          <Text style={styles.small}>{progress.amount != null ? `기본 메뉴 예상 금액 ${progress.amount.toLocaleString()}원 · 옵션 추가금 별도` : '금액은 키오스크에서 확인해 주세요'}</Text>
          {flow.confirmed ? <Text style={styles.body}>{progress.total}개 중 {progress.completed}개 담기 확인</Text> : <Button title="네, 이 주문으로 안내 시작" onPress={confirmOrder}/>}
        </View>}
        {!flow.confirmed && <View style={styles.card}>
          {isWalkthrough() && <><Text style={styles.small}>임시 주문 예시 · 직접 입력도 가능합니다</Text><Button title="예시 · 아메리카노 1잔 포장" onPress={() => submit('아메리카노 한 잔 포장')}/><Button title="예시 · 따뜻한 아메리카노 2잔 + 아이스 라떼 1잔" onPress={() => submit('따뜻한 아메리카노 두 잔 그리고 아이스 카페라떼 한 잔 포장')}/><Button title="예시 · 없는 메뉴 오류" secondary onPress={() => submit('망고 주스 한 잔')}/></>}
          <Text accessibilityRole="header" style={styles.sectionTitle}>어떤 메뉴를 주문할까요?</Text>
          <Text accessibilityLiveRegion="polite" style={styles.body}>{flow.message}</Text>
          <Button title={listening ? '주문을 듣고 처리하고 있습니다' : isWalkthrough() ? '가상 음성 주문 예시 받기' : '자체 모델로 말로 주문하기'} onPress={() => {listen();}} disabled={listening || !speechModel?.ready || !foreground}/>
          {!speechModel?.ready && <Button title="음성 모델 준비 열기" secondary onPress={() => {setSpeechSettings(true); openPage('settings');}}/>}
          <Button title={isWalkthrough() ? "가상 음성 · 예시 다시 받기" : "기기 음성 인식으로 주문하기"} secondary onPress={() => {listen('system');}} disabled={listening || modelDownloading || modelPreparing || !foreground}/>
            {listening && speechProvider === '자체 음성 인식' && <Button title={finishingSpeech ? '말씀하신 주문을 텍스트로 바꾸고 있습니다' : '말하기 완료'} secondary disabled={finishingSpeech} onPress={() => {setFinishingSpeech(true); Sonkkeut.finishListening();}}/>}
          {listening && <Button title="음성 입력 취소" secondary onPress={() => {generation.current++; setListening(false); Sonkkeut.cancelListening();}}/>}
            <TextInput accessibilityLabel="주문 문장" editable={!listening} placeholder="따뜻한 아메리카노 두 잔 포장" placeholderTextColor={colors.muted} value={order} onChangeText={value => {setSpeechResult(undefined); setOrder(value);}} style={styles.input} multiline/>
          <Button title="입력한 주문 확인" onPress={() => submit(order)} disabled={listening || !order.trim()}/>
        </View>}
      </>}
      {page === 'reader' && <>
        <Text accessibilityRole="header" style={styles.sectionTitle}>카메라에서 읽은 화면</Text>
        <Text style={styles.small}>메뉴를 열기 전에 읽은 화면입니다. 위에서 아래 순서로 표시하며, 읽기 불확실한 글자는 안내 목표로 사용하지 않습니다.</Text>
        <View style={styles.card}>{rows.length ? rows.map(row => <View key={row.id} style={styles.menuRow}><Text style={styles.body}>{row.text}</Text></View>) : <Text style={styles.body}>읽은 글자가 아직 없어요. 메인 화면에서 화면 전체를 비춘 뒤 다시 확인해 주세요.</Text>}</View>
        <Button title="화면 글자 다시 읽기" onPress={() => Sonkkeut.say(readerScreen ? screenReading(readerScreen) : '아직 읽은 글자가 없습니다.')}/>
      </>}
      {page === 'settings' && <>
        <Text accessibilityRole="header" style={styles.sectionTitle}>내게 맞는 설정</Text>
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>글자 크기</Text>
          {(['기본', '크게', '더 크게'] as const).map((label, index) => <Pressable key={label} accessibilityRole="radio" accessibilityLabel={`글자 크기 · ${label}`} accessibilityState={{checked: textSize === index}} style={[styles.choice, textSize === index && styles.choiceSelected]} onPress={() => {const value = index as 0 | 1 | 2; setTextSize(value); savePreference({textSize: value});}}><Text style={[styles.choiceText, textSize === index && styles.choiceSelectedText]}>{textSize === index ? '● ' : '○ '}{label}</Text></Pressable>)}
          <Text style={styles.small}>휴대폰의 글자 크기도 반영합니다. ‘더 크게’는 글자를 굵게 표시합니다.</Text>
        </View>
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>화면 테마</Text>
          {(['dark', 'light'] as const).map(name => <Pressable key={name} accessibilityRole="radio" accessibilityLabel={name === 'dark' ? '어두운 테마' : '밝은 테마'} accessibilityState={{checked: themeName === name}} style={[styles.choice, themeName === name && styles.choiceSelected]} onPress={() => {setThemeName(name); savePreference({theme: name});}}><Text style={[styles.choiceText, themeName === name && styles.choiceSelectedText]}>{themeName === name ? '● ' : '○ '}{name === 'dark' ? '어두운 테마 · 기본' : '밝은 테마'}</Text></Pressable>)}
          <Text style={styles.small}>기본은 남색 배경과 노란색 버튼입니다. 선택한 테마는 다음 실행에도 유지됩니다.</Text>
          <View style={styles.row}><Text style={[styles.body, styles.flex]}>목표 버튼 크게 강조</Text><Switch accessibilityLabel="저시력 목표 버튼 강조" value={lowVision} trackColor={{false: colors.line, true: colors.accent}} thumbColor={colors.ink} onValueChange={value => {setLowVision(value); savePreference({lowVision: value});}}/></View>
        </View>
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>세로 키오스크 촬영</Text>
          <View style={styles.row}><Text style={[styles.body, styles.flex]}>가까이서 화면 전체 담기</Text><Switch accessibilityLabel="넓은 카메라 화각 사용" value={wideCamera} trackColor={{false: colors.line, true: colors.accent}} thumbColor={colors.ink} onValueChange={value => {setWideCamera(value); setWideFailed(false); savePreference({wideCamera: value});}}/></View>
          <Text style={styles.small}>{ultraWide ? '초광각 렌즈를 사용합니다.' : wideFailed ? '초광각을 열지 못해 기본 렌즈로 전환했습니다.' : '지원 기기는 초광각을 사용하고, 그 외에는 기본 렌즈를 사용합니다.'} 영상 가장자리를 자르지 않고 세로 영역에 전체를 표시합니다.</Text>
          <Text style={styles.small}>화면 네 모서리가 모두 보이도록 휴대폰을 가슴 높이에 들고 각도와 거리를 조절해 주세요. 큰 키오스크는 조금 더 떨어져야 할 수 있습니다.</Text>
        </View>
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>음성·진동 안내</Text>
          <View style={styles.row}><Text style={[styles.body, styles.flex]}>자동 음성 안내</Text><Switch accessibilityLabel="자동 음성 안내" value={voiceEnabled} trackColor={{false: colors.line, true: colors.accent}} thumbColor={colors.ink} onValueChange={value => {setVoiceEnabled(value); savePreference({voiceEnabled: value});}}/></View>
          <View style={styles.row}><Text style={[styles.body, styles.flex]}>진동 안내</Text><Switch accessibilityLabel="진동 안내" value={vibrationEnabled} trackColor={{false: colors.line, true: colors.accent}} thumbColor={colors.ink} onValueChange={value => {setVibrationEnabled(value); savePreference({vibrationEnabled: value});}}/></View>
          <Text style={styles.small}>자동 음성을 꺼도 ‘재안내’와 화면 글자 읽기는 사용할 수 있습니다. TalkBack 사용 중에는 자동 음성이 겹치지 않도록 합니다.</Text>
          <Text accessibilityRole="header" style={styles.sectionTitle}>안내 속도</Text>
          {(['느리게', '보통', '빠르게'] as const).map((label, index) => <Pressable key={label} accessibilityRole="radio" accessibilityLabel={`안내 속도 · ${label}`} accessibilityState={{checked: speechSpeed === index}} style={[styles.choice, speechSpeed === index && styles.choiceSelected]} onPress={() => {const value = index as 0 | 1 | 2; setSpeechSpeed(value); savePreference({speechSpeed: value});}}><Text style={[styles.choiceText, speechSpeed === index && styles.choiceSelectedText]}>{speechSpeed === index ? '● ' : '○ '}{label}</Text></Pressable>)}
        </View>
        <View style={styles.card}>
          <Button title={speechSettings ? '음성 모델 설정 접기' : `음성 모델 ${speechModel?.ready ? '준비 완료' : '준비하기'}`} secondary onPress={() => setSpeechSettings(!speechSettings)}/>
          {speechSettings && <>
            <Text accessibilityLiveRegion="polite" style={styles.body}>{modelMessage}</Text>
            {modelDownloading && modelProgress && <Text style={styles.small}>{modelProgress.stage === 'downloading' ? modelProgress.total_bytes > 0 ? `다운로드 ${Math.min(100, Math.floor(modelProgress.bytes / modelProgress.total_bytes * 100))}%` : `다운로드 ${Math.floor(modelProgress.bytes / 1000000)}MB` : '다운로드 파일 확인·모델 준비 중'}</Text>}
            {!speechModel?.ready && !modelDownloading && <Button title={speechModel?.installed ? '음성 모델 준비 다시 시도' : '자체 음성 모델 받기 (약 485MB)'} onPress={() => {downloadSpeech();}} disabled={listening || modelPreparing || !speechModel}/>}
            {modelDownloading && <Button title="모델 다운로드 중지" secondary onPress={() => Sonkkeut.cancelSpeechModelDownload()}/>}
            <Text style={styles.small}>첫 다운로드에 인터넷과 약 1GB 여유 공간이 필요합니다. 준비 후 기기 안에서 인식합니다.</Text>
          </>}
          <Button title={settings ? '서버·매장 설정 접기' : '서버·매장 설정'} secondary onPress={() => setSettings(!settings)} disabled={!serverConfig}/>
          {settings && <>
            <Text style={styles.small}>배포 서버에는 자동으로 연결됩니다. 다른 매장 설정은 주문 안내 종료 후 바꿀 수 있습니다.</Text>
            <TextInput accessibilityLabel="백엔드 주소" editable={!running} autoCapitalize="none" autoCorrect={false} value={server} onChangeText={setServer} placeholder={BACKEND_URL} placeholderTextColor={colors.muted} style={styles.input}/>
            <TextInput accessibilityLabel="매장 코드" editable={!running} autoCapitalize="characters" autoCorrect={false} value={code} onChangeText={setCode} placeholder="매장 코드 6자리 (선택)" placeholderTextColor={colors.muted} style={styles.input}/>
            <Button title="설정 저장·자동 연결" onPress={() => {saveServer();}} disabled={running}/>
          </>}
          <View style={styles.row}><Text style={[styles.body, styles.flex]}>익명 통계 전송</Text><Switch accessibilityLabel="익명 통계 전송 동의" disabled={isWalkthrough()} value={statsEnabled} trackColor={{false: colors.line, true: colors.accent}} thumbColor={colors.ink} onValueChange={value => {
            statsEnabledRef.current = value; setStatsEnabled(value); savePreference({statsEnabled: value});
            if (!value) {clearUsage().catch(() => {});} else if (online) {flushUsage().catch(() => {});}
          }}/></View>
          <Text style={styles.small}>영상·음성·주문 문장·위치·기기 식별자는 보내지 않습니다. 동의하면 성공 여부와 소요 시간만 전송합니다.</Text>
          <Button title="앱 권한 설정 열기" secondary onPress={() => {Linking.openSettings();}}/>
          {settingsMessage !== '' && <Text accessibilityLiveRegion="polite" style={styles.body}>{settingsMessage}</Text>}
          <Text style={styles.small}>앱 {APP_VERSION} · AI {MODEL_VERSION}</Text>
        </View>
      </>}
    </ScrollView>}
  {isWalkthrough() && <Walkthrough flow={flow} running={running} paused={paused} page={page} restart={end}/>}
  </SafeAreaView></ThemeContext.Provider>;
}
