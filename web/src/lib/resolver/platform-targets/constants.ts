import type { PlatformSelection } from './types'

export const OS_LABELS: Record<string, string> = {
  aix: 'AIX',
  android: 'Android',
  darwin: 'macOS',
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
  darwin: 'Darwin',
  openharmony: 'ohos',
  sunos: 'Solaris',
  wasm32: 'wasm32',
  win32: 'win32',
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

export const DEFAULT_PLATFORM_SELECTION: PlatformSelection = {
  os: 'linux',
  arch: 'x64',
  runtime: 'gnu',
}

export const FALLBACK_OS_ARCH_OPTIONS: Partial<Record<string, string[]>> = {
  aix: ['ppc64'],
  android: ['arm', 'arm64', 'x64'],
  darwin: ['arm64', 'universal', 'x64'],
  freebsd: ['arm64', 'x64'],
  linux: ['arm', 'arm64', 'ia32', 'loong64', 'mips64el', 'ppc64', 'ppc64le', 'riscv64', 's390x', 'x64'],
  netbsd: ['arm64', 'x64'],
  openbsd: ['arm64', 'x64'],
  openharmony: ['arm64'],
  sunos: ['x64'],
  win32: ['arm64', 'ia32', 'x64'],
}

export const FALLBACK_RUNTIME_OPTIONS: Partial<Record<string, string[]>> = {
  'android-arm': ['eabi', 'eabihf'],
  'android-arm64': ['gnu'],
  'android-x64': ['gnu'],
  'linux-arm': ['eabi', 'eabihf', 'gnu', 'gnueabihf', 'musl', 'musleabihf'],
  'linux-arm64': ['gnu', 'musl'],
  'linux-ia32': ['gnu', 'musl'],
  'linux-loong64': ['gnu', 'musl'],
  'linux-mips64el': ['gnu', 'musl'],
  'linux-ppc64': ['gnu'],
  'linux-ppc64le': ['gnu', 'musl'],
  'linux-riscv64': ['gnu', 'musl'],
  'linux-s390x': ['gnu'],
  'linux-x64': ['gnu', 'gnux32', 'musl'],
  'win32-arm64': ['msvc'],
  'win32-ia32': ['msvc'],
  'win32-x64': ['msvc'],
}
