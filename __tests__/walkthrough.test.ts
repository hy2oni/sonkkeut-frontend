import {OrderFlow, parseOrder} from '../src/domain';
import {DEFAULT_MENU} from '../src/backend';
import {VirtualKiosk} from '../src/Walkthrough';
jest.mock('../src/walkthroughRuntime', () => ({emitWalkthrough: jest.fn()}));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

function begin(text: string) {
  const flow = new OrderFlow(); const kiosk = new VirtualKiosk();
  flow.acceptScreen(kiosk.screen()); flow.submit(parseOrder(text, DEFAULT_MENU)); flow.confirm();
  return {flow, kiosk};
}
function pressSuccess(flow: OrderFlow, kiosk: VirtualKiosk) {
  expect(flow.state).toBe('S4'); flow.press();
  const result = kiosk.succeed(flow);
  flow.acceptScreen(result.structure!); flow.verdict(result.verdict!);
}
test('test inputs drive the real planner through three items and payment without skipping confirmation', () => {
  const {flow, kiosk} = begin('따뜻한 아메리카노 두 잔 그리고 아이스 카페라떼 한 잔 포장');
  let n = 0;
  while (flow.state !== 'S6' && n++ < 30) {pressSuccess(flow, kiosk);}
  expect(flow.state).toBe('S6'); expect(kiosk.count).toBe(3); expect(kiosk.total).toBe(14000);
  expect(flow.remaining).toEqual([0, 0]);
});
test('uncertain add is not silently repeated on recovery', () => {
  const {flow, kiosk} = begin('아메리카노 한 잔 포장');
  pressSuccess(flow, kiosk); pressSuccess(flow, kiosk);
  expect(flow.action?.role).toBe('add'); flow.press();
  flow.verdict({result: 'uncertain', reason: 'test', speak: '확인 필요'});
  flow.recover(); flow.acceptScreen(kiosk.screen());
  expect(flow.state).toBe('SE'); expect(flow.message).toContain('중복'); expect(kiosk.count).toBe(0);
});
test('early payment cannot count as completed and wrong total blocks checkout', () => {
  const {flow, kiosk} = begin('아메리카노 한 잔 포장');
  kiosk.type = 'payment'; flow.acceptScreen(kiosk.screen()); expect(flow.state).toBe('SE');
  const next = begin('아메리카노 한 잔 포장');
  for (let i = 0; i < 3; i++) {pressSuccess(next.flow, next.kiosk);}
  next.kiosk.type = 'cart'; next.kiosk.total += 1000;
  next.flow.acceptScreen(next.kiosk.screen());
  expect(next.flow.state).toBe('SE'); expect(next.flow.message).toContain('금액');
});
