#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import {
  scanPorts,
  getPortInfo,
} from './core/scanner';
import { killPort, killPid, getRestartHistory, restartPort } from './core/killer';
import { startGuard, stopGuard, getAllGuards } from './core/guard';
import { getContainers, isDockerAvailable, stopContainer, startContainer, restartContainer, getContainerLogs } from './core/docker';
import { getPm2Processes, isPm2Available, pm2Action, getPm2Logs } from './core/pm2';
import { loadConfig, initConfig, startServices, stopServices, getServiceStatus } from './core/orchestrator';
import { detectWsl } from './core/wsl';
import { startDashboard } from './dashboard/server';
import {
  printPortsTable,
  printDockerTable,
  printPm2Table,
  printHeader,
  printSuccess,
  printError,
  printWarning,
  printInfo,
  printBanner,
} from './utils/display';

const program = new Command();

program
  .name('portmaster')
  .alias('pm')
  .description('Port & process manager for WSL/Ubuntu')
  .version('1.0.0');

// ── port-kill: portmaster <port> ──────────────────────────────────────
program
  .argument('[ports...]', 'Kill process(es) on these ports')
  .option('-s, --safe', 'Ask for confirmation before killing')
  .option('-l, --list', 'List all ports in use')
  .option('--list-all', 'List ports + docker + PM2 combined')
  .action(async (ports: string[], opts) => {
    if (opts.list || opts.listAll) {
      await cmdList(opts.listAll);
      return;
    }
    if (ports.length > 0) {
      for (const p of ports) {
        const port = parseInt(p);
        if (isNaN(port)) { printError(`Invalid port: ${p}`); continue; }
        await cmdKillPort(port, opts.safe);
      }
      return;
    }
    // No args — show banner + quick status
    printBanner();
    await cmdList(false);
  });

// ── list ──────────────────────────────────────────────────────────────
program
  .command('list')
  .alias('ls')
  .description('List ports, Docker containers, and PM2 processes')
  .option('-p, --ports', 'Show only ports')
  .option('-d, --docker', 'Show only Docker')
  .option('--pm2', 'Show only PM2')
  .action(async (opts) => {
    const showAll = !opts.ports && !opts.docker && !opts.pm2;
    if (opts.ports || showAll) await cmdList(showAll);
    if (opts.docker) { printHeader('Docker Containers'); printDockerTable(getContainers(true)); }
    if (opts.pm2) { printHeader('PM2 Processes'); printPm2Table(getPm2Processes()); }
  });

// ── kill ──────────────────────────────────────────────────────────────
program
  .command('kill <port>')
  .description('Kill process on a specific port')
  .option('-s, --safe', 'Confirm before killing')
  .action(async (port: string, opts) => {
    await cmdKillPort(parseInt(port), opts.safe);
  });

// ── guard ─────────────────────────────────────────────────────────────
program
  .command('guard')
  .description('Watch port(s) and optionally kill intruders')
  .requiredOption('-p, --port <ports>', 'Port(s) to guard, comma-separated')
  .option('--auto-kill', 'Automatically kill processes that appear on guarded ports')
  .option('--allow <processes>', 'Comma-separated process names to allow (with --auto-kill)')
  .option('--interval <ms>', 'Polling interval in ms (default 1500)', '1500')
  .action((opts) => {
    const ports = opts.port.split(',').map((p: string) => parseInt(p.trim())).filter(Boolean);
    const allowedProcesses = opts.allow ? opts.allow.split(',').map((s: string) => s.trim()) : [];

    printHeader(`Port Guard — Watching: ${ports.join(', ')}`);
    if (opts.autoKill) printWarning('Auto-kill enabled — intruders will be terminated');
    printInfo('Press Ctrl+C to stop\n');

    const guard = startGuard('cli', {
      ports,
      autoKill: opts.autoKill ?? false,
      allowedProcesses,
      intervalMs: parseInt(opts.interval),
      onEvent: (event) => {
        const time = new Date(event.timestamp).toLocaleTimeString();
        const portStr = chalk.cyan(`:${event.port}`);
        const proc = event.info?.process ? chalk.white(event.info.process) : '';
        if (event.type === 'port_appeared') {
          console.log(chalk.green(`[${time}] ▲ PORT APPEARED`) + ` ${portStr} ${proc} (PID ${event.info?.pid ?? '?'})`);
        } else if (event.type === 'port_killed') {
          console.log(chalk.red(`[${time}] ✗ AUTO-KILLED`) + ` ${portStr} ${proc}`);
        } else if (event.type === 'port_disappeared') {
          console.log(chalk.yellow(`[${time}] ▼ PORT CLOSED`) + ` ${portStr}`);
        }
      },
    });

    process.on('SIGINT', () => {
      guard.stop();
      process.exit(0);
    });

    // Keep alive
    setInterval(() => {}, 1000);
  });

// ── docker ────────────────────────────────────────────────────────────
program
  .command('docker')
  .description('Manage Docker containers')
  .option('-l, --list', 'List all containers')
  .option('--all', 'Include stopped containers')
  .option('--stop <name>', 'Stop a container')
  .option('--start <name>', 'Start a container')
  .option('--restart <name>', 'Restart a container')
  .option('--logs <name>', 'Show container logs')
  .option('-n, --lines <n>', 'Number of log lines', '50')
  .action((opts) => {
    if (!isDockerAvailable()) {
      printError('Docker is not available or not running');
      process.exit(1);
    }

    if (opts.stop) { const r = stopContainer(opts.stop); r.success ? printSuccess(`Stopped ${opts.stop}`) : printError(r.error!); }
    else if (opts.start) { const r = startContainer(opts.start); r.success ? printSuccess(`Started ${opts.start}`) : printError(r.error!); }
    else if (opts.restart) { const r = restartContainer(opts.restart); r.success ? printSuccess(`Restarted ${opts.restart}`) : printError(r.error!); }
    else if (opts.logs) { console.log(getContainerLogs(opts.logs, parseInt(opts.lines))); }
    else {
      printHeader('Docker Containers');
      printDockerTable(getContainers(opts.all ?? false));
    }
  });

// ── pm2 ───────────────────────────────────────────────────────────────
program
  .command('pm2')
  .description('Manage PM2 processes')
  .option('-l, --list', 'List all PM2 processes')
  .option('--start <name>', 'Start a PM2 process')
  .option('--stop <name>', 'Stop a PM2 process')
  .option('--restart <name>', 'Restart a PM2 process')
  .option('--logs <name>', 'Show PM2 process logs')
  .option('-n, --lines <n>', 'Number of log lines', '50')
  .action((opts) => {
    if (!isPm2Available()) {
      printError('PM2 is not installed or not in PATH');
      printInfo('Install with: npm install -g pm2');
      process.exit(1);
    }

    if (opts.start) { const r = pm2Action('start', opts.start); r.success ? printSuccess(`Started ${opts.start}`) : printError(r.error!); }
    else if (opts.stop) { const r = pm2Action('stop', opts.stop); r.success ? printSuccess(`Stopped ${opts.stop}`) : printError(r.error!); }
    else if (opts.restart) { const r = pm2Action('restart', opts.restart); r.success ? printSuccess(`Restarted ${opts.restart}`) : printError(r.error!); }
    else if (opts.logs) { console.log(getPm2Logs(opts.logs, parseInt(opts.lines))); }
    else {
      printHeader('PM2 Processes');
      printPm2Table(getPm2Processes());
    }
  });

// ── up (orchestrator) ─────────────────────────────────────────────────
program
  .command('up')
  .description('Start all services defined in .portmaster.yaml')
  .option('-f, --file <path>', 'Config file path')
  .option('-s, --service <name>', 'Start only a specific service')
  .action(async (opts) => {
    let config;
    try {
      config = loadConfig(opts.file);
    } catch (e: any) {
      printError(e.message);
      printInfo('Run `portmaster init` to create a config file');
      process.exit(1);
    }

    const services = opts.service ? [opts.service] : undefined;
    printHeader('Starting Services');

    await startServices(config, services, (name, state) => {
      if (state.status === 'running') printSuccess(`${name} started (PID ${state.pid})`);
      else if (state.status === 'error') printError(`${name} error: ${state.error}`);
    });

    printInfo('\nAll services started. Press Ctrl+C to stop.');
    process.on('SIGINT', () => {
      printWarning('\nStopping all services…');
      stopServices();
      process.exit(0);
    });
    setInterval(() => {}, 1000);
  });

// ── down ─────────────────────────────────────────────────────────────
program
  .command('down')
  .description('Stop all running orchestrated services')
  .action(() => {
    stopServices();
    printSuccess('All services stopped');
  });

// ── status ───────────────────────────────────────────────────────────
program
  .command('status')
  .description('Show status of orchestrated services')
  .action(() => {
    const states = getServiceStatus();
    if (states.length === 0) {
      printInfo('No services running via portmaster up');
      return;
    }
    printHeader('Service Status');
    for (const s of states) {
      const statusColor = s.status === 'running' ? chalk.green : s.status === 'error' ? chalk.red : chalk.gray;
      console.log(`  ${statusColor('●')} ${chalk.white(s.name.padEnd(20))} ${statusColor(s.status)} ${s.pid ? chalk.dim(`PID ${s.pid}`) : ''}`);
    }
  });

// ── init ─────────────────────────────────────────────────────────────
program
  .command('init')
  .description('Create a sample .portmaster.yaml config')
  .option('-o, --output <path>', 'Output file path')
  .action((opts) => {
    const path = initConfig(opts.output);
    printSuccess(`Config created: ${path}`);
    printInfo('Edit it to define your services, then run: portmaster up');
  });

// ── dashboard ─────────────────────────────────────────────────────────
program
  .command('dashboard')
  .alias('dash')
  .description('Start the web dashboard')
  .option('-p, --port <port>', 'Dashboard port', '54321')
  .option('--host <host>', 'Dashboard host (use 0.0.0.0 for WSL)', '0.0.0.0')
  .option('--interval <ms>', 'Refresh interval in ms', '3000')
  .action((opts) => {
    const wsl = detectWsl();
    printHeader('Portmaster Dashboard');

    if (wsl.isWsl) {
      printInfo(`WSL detected — open in your Windows browser:`);
      console.log(chalk.bold.cyan(`\n  → http://localhost:${opts.port}\n`));
    } else {
      console.log(chalk.bold.cyan(`\n  → http://localhost:${opts.port}\n`));
    }

    startDashboard({
      port: parseInt(opts.port),
      host: opts.host,
      refreshInterval: parseInt(opts.interval),
    });

    process.on('SIGINT', () => {
      printInfo('\nDashboard stopped');
      process.exit(0);
    });
  });

// ── info ─────────────────────────────────────────────────────────────
program
  .command('info')
  .description('Show environment info (WSL, Docker, PM2 availability)')
  .action(() => {
    const wsl = detectWsl();
    printHeader('Environment Info');
    console.log(`  WSL:     ${wsl.isWsl ? chalk.green(`Yes (WSL${wsl.wslVersion}) — ${wsl.distro}`) : chalk.dim('No')}`);
    console.log(`  Docker:  ${isDockerAvailable() ? chalk.green('Available') : chalk.dim('Not found')}`);
    console.log(`  PM2:     ${isPm2Available() ? chalk.green('Available') : chalk.dim('Not found')}`);
    console.log(`  Node:    ${chalk.cyan(process.version)}`);
    console.log(`  OS:      ${chalk.dim(require('os').platform() + ' ' + require('os').release())}`);
  });

// ── restart ──────────────────────────────────────────────────────────
program
  .command('restart <port>')
  .description('Restart a previously killed process on this port')
  .action((port: string) => {
    const result = restartPort(parseInt(port));
    if (result.success) printSuccess(`Restarted process on :${port}`);
    else printError(result.error ?? 'Restart failed');
  });

program
  .command('restart-history')
  .description('Show restart history')
  .action(() => {
    const history = getRestartHistory();
    if (history.length === 0) { printInfo('No restart history yet'); return; }
    printHeader('Restart History');
    for (const r of history) {
      console.log(`  ${chalk.cyan(`:${r.port}`)} ${chalk.white(r.process ?? '')} — ${chalk.dim(r.command.substring(0,60))} ${chalk.dim(r.killedAt)}`);
    }
  });

// ── Helper functions ──────────────────────────────────────────────────
async function cmdKillPort(port: number, safe = false): Promise<void> {
  const info = getPortInfo(port);
  if (!info) {
    printWarning(`Port :${port} is not in use`);
    return;
  }

  if (safe) {
    const src = info.source === 'windows' ? chalk.yellow('(Windows process)') : '';
    process.stdout.write(
      `Kill ${chalk.cyan(`:${port}`)} — ${chalk.white(info.process ?? 'unknown')} ${src} PID ${info.pid}? [y/N] `
    );
    const confirmed = await waitForYes();
    if (!confirmed) { printInfo('Aborted'); return; }
  }

  const result = killPort(port);
  if (result.success) {
    printSuccess(`Killed :${port} — ${result.process ?? 'process'} (PID ${result.pid ?? '?'}) [${result.source}]`);
  } else {
    printError(`Failed to kill :${port} — ${result.error}`);
  }
}

async function cmdList(all: boolean): Promise<void> {
  const ports = scanPorts();
  printHeader(`Active Ports${ports.some(p => p.source === 'windows') ? ' (Linux + Windows)' : ''}`);
  printPortsTable(ports);

  if (all) {
    if (isDockerAvailable()) {
      printHeader('Docker Containers');
      printDockerTable(getContainers(true));
    }
    if (isPm2Available()) {
      printHeader('PM2 Processes');
      printPm2Table(getPm2Processes());
    }
  }
}

function waitForYes(): Promise<boolean> {
  return new Promise(resolve => {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once('data', (data) => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
      resolve(data.toString().toLowerCase() === 'y');
    });
  });
}

program.parse();
