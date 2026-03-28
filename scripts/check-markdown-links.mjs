import { execFileSync } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const LINK_PATTERN = /!?\[[^\]]*\]\(([^)]+)\)/g;
const IGNORE_DIRECTORIES = new Set(['.git', 'dist', 'node_modules']);

function isExternalTarget(target) {
  return (
    target.startsWith('#') ||
    target.startsWith('http://') ||
    target.startsWith('https://') ||
    target.startsWith('mailto:') ||
    target.startsWith('data:')
  );
}

function normalizeTarget(rawTarget) {
  let target = rawTarget.trim();

  if (target.startsWith('<') && target.endsWith('>')) {
    target = target.slice(1, -1).trim();
  }

  const titleIndex = target.search(/\s+"/);
  return titleIndex >= 0 ? target.slice(0, titleIndex) : target;
}

async function collectMarkdownFilesFromFilesystem(rootDir, currentDir = rootDir) {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!IGNORE_DIRECTORIES.has(entry.name)) {
        files.push(
          ...(await collectMarkdownFilesFromFilesystem(rootDir, path.join(currentDir, entry.name)))
        );
      }
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(path.relative(rootDir, path.join(currentDir, entry.name)));
    }
  }

  return files.sort();
}

async function collectMarkdownFiles(rootDir) {
  try {
    const stdout = execFileSync('git', ['ls-files', '--', ':(glob)**/*.md'], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    return stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .sort();
  } catch {
    return collectMarkdownFilesFromFilesystem(rootDir);
  }
}

async function main() {
  const rootDir = process.cwd();
  const files = await collectMarkdownFiles(rootDir);
  const failures = [];

  for (const file of files) {
    const absolutePath = path.join(rootDir, file);
    const content = await readFile(absolutePath, 'utf8');
    let match;

    while ((match = LINK_PATTERN.exec(content)) !== null) {
      const rawTarget = normalizeTarget(match[1]);

      if (!rawTarget || isExternalTarget(rawTarget)) {
        continue;
      }

      const [targetPath] = rawTarget.split('#');

      if (!targetPath) {
        continue;
      }

      const resolved = path.resolve(path.dirname(absolutePath), targetPath);
      try {
        await stat(resolved);
      } catch {
        failures.push(`${file}: broken -> ${rawTarget}`);
      }
    }
  }

  if (!failures.length) {
    process.stdout.write(`Checked ${files.length} markdown files. No broken relative links found.\n`);
    return;
  }

  process.stderr.write(`${failures.join('\n')}\n`);
  process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
