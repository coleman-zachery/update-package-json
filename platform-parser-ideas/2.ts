export type Target = {
  os?: string;
  arch?: string;
  libc?: "gnu" | "musl";
  abi?: string;
  raw: string;
};

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
  ppc64le: "ppc64",
  powerpc64le: "ppc64",
};

export function parseTarget(raw: string): Target {
  const parts = raw.trim().toLowerCase().split("-");

  if (parts.length < 2) return { raw };

  let [os, arch, ...rest] = parts;

  os = OS_ALIASES[os] ?? os;
  arch = ARCH_ALIASES[arch] ?? arch;

  const target: Target = { os, arch, raw };

  for (const token of rest) {
    if (token === "gnu" || token === "glibc") target.libc = "gnu";
    else if (token === "musl") target.libc = "musl";
    else target.abi = target.abi ? `${target.abi}-${token}` : token;
  }

  return target;
}

export function resolveTarget(intentRaw: string, candidateRaws: string[]) {
  const intent = parseTarget(intentRaw);
  const candidates = candidateRaws.map(parseTarget);

  const matches = candidates.filter((c) =>
    (!intent.os || c.os === intent.os) &&
    (!intent.arch || c.arch === intent.arch) &&
    (!intent.libc || c.libc === intent.libc) &&
    (!intent.abi || c.abi === intent.abi)
  );

  if (matches.length === 1) return { kind: "match" as const, target: matches[0] };
  if (matches.length > 1) return { kind: "ambiguous" as const, targets: matches };
  return { kind: "none" as const };
}