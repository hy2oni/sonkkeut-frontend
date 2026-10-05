import React from 'react';
import {Platform, Pressable} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import App from '../App';
import {enableWalkthrough} from '../src/walkthroughRuntime';
jest.mock('react-native-sonkkeut', () => ({
  get MenuRagIndex() {return require('react-native-sonkkeut/src/menuRag').MenuRagIndex;}, Sonkkeut: {}, useSonkkeut: jest.fn(),
}));
jest.mock('react-native-vision-camera', () => ({Camera: Object.assign(() => null, {requestCameraPermission: jest.fn()}), useCameraDevice: () => undefined, useCameraFormat: () => undefined}));
jest.mock('../src/useBackendConnection', () => ({useBackendConnection: () => ({connection: {status: 'checking'}, reconnect: jest.fn()})}));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

test('APK test mode traverses original screens without camera, microphone, native AI or server', async () => {
  enableWalkthrough(); jest.replaceProperty(Platform, 'OS', 'android');
  let root: renderer.ReactTestRenderer;
  await act(async () => {root = renderer.create(<App/>);});
  async function tap(label: string) {
    const btn = root!.root.findAllByType(Pressable).find(p => p.props.accessibilityLabel === label);
    expect(btn).toBeDefined(); expect(btn!.props.disabled).not.toBe(true);
    await act(async () => {btn!.props.onPress();});
  }
  const snapshot = () => JSON.stringify(root!.toJSON());
  await tap('손끝길 시작'); await tap('다음 · 화면 인식 성공');
  expect(snapshot()).toContain('어떤 메뉴를 주문할까요?');
  await tap('예시 · 아메리카노 1잔 포장');
  expect(snapshot()).toContain('주문이 맞나요?');
  await tap('네, 이 주문으로 안내 시작'); await tap('다음 · 화면 인식 성공');
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 3; j++) {await tap('다음 · 손끝 이동 / 누르세요');}
    await tap('다음 · 누름 성공 확인');
  }
  expect(snapshot()).toContain('결제 화면에 도착했어요');
  expect(snapshot()).toContain('담긴 수량: ');
  await tap('처음부터 체험'); expect(snapshot()).toContain('손끝길 시작');
  await act(async () => root!.unmount()); jest.restoreAllMocks();
});
