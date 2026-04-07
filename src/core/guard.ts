import { EventEmitter } from 'events';
import { scanPorts, PortInfo } from './scanner';
import { killPort } from './killer';

export interface GuardEvent {
  type: 'port_appeared' | 'port_killed' | 'port_disappeared' | 'port_changed';
  port: number;
  info: PortInfo | null;
  timestamp: string;
}

export interface GuardOptions {
  ports: number[];
  autoKill?: boolean;
  allowedProcesses?: string[];
  intervalMs?: number;
  onEvent?: (event: GuardEvent) => void;
}

export class PortGuard extends EventEmitter {
  private options: Required<GuardOptions>;
  private timer: NodeJS.Timeout | null = null;
  private snapshot: Map<number, PortInfo> = new Map();
  private running = false;
  private eventLog: GuardEvent[] = [];

  constructor(options: GuardOptions) {
    super();
    this.options = {
      autoKill: false,
      allowedProcesses: [],
      intervalMs: 1500,
      onEvent: () => {},
      ...options,
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    // Initial snapshot
    this.updateSnapshot(true);

    this.timer = setInterval(() => {
      this.updateSnapshot(false);
    }, this.options.intervalMs);

    console.log(`[Guard] Watching ports: ${this.options.ports.join(', ')}`);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
    console.log('[Guard] Stopped.');
  }

  isRunning(): boolean {
    return this.running;
  }

  getEventLog(): GuardEvent[] {
    return [...this.eventLog];
  }

  getCurrentState(): Map<number, PortInfo> {
    return new Map(this.snapshot);
  }

  private updateSnapshot(initial: boolean): void {
    const current = scanPorts(this.options.ports);
    const currentMap = new Map(current.map(p => [p.port, p]));

    if (initial) {
      this.snapshot = currentMap;
      return;
    }

    // Detect new ports
    for (const [port, info] of currentMap) {
      if (!this.snapshot.has(port)) {
        const event = this.makeEvent('port_appeared', port, info);
        this.emit('event', event);
        this.options.onEvent(event);

        if (this.options.autoKill) {
          const isAllowed = this.options.allowedProcesses.some(
            p => info.process?.toLowerCase().includes(p.toLowerCase())
          );
          if (!isAllowed) {
            killPort(port);
            const killEvent = this.makeEvent('port_killed', port, info);
            this.emit('event', killEvent);
            this.options.onEvent(killEvent);
          }
        }
      }
    }

    // Detect disappeared ports
    for (const [port, info] of this.snapshot) {
      if (!currentMap.has(port)) {
        const event = this.makeEvent('port_disappeared', port, info);
        this.emit('event', event);
        this.options.onEvent(event);
      }
    }

    this.snapshot = currentMap;
  }

  private makeEvent(type: GuardEvent['type'], port: number, info: PortInfo | null): GuardEvent {
    const event: GuardEvent = {
      type,
      port,
      info,
      timestamp: new Date().toISOString(),
    };
    this.eventLog.push(event);
    if (this.eventLog.length > 500) this.eventLog.shift();
    return event;
  }
}

// Singleton guard instances
const guards = new Map<string, PortGuard>();

export function startGuard(key: string, options: GuardOptions): PortGuard {
  if (guards.has(key)) {
    guards.get(key)!.stop();
  }
  const guard = new PortGuard(options);
  guard.start();
  guards.set(key, guard);
  return guard;
}

export function stopGuard(key: string): void {
  guards.get(key)?.stop();
  guards.delete(key);
}

export function getAllGuards(): Map<string, PortGuard> {
  return guards;
}
