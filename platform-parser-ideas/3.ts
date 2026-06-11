export type Target = {
  raw: string;
  os?: string;
  arch?: string;
  runtime?: string;
};

export type Selection = {
  os?: string;
  arch?: string;
  runtime?: string;
};

export type Option = {
  value: string;
  label: string;
};

export type ResolveResult =
  | { kind: "match"; target: Target }
  | { kind: "ambiguous"; targets: Target[] }
  | { kind: "none" };

const OS_ALIASES: Record<string, string> = {
  windows: "win32",
  win: "win32",
  mac: "darwin",
  macos: "darwin",
  osx: "darwin",
};

const ARCH_ALIASES: Record<string, string> = {
  "64": "x64",
  "32": "ia32",

  amd64: "x64",
  x86_64: "x64",

  aarch64: "arm64",
  armv8: "arm64",

  loongarch64: "loong64",

  powerpc64le: "ppc64",
  ppc64le: "ppc64",
};

const OS_LABELS: Record<string, string> = {
  linux: "Linux",
  darwin: "macOS",
  win32: "Windows",
  android: "Android",
  freebsd: "FreeBSD",
  openbsd: "OpenBSD",
  netbsd: "NetBSD",
  aix: "AIX",
  sunos: "SunOS",
  openharmony: "OpenHarmony",
  wasm32: "WebAssembly",
};

const ARCH_LABELS: Record<string, string> = {
  x64: "x64 / AMD64",
  arm64: "ARM64 / AArch64",
  ia32: "x86 / 32-bit",
  arm: "ARM",
  ppc64: "PowerPC 64-bit",
  s390x: "IBM s390x",
  riscv64: "RISC-V 64-bit",
  loong64: "LoongArch 64-bit",
  mips64el: "MIPS64 little-endian",
};

const RUNTIME_LABELS: Record<string, string> = {
  gnu: "glibc",
  musl: "musl",
  msvc: "MSVC",
  wasi: "WASI",
  eabi: "EABI",
  gnueabihf: "GNU EABI Hard Float",
  musleabihf: "musl EABI Hard Float",
};

function uniq(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter(Boolean) as string[])].sort();
}

function option(
  value: string,
  labels: Record<string, string>,
): Option {
  return {
    value,
    label: labels[value] ?? value,
  };
}

export function parseTarget(raw: string): Target {
  const parts = raw.trim().toLowerCase().split("-");

  if (parts.length < 2) {
    return { raw };
  }

  let [os, arch, ...rest] = parts;

  os = OS_ALIASES[os] ?? os;
  arch = ARCH_ALIASES[arch] ?? arch;

  const target: Target = {
    raw,
    os,
    arch,
  };

  if (rest.length === 0) {
    return target;
  }

  // Linux libc
  if (rest.includes("musl")) {
    target.runtime = "musl";
    return target;
  }

  if (rest.includes("gnu")) {
    target.runtime = "gnu";
    return target;
  }

  // Windows ABI
  if (rest.includes("msvc")) {
    target.runtime = "msvc";
    return target;
  }

  // Common ABI targets
  if (rest.includes("wasi")) {
    target.runtime = "wasi";
    return target;
  }

  if (rest.includes("gnueabihf")) {
    target.runtime = "gnueabihf";
    return target;
  }

  if (rest.includes("musleabihf")) {
    target.runtime = "musleabihf";
    return target;
  }

  if (rest.includes("eabi")) {
    target.runtime = "eabi";
    return target;
  }

  target.runtime = rest.join("-");
  return target;
}

export function parseTargets(rawTargets: string[]): Target[] {
  return rawTargets.map(parseTarget);
}

export function filterTargets(
  targets: Target[],
  selection: Selection,
): Target[] {
  return targets.filter((target) => {
    if (selection.os && target.os !== selection.os) {
      return false;
    }

    if (selection.arch && target.arch !== selection.arch) {
      return false;
    }

    if (selection.runtime && target.runtime !== selection.runtime) {
      return false;
    }

    return true;
  });
}

export function resolveSelection(
  rawTargets: string[],
  selection: Selection,
): ResolveResult {
  const matches = filterTargets(
    parseTargets(rawTargets),
    selection,
  );

  if (matches.length === 1) {
    return {
      kind: "match",
      target: matches[0],
    };
  }

  if (matches.length > 1) {
    return {
      kind: "ambiguous",
      targets: matches,
    };
  }

  return {
    kind: "none",
  };
}

export function getOsOptions(rawTargets: string[]): Option[] {
  return uniq(
    parseTargets(rawTargets).map((t) => t.os),
  ).map((v) => option(v, OS_LABELS));
}

export function getArchitectureOptions(
  rawTargets: string[],
  os?: string,
): Option[] {
  const targets = filterTargets(
    parseTargets(rawTargets),
    { os },
  );

  return uniq(
    targets.map((t) => t.arch),
  ).map((v) => option(v, ARCH_LABELS));
}

export function getRuntimeOptions(
  rawTargets: string[],
  selection: Pick<Selection, "os" | "arch">,
): Option[] {
  const targets = filterTargets(
    parseTargets(rawTargets),
    selection,
  );

  return uniq(
    targets.map((t) => t.runtime),
  ).map((v) => option(v, RUNTIME_LABELS));
}

export function getDropdownState(
  rawTargets: string[],
  selection: Selection,
) {
  const osOptions =
    getOsOptions(rawTargets);

  const architectureOptions =
    selection.os
      ? getArchitectureOptions(
          rawTargets,
          selection.os,
        )
      : [];

  const runtimeOptions =
    selection.os && selection.arch
      ? getRuntimeOptions(rawTargets, {
          os: selection.os,
          arch: selection.arch,
        })
      : [];

  const resolution =
    resolveSelection(rawTargets, selection);

  return {
    labels: {
      os: "OS",
      architecture: "Architecture",
      runtime: "Runtime",
    },

    osOptions,
    architectureOptions,
    runtimeOptions,

    resolution,
  };
}