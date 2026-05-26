export interface CompiledPatterns {
  include: RegExp[];
  exclude: RegExp[];
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

export function globToRegExp(glob: string): RegExp {
  const normalized = glob.trim().replace(/\\/g, "/");
  let source = "";

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    const next = normalized[index + 1];

    if (character === "*" && next === "*") {
      source += ".*";
      index += 1;
    } else if (character === "*") {
      source += "[^/]*";
    } else if (character === "?") {
      source += "[^/]";
    } else {
      source += escapeRegExp(character);
    }
  }

  return new RegExp(`(^|/)${source}$`, "i");
}

export function compilePatterns(include: string[] = [], exclude: string[] = []): CompiledPatterns {
  return {
    include: include.filter(Boolean).map(globToRegExp),
    exclude: exclude.filter(Boolean).map(globToRegExp)
  };
}

export function matchesAny(patterns: RegExp[], value: string): boolean {
  const normalized = value.replace(/\\/g, "/");
  return patterns.some((pattern) => pattern.test(normalized));
}

export function shouldExclude(compiled: CompiledPatterns, absolutePath: string, name: string): boolean {
  return matchesAny(compiled.exclude, absolutePath) || matchesAny(compiled.exclude, name);
}

export function shouldInclude(compiled: CompiledPatterns, absolutePath: string, name: string): boolean {
  if (compiled.include.length === 0) return true;
  return matchesAny(compiled.include, absolutePath) || matchesAny(compiled.include, name);
}
