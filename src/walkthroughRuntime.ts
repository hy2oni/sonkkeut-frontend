import {useEffect, useRef, useState} from 'react';
import {MenuRagIndex, Sonkkeut as Native, useSonkkeut as useNative} from 'react-native-sonkkeut';
import type {ScreenStructure, SonkkeutResult, UseSonkkeutOptions} from 'react-native-sonkkeut';
export {MenuRagIndex};

// Enabled once by the test APK entry point; never switched during a mounted session.
let enabled = false;
export const enableWalkthrough = () => {enabled = true;};
export const isWalkthrough = () => enabled;
let sink: ((result: SonkkeutResult) => void) | undefined;
let speech = '따뜻한 아메리카노 두 잔 포장';
export const setExampleSpeech = (text: string) => {speech = text;};
export function emitWalkthrough(result: SonkkeutResult) {sink?.(result);}

const simulated: Record<string, (...args: any[]) => any> = {
  setTarget: async () => true,
  getSpeechModelStatus: async () => ({ready: true, installed: true}),
  addModelDownloadListener: () => () => {},
  listen: async () => speech,
  correctMenuSpeech: async (text, _scope, menu) => new MenuRagIndex(menu).correct(text),
};
export const Sonkkeut: typeof Native = new Proxy({} as typeof Native, {
  get(_target, property) {
    if (!enabled) {return Native[property as keyof typeof Native];}
    return simulated[String(property)] ?? (() => {});
  },
});

function useSimulated(options: UseSonkkeutOptions = {}): ReturnType<typeof useNative> {
  const callbacks = useRef(options); callbacks.current = options;
  const [result, setResult] = useState<SonkkeutResult | null>(null);
  const [screen, setScreen] = useState<ScreenStructure | null>(null);
  useEffect(() => {
    sink = value => {
      if (!callbacks.current.active) {return;}
      setResult(value); callbacks.current.onResult?.(value);
      if (value.structure) {setScreen(value.structure); callbacks.current.onScreen?.(value.structure);}
      if (value.event) {callbacks.current.onEvent?.(value.event);}
      if (value.verdict) {callbacks.current.onVerdict?.(value.verdict);}
    };
    return () => {sink = undefined;};
  }, []);
  return {ready: true, error: null, result, screen, frameProcessor: undefined as any,
    setTarget: Sonkkeut.setTarget, setTargetAt: Sonkkeut.setTargetAt,
    setTargetAtPreview: Sonkkeut.setTargetAtPreview, clearTarget: Sonkkeut.clearTarget,
    requestKeyframe: Sonkkeut.requestKeyframe};
}
export function useSonkkeut(options: UseSonkkeutOptions = {}) {
  const useRuntime = enabled ? useSimulated : useNative;
  return useRuntime(options);
}
