import type { PlatformSelection } from './types'

export const OS_LABELS: Record<string, string> = {
  aix: 'AIX',
  android: 'Android',
  darwin: 'Darwin',
  freebsd: 'FreeBSD',
  linux: 'Linux',
  netbsd: 'NetBSD',
  openbsd: 'OpenBSD',
  openharmony: 'OpenHarmony',
  sunos: 'SunOS',
  wasm32: 'WebAssembly',
  win32: 'Windows',
}

export const OS_HINTS: Partial<Record<keyof typeof OS_LABELS, string>> = {
  aix: 'aix',
  darwin: 'MacOS',
  openharmony: 'OHOS',
  sunos: 'Solaris',
  wasm32: 'wasm32',
  win32: 'Windows',
}

export const ARCH_LABELS: Record<string, string> = {
  arm: 'ARM',
  arm64: 'ARM64',
  ia32: 'x86',
  loong64: 'LoongArch 64-bit',
  mips64el: 'MIPS64 little-endian',
  ppc64: 'PowerPC 64-bit',
  ppc64le: 'PowerPC 64-bit LE',
  riscv64: 'RISC-V 64-bit',
  s390x: 'IBM s390x',
  universal: 'Universal',
  x64: 'x64',
}

export const ARCH_HINTS: Partial<Record<keyof typeof ARCH_LABELS, string>> = {
  arm: 'armv7',
  arm64: 'aarch64',
  ia32: 'ia32',
  loong64: 'loongarch64',
  mips64el: 'mips64el',
  ppc64: 'powerpc64',
  ppc64le: 'powerpc64le',
  riscv64: 'riscv64',
  s390x: 's390x',
  universal: 'universal2',
  x64: 'x86_64',
}

export const RUNTIME_LABELS: Record<string, string> = {
  eabi: 'EABI',
  eabihf: 'EABI hard-float',
  gnu: 'glibc',
  gnueabihf: 'GNU EABI hard-float',
  gnux32: 'GNU x32',
  musl: 'musl',
  musleabihf: 'musl EABI hard-float',
  msvc: 'MSVC',
  wasi: 'WASI',
}

export const RUNTIME_HINTS: Partial<Record<keyof typeof RUNTIME_LABELS, string>> = {
  eabi: 'eabi',
  eabihf: 'eabihf',
  gnu: 'gnu',
  gnueabihf: 'gnueabihf',
  gnux32: 'gnux32',
  msvc: 'msvc',
  musl: 'musl',
  musleabihf: 'musleabihf',
  wasi: 'wasi',
}

export const PLATFORM_RUNTIME_NONE = 'none'

export const TOKEN_ALIASES: Record<string, string> = {
  '32': 'ia32',
  '64': 'x64',
  amd64: 'x64',
  aarch64: 'arm64',
  armv8: 'arm64',
  glibc: 'gnu',
  loongarch64: 'loong64',
  mac: 'darwin',
  macos: 'darwin',
  osx: 'darwin',
  powerpc64le: 'ppc64le',
  ppc64le: 'ppc64le',
  win: 'win32',
  windows: 'win32',
  x86_64: 'x64',
}

export const DEFAULT_PLATFORM_SELECTION: PlatformSelection = {}

export const PLATFORM_OS_PRIORITY = ['linux', 'win32', 'darwin', 'android'] as const

export const PLATFORM_ARCH_ORDER = [
  'x64',
  'arm64',
  'ia32',
  'arm',
  'universal',
  'loong64',
  'mips64el',
  'ppc64',
  'ppc64le',
  'riscv64',
  's390x',
] as const

export const PLATFORM_RUNTIME_ORDER = [
  PLATFORM_RUNTIME_NONE,
  'gnu',
  'musl',
  'msvc',
  'eabihf',
  'eabi',
  'gnueabihf',
  'gnux32',
  'musleabihf',
  'wasi',
] as const
