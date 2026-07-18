export interface PortInfo {
  port: number
  pid: number | null
  process: string | null
  protocol: 'TCP' | 'UDP'
  state: string
  address: string
  source: 'linux' | 'windows'
  command?: string
  cwd?: string
  cpuPercent?: number
  memoryMB?: number
}

export interface ProcessSecurity {
  pid: number
  name: string | null
  user: string | null
  uid: number | null
  exe: string | null
  cwd?: string
  command?: string
  startedAt: string | null
  threads: number | null
  memoryKb: number | null
}

export interface ConnectionInfo {
  proto: 'tcp' | 'udp'
  state: string
  local: string
  remote: string
  pid: number | null
  external: boolean
}

export interface SecurityLogs {
  source: 'journalctl-pid' | 'journalctl-comm' | 'none'
  text: string
}

export interface InspectResult {
  success: boolean
  pid: number
  port: number
  process: ProcessSecurity
  connections: ConnectionInfo[]
  logs: SecurityLogs
  error?: string
}

export interface DockerPort {
  containerPort: number
  hostPort: number | null
  protocol: 'tcp' | 'udp'
  hostIp?: string
}

export interface DockerContainer {
  id: string
  name: string
  image: string
  status: string
  state: string
  ports: DockerPort[]
  created: string
  uptime?: string
}

export interface Pm2Process {
  id: number
  name: string
  pid: number | null
  status: string
  cpu: number
  memory: number
  restarts: number
  uptime: number | null
  port?: number | null
  namespace: string
  script: string
  cwd: string
}

export interface DiskInfo {
  total: number
  used: number
  free: number
  usedPercent: number
}

export interface SystemMemory {
  total: number
  free: number
  used: number
  usedPercent: number
}

export interface SystemInfo {
  cpu: number
  cores: number
  memory: SystemMemory
  disk: DiskInfo
  loadAvg: number[]
  uptime: string
  uptimeSeconds: number
  lastUpdated: string
}

export interface WslInfo {
  isWsl: boolean
  wslVersion: number | null
  distro: string | null
}

export interface GuardEvent {
  type: 'port_appeared' | 'port_killed' | 'port_disappeared' | 'port_changed'
  port: number
  info: PortInfo | null
  timestamp: string
}

export interface GuardStatus {
  running: boolean
  recentEvents: GuardEvent[]
  ports?: number[]
  autoKill?: boolean
  allowedProcesses?: string[]
  intervalMs?: number
}

export interface DirEntry {
  name: string
  isDirectory: boolean
  size: number
  mtime: string
}

export interface BrowseResult {
  success: boolean
  root?: string
  path?: string
  absolutePath?: string
  entries?: DirEntry[]
  error?: string
}

export interface Snapshot {
  timestamp: string
  ports: PortInfo[]
  docker: DockerContainer[]
  pm2: Pm2Process[]
  system: SystemInfo
  wsl: WslInfo
  guards: Record<string, GuardStatus>
  managed: Record<number, number>
}
