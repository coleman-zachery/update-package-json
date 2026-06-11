export interface Target {
  os?: string;
  arch?: string;
  libc?: string;
  abi?: string;
  raw: string;
}

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

  x86_64: "x64",
  amd64: "x64",

  aarch64: "arm64",

  loongarch64: "loong64",

  powerpc64le: "ppc64",
  ppc64le: "ppc64",
};

export function parseTarget(raw: string): Target {
  const normalized = raw.trim().toLowerCase();

  const parts = normalized.split("-");

  if (parts.length < 2) {
    return { raw };
  }

  let [os, arch, ...rest] = parts;

  os = OS_ALIASES[os] ?? os;
  arch = ARCH_ALIASES[arch] ?? arch;

  const target: Target = {
    os,
    arch,
    raw,
  };

  for (const token of rest) {
    switch (token) {
      case "glibc":
      case "gnu":
        target.libc = "gnu";
        break;

      case "musl":
        target.libc = "musl";
        break;

      default:
        target.abi = target.abi
          ? `${target.abi}-${token}`
          : token;
    }
  }

  return target;
}

export interface ResolutionResult {
  match?: Target;
  ambiguous?: Target[];
}

export function resolveTarget(
  intentRaw: string,
  candidateRaws: string[],
): ResolutionResult {
  const intent = parseTarget(intentRaw);
  const candidates = candidateRaws.map(parseTarget);

  const matches = candidates.filter((candidate) => {
    if (intent.os && candidate.os !== intent.os) {
      return false;
    }

    if (intent.arch && candidate.arch !== intent.arch) {
      return false;
    }

    if (intent.libc && candidate.libc !== intent.libc) {
      return false;
    }

    if (intent.abi && candidate.abi !== intent.abi) {
      return false;
    }

    return true;
  });

  if (matches.length === 1) {
    return { match: matches[0] };
  }

  if (matches.length > 1) {
    return { ambiguous: matches };
  }

  return {};
}

/* ------------------------------------------------------------------ */
/* Examples                                                           */
/* ------------------------------------------------------------------ */

const rolldown = [
  "linux-x64-gnu",
  "linux-x64-musl",
  "darwin-arm64",
  "win32-x64-msvc",
];

console.log(resolveTarget("windows-64", rolldown));
// => { match: { os: 'win32', arch: 'x64', abi: 'msvc', ... } }

console.log(resolveTarget("linux-x64", rolldown));
// => { ambiguous: [linux-x64-gnu, linux-x64-musl] }

console.log(resolveTarget("linux-x64-gnu", rolldown));
// => { match: linux-x64-gnu }

console.log(resolveTarget("macos-arm64", rolldown));
// => { match: darwin-arm64 }