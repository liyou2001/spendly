import { afterEach, describe, expect, it, vi } from 'vitest';

import { confirmAction } from './confirm';

// Vitest lifts both of these above the imports, so confirm.ts gets the stand-in react-native.
const native = vi.hoisted(() => ({ Platform: { OS: 'web' }, Alert: { alert: vi.fn() } }));
vi.mock('react-native', () => native);

const ask = (onConfirm: () => void) =>
  confirmAction({
    title: 'Void this expense?',
    message: 'This can’t be undone.',
    confirmLabel: 'Void expense',
    onConfirm,
  });

afterEach(() => {
  vi.unstubAllGlobals();
  native.Alert.alert.mockReset();
  native.Platform.OS = 'web';
});

describe('confirmAction', () => {
  it('on the web, asks with the browser’s confirm box and acts on OK', () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal('window', { confirm });
    const onConfirm = vi.fn();
    ask(onConfirm);
    expect(confirm).toHaveBeenCalledWith('Void this expense?\n\nThis can’t be undone.');
    expect(onConfirm).toHaveBeenCalledOnce();
    // Alert.alert does nothing on the web, so it's never what's relied on there.
    expect(native.Alert.alert).not.toHaveBeenCalled();
  });

  it('on the web, does nothing on Cancel', () => {
    vi.stubGlobal('window', { confirm: () => false });
    const onConfirm = vi.fn();
    ask(onConfirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('on a phone, shows an alert whose destructive button acts', () => {
    native.Platform.OS = 'ios';
    const onConfirm = vi.fn();
    ask(onConfirm);
    const [title, message, buttons] = native.Alert.alert.mock.calls[0] as [
      string,
      string,
      { text: string; style: string; onPress?: () => void }[],
    ];
    expect([title, message]).toEqual(['Void this expense?', 'This can’t be undone.']);
    expect(buttons.map((b) => [b.text, b.style])).toEqual([
      ['Cancel', 'cancel'],
      ['Void expense', 'destructive'],
    ]);
    expect(onConfirm).not.toHaveBeenCalled();
    buttons[1]?.onPress?.();
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
