import chalk from 'chalk';
import Table from 'cli-table3';
import { PortInfo } from '../core/scanner';
import { DockerContainer } from '../core/docker';
import { Pm2Process, formatMemory, formatUptime } from '../core/pm2';

export function printPortsTable(ports: PortInfo[]): void {
  if (ports.length === 0) {
    console.log(chalk.gray('  No ports in use.'));
    return;
  }

  const table = new Table({
    head: [
      chalk.cyan('PORT'),
      chalk.cyan('PID'),
      chalk.cyan('PROCESS'),
      chalk.cyan('PROTO'),
      chalk.cyan('STATE'),
      chalk.cyan('SOURCE'),
      chalk.cyan('COMMAND'),
    ],
    style: { head: [], border: ['gray'] },
    colWidths: [8, 8, 18, 7, 10, 10, 40],
  });

  for (const p of ports) {
    const sourceColor = p.source === 'windows' ? chalk.yellow : chalk.green;
    table.push([
      chalk.bold.white(String(p.port)),
      chalk.dim(String(p.pid ?? '—')),
      chalk.white(p.process ?? '—'),
      chalk.dim(p.protocol),
      stateLabel(p.state),
      sourceColor(p.source),
      chalk.dim((p.command ?? '—').substring(0, 38)),
    ]);
  }

  console.log(table.toString());
}

export function printDockerTable(containers: DockerContainer[]): void {
  if (containers.length === 0) {
    console.log(chalk.gray('  No Docker containers found.'));
    return;
  }

  const table = new Table({
    head: [
      chalk.cyan('ID'),
      chalk.cyan('NAME'),
      chalk.cyan('IMAGE'),
      chalk.cyan('STATE'),
      chalk.cyan('PORTS'),
      chalk.cyan('UPTIME'),
    ],
    style: { head: [], border: ['gray'] },
    colWidths: [14, 20, 22, 12, 24, 16],
  });

  for (const c of containers) {
    const ports = c.ports
      .filter(p => p.hostPort)
      .map(p => `${p.hostPort}→${p.containerPort}`)
      .join(', ') || chalk.dim('none');

    table.push([
      chalk.dim(c.id),
      chalk.bold.white(c.name),
      chalk.dim(c.image.substring(0, 20)),
      containerStateLabel(c.state),
      ports,
      chalk.dim(c.uptime ?? '—'),
    ]);
  }

  console.log(table.toString());
}

export function printPm2Table(processes: Pm2Process[]): void {
  if (processes.length === 0) {
    console.log(chalk.gray('  No PM2 processes found.'));
    return;
  }

  const table = new Table({
    head: [
      chalk.cyan('ID'),
      chalk.cyan('NAME'),
      chalk.cyan('PID'),
      chalk.cyan('STATUS'),
      chalk.cyan('CPU'),
      chalk.cyan('MEM'),
      chalk.cyan('RESTARTS'),
      chalk.cyan('UPTIME'),
      chalk.cyan('PORT'),
    ],
    style: { head: [], border: ['gray'] },
  });

  for (const p of processes) {
    table.push([
      chalk.dim(String(p.id)),
      chalk.bold.white(p.name),
      chalk.dim(String(p.pid ?? '—')),
      pm2StatusLabel(p.status),
      `${p.cpu.toFixed(1)}%`,
      formatMemory(p.memory),
      p.restarts > 0 ? chalk.yellow(String(p.restarts)) : chalk.dim('0'),
      chalk.dim(formatUptime(p.uptime)),
      p.port ? chalk.cyan(String(p.port)) : chalk.dim('—'),
    ]);
  }

  console.log(table.toString());
}

export function printHeader(title: string): void {
  const line = '─'.repeat(60);
  console.log('\n' + chalk.cyan(line));
  console.log(chalk.bold.white(`  ${title}`));
  console.log(chalk.cyan(line));
}

export function printSuccess(msg: string): void {
  console.log(chalk.green('✓') + ' ' + msg);
}

export function printError(msg: string): void {
  console.log(chalk.red('✗') + ' ' + msg);
}

export function printWarning(msg: string): void {
  console.log(chalk.yellow('⚠') + ' ' + msg);
}

export function printInfo(msg: string): void {
  console.log(chalk.blue('ℹ') + ' ' + msg);
}

function stateLabel(state: string): string {
  if (state === 'LISTEN' || state === 'LISTENING') return chalk.green('LISTEN');
  if (state === 'ESTABLISHED') return chalk.yellow('ESTAB');
  return chalk.dim(state);
}

function containerStateLabel(state: string): string {
  switch (state) {
    case 'running': return chalk.green('running');
    case 'paused': return chalk.yellow('paused');
    case 'restarting': return chalk.cyan('restarting');
    case 'exited': return chalk.red('exited');
    case 'dead': return chalk.red('dead');
    default: return chalk.dim(state);
  }
}

function pm2StatusLabel(status: string): string {
  switch (status) {
    case 'online': return chalk.green('online');
    case 'stopped': return chalk.gray('stopped');
    case 'stopping': return chalk.yellow('stopping');
    case 'errored': return chalk.red('errored');
    default: return chalk.dim(status);
  }
}

export function printBanner(): void {
  console.log(chalk.cyan(`
  ██████╗  ██████╗ ██████╗ ████████╗███╗   ███╗ █████╗ ███████╗████████╗███████╗██████╗ 
  ██╔══██╗██╔═══██╗██╔══██╗╚══██╔══╝████╗ ████║██╔══██╗██╔════╝╚══██╔══╝██╔════╝██╔══██╗
  ██████╔╝██║   ██║██████╔╝   ██║   ██╔████╔██║███████║███████╗   ██║   █████╗  ██████╔╝
  ██╔═══╝ ██║   ██║██╔══██╗   ██║   ██║╚██╔╝██║██╔══██║╚════██║   ██║   ██╔══╝  ██╔══██╗
  ██║     ╚██████╔╝██║  ██║   ██║   ██║ ╚═╝ ██║██║  ██║███████║   ██║   ███████╗██║  ██║
  ╚═╝      ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚═╝     ╚═╝╚═╝  ╚═╝╚══════╝   ╚═╝   ╚══════╝╚═╝  ╚═╝
  `));
  console.log(chalk.dim('  Port & Process Manager for WSL/Ubuntu\n'));
}
