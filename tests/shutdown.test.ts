import { pino } from 'pino';
import { afterEach, describe, expect, it } from 'vitest';

import { registerShutdownHandlers, type ClosableServer } from '../src/utils/shutdown.js';

const silentLogger = pino({ level: 'silent' });

/** Records close calls and lets a test control when the drain completes. */
class FakeServer implements ClosableServer {
  closeCalls = 0;
  private pending: ((error?: Error) => void) | undefined;

  constructor(private readonly mode: 'immediate' | 'manual' | 'error' = 'immediate') {}

  close(callback: (error?: Error) => void): this {
    this.closeCalls += 1;

    if (this.mode === 'immediate') callback();
    else if (this.mode === 'error') callback(new Error('close failed'));
    else this.pending = callback;

    return this;
  }

  finishClose(error?: Error): void {
    this.pending?.(error);
  }
}

let unregister: (() => void) | undefined;

afterEach(() => {
  // Never leave a listener attached to the shared process object.
  unregister?.();
  unregister = undefined;
});

describe('registerShutdownHandlers', () => {
  it.each([['SIGTERM'], ['SIGINT']] as const)('drains and exits 0 on %s', (signal) => {
    const server = new FakeServer();
    const codes: number[] = [];

    unregister = registerShutdownHandlers(server, silentLogger, {
      exit: (code) => codes.push(code),
    });

    process.emit(signal);

    expect(server.closeCalls).toBe(1);
    expect(codes).toEqual([0]);
  });

  it('ignores a second signal so one drain cannot start twice', () => {
    const server = new FakeServer('manual');
    const codes: number[] = [];

    unregister = registerShutdownHandlers(server, silentLogger, {
      exit: (code) => codes.push(code),
    });

    process.emit('SIGTERM');
    process.emit('SIGINT');
    process.emit('SIGTERM');

    expect(server.closeCalls).toBe(1);

    server.finishClose();
    expect(codes).toEqual([0]);
  });

  it('exits 1 when the server fails to close', () => {
    const server = new FakeServer('error');
    const codes: number[] = [];

    unregister = registerShutdownHandlers(server, silentLogger, {
      exit: (code) => codes.push(code),
    });

    process.emit('SIGTERM');

    expect(codes).toEqual([1]);
  });

  it('force-exits 1 when the drain outlives the grace period', async () => {
    const server = new FakeServer('manual');
    const codes: number[] = [];

    unregister = registerShutdownHandlers(server, silentLogger, {
      gracePeriodMs: 5,
      exit: (code) => codes.push(code),
    });

    process.emit('SIGTERM');
    expect(codes).toEqual([]);

    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(codes).toEqual([1]);
  });

  it('does not force-exit when the drain completes in time', async () => {
    const server = new FakeServer('manual');
    const codes: number[] = [];

    unregister = registerShutdownHandlers(server, silentLogger, {
      gracePeriodMs: 50,
      exit: (code) => codes.push(code),
    });

    process.emit('SIGTERM');
    server.finishClose();

    await new Promise((resolve) => setTimeout(resolve, 80));

    // The force-exit timer must have been cleared by the successful drain.
    expect(codes).toEqual([0]);
  });

  it('detaches its listeners when unregistered', () => {
    const server = new FakeServer();
    const before = process.listenerCount('SIGTERM');

    const detach = registerShutdownHandlers(server, silentLogger, { exit: () => {} });
    expect(process.listenerCount('SIGTERM')).toBe(before + 1);

    detach();
    expect(process.listenerCount('SIGTERM')).toBe(before);
  });
});
