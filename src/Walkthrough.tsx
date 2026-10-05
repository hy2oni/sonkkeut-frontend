import React, {useRef, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import type {GuidanceEvent, ScreenElement, ScreenStructure, SonkkeutResult} from 'react-native-sonkkeut';
import {OrderFlow} from './domain';
import {DEFAULT_MENU} from './backend';
import {emitWalkthrough} from './walkthroughRuntime';

export class VirtualKiosk {
  keyframe = 0;
  type = 'method';
  count = 0;
  total = 0;
  selected: string[] = [];
  item = '아메리카노';
  stage = 0;
  target = '';
  screen(): ScreenStructure {
    const element = (id: string, text: string, kind: ScreenElement['kind'] = 'button'): ScreenElement =>
      ({id, text, kind, box: [0.1, 0.1, 0.9, 0.8], conf: 1, conf_ocr: 1});
    const elements = this.type === 'method' ? [element('takeout', '포장'), element('dine', '매장')]
      : this.type === 'menu' ? [...DEFAULT_MENU.map(m => ({...element(m.name, m.name, 'menu'), price: m.price ?? undefined})), element('cart', '장바구니')]
      : this.type === 'option' ? [element('item', this.item, 'menu'), element('hot', 'HOT'), element('ice', 'ICE'), element('large', '라지'), element('small', '스몰'), element('add', '담기')]
      : this.type === 'cart' ? [element('checkout', '결제하기'), element('back', '계속주문')]
      : [];
    return {screen_type: this.type, keyframe_id: ++this.keyframe, cart_count: this.count,
      total_price: this.total, selected: [...this.selected], elements};
  }
  result(extra: Partial<SonkkeutResult> = {}): SonkkeutResult {
    return {found: true, keyframe: false, keyframe_id: this.keyframe, timings: {}, ...extra};
  }
  succeed(flow: OrderFlow): SonkkeutResult {
    const action = flow.action;
    if (flow.state !== 'S5' || !action) {throw new Error('누름 안내 후에만 결과를 만들 수 있습니다.');}
    if (action.role === 'menu') {this.item = flow.intent!.items[flow.remaining.findIndex(n => n > 0)].menu; this.type = 'option'; this.selected = [];}
    else if (action.role === 'option') {this.selected.push(action.target.id);}
    else if (action.role === 'add') {this.count++; this.total += DEFAULT_MENU.find(m => m.name === this.item)?.price ?? 0; this.type = 'menu'; this.selected = [];}
    else {this.type = action.expect.screen_type ?? 'menu';}
    this.stage = 0;
    const structure = this.screen();
    return this.result({keyframe: true, structure, verdict: {result: 'success', reason: 'test_fixture', speak: action.role === 'add' ? '담겼습니다 (가상 결과)' : '눌렸습니다 (가상 결과)'}});
  }
}

export const virtualScreenNames: Record<string, string> = {method: '매장 / 포장', menu: '메뉴 선택', option: '옵션 선택', cart: '장바구니', payment: '결제'};
const states: Record<string, string> = {S0: '시작 대기', S1: '화면 찾기', S2: '화면 재확인', S3: '주문 입력·확인', S4: '손끝 안내', S5: '누름 결과 대기', SE: '복구 필요', S6: '결제 도착·종료'};
export function Walkthrough({flow, running, paused, page, restart}: {flow: OrderFlow; running: boolean; paused: boolean; page: string; restart: () => void}) {
  const kiosk = useRef(new VirtualKiosk());
  const [log, setLog] = useState('① 손끝길 시작을 누르세요. ② 이 패널의 다음 이벤트를 눌러 진행하세요.');
  const [more, setMore] = useState(false);
  const k = kiosk.current;
  const active = running && !paused && page === 'home' && flow.state !== 'S6';
  function emit(result: SonkkeutResult, text: string) {setLog(text); emitWalkthrough(result);}
  function next() {
    if (!active) {return;}
    if (flow.state === 'S5') {emit(k.succeed(flow), '가상 누름 성공 → 원래 앱의 결과 확인·다음 목표 선택 실행'); return;}
    if (flow.state !== 'S4' || !flow.action) {const structure = k.screen(); emit(k.result({structure, keyframe: true}), '가상 화면 인식 → 주문 입력 또는 목표 안내'); return;}
    if (k.target !== flow.action.target.id) {k.stage = 0; k.target = flow.action.target.id;}
    const events: GuidanceEvent[] = [
      {type: 'direction', dir: 'right', distance: 'far', speak: '오른쪽으로 이동해 주세요', vibe_hz: 2},
      {type: 'direction', dir: 'right', distance: 'near', speak: '오른쪽으로 조금', vibe_hz: 6},
      {type: 'press', distance: 'reach', speak: '지금 누르세요', vibe_hz: 10},
    ];
    const event = {...events[Math.min(k.stage++, 2)], target_id: flow.action.target.id};
    emit(k.result({event}), `가상 손끝 이벤트 → ${event.speak}`);
  }
  const label = flow.state === 'S5' ? '다음 · 누름 성공 확인' : flow.state === 'S4' ? '다음 · 손끝 이동 / 누르세요' : '다음 · 화면 인식 성공';
  const button = (title: string, onPress: () => void, disabled = false) => <Pressable key={title} accessibilityRole="button" accessibilityLabel={title} accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={[s.button, disabled && s.disabled]}><Text style={s.buttonText}>{title}</Text></Pressable>;
  return <View style={s.panel}>
    <Text style={s.heading}>임시 이벤트 체험 · 실제 인식/결제 아님</Text>
    <ScrollView style={s.scroll} nestedScrollEnabled>
      <Text style={s.text}>앱 상태: {states[flow.state]} / 가상 화면: {virtualScreenNames[k.type]} / 담긴 수량: {k.count}</Text>
      <Text accessibilityLiveRegion="polite" style={s.text}>{log}</Text>
      {!active && <Text style={s.text}>{!running ? '먼저 위의 손끝길 시작을 누르세요.' : page === 'order' ? '위 주문 화면에서 예시를 선택하거나 입력한 뒤 주문을 확인하세요.' : flow.state === 'S6' ? '완료! 처음부터 체험으로 다른 주문을 해보세요.' : '메인으로 돌아와 안내 계속을 누르세요.'}</Text>}
      {button(label, next, !active)}
      {button(more ? '오류 이벤트 접기' : '오류 이벤트 펼치기', () => setMore(!more))}
      {more && <>
        {button('손끝 사라짐', () => emit(k.result({event: {type: 'no_hand', target_id: flow.action?.target.id, speak: '검지를 화면 앞으로 가져와 주세요', vibe_hz: 0}}), '손끝 상실 안내'), !active || flow.state !== 'S4')}
        {button('검지 접힘', () => emit(k.result({event: {type: 'point', target_id: flow.action?.target.id, speak: '검지 하나만 펴서 가리켜 주세요', vibe_hz: 0}}), '검지 자세 안내'), !active || flow.state !== 'S4')}
        {button('화면 놓침', () => emit(k.result({found: false}), '화면 상실 → 안내 계속을 누른 뒤 다음 이벤트로 재인식'), !active)}
        {button('누름 실패', () => {k.stage = 0; emit(k.result({verdict: {result: 'fail', reason: 'no_change', speak: '버튼이 눌리지 않았습니다. 다시 확인해 주세요.'}}), '누름 실패 → 안내 계속 후 다시 시도');}, !active || flow.state !== 'S5')}
        {button('누름 결과 불확실', () => {k.stage = 0; emit(k.result({verdict: {result: 'uncertain', reason: 'test_uncertain', speak: '결과를 확인하지 못했습니다.'}}), '담기 중이었다면 중복 방지로 멈춥니다. 처음부터 체험으로 초기화 가능');}, !active || flow.state !== 'S5')}
        {button('장바구니 금액 오류', () => {k.type = 'cart'; k.total += 1000; emit(k.result({structure: k.screen(), keyframe: true}), '가상 총액 +1,000원. 모든 메뉴를 담은 상태에서 금액 불일치 확인');}, !active || flow.state === 'S5')}
        {button('결제 화면 조기 진입', () => {k.type = 'payment'; emit(k.result({structure: k.screen(), keyframe: true}), '미완료 주문이면 결제 도착을 정상 완료로 인정하지 않습니다.');}, !active || flow.state === 'S5')}
      </>}
      {button('처음부터 체험', () => {kiosk.current = new VirtualKiosk(); setLog('초기화했습니다. 손끝길 시작 → 다음 이벤트를 누르세요.'); restart();})}
    </ScrollView>
  </View>;
}
const s = StyleSheet.create({panel: {backgroundColor: '#243144', borderTopWidth: 3, borderColor: '#ffdf38', padding: 8}, scroll: {maxHeight: 200}, heading: {color: '#ffdf38', fontSize: 15, fontWeight: '800'}, text: {color: '#ffffff', fontSize: 14, marginVertical: 4}, button: {backgroundColor: '#ffdf38', borderRadius: 8, minHeight: 44, justifyContent: 'center', padding: 8, marginVertical: 3}, buttonText: {color: '#111827', fontSize: 15, fontWeight: '700', textAlign: 'center'}, disabled: {opacity: 0.4}});
