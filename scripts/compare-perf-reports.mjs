import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_BEFORE = path.join(process.cwd(), 'output', 'playwright', 'perf-report.before.json');
const DEFAULT_AFTER = path.join(process.cwd(), 'output', 'playwright', 'perf-report.json');
const DEFAULT_OUTPUT = path.join(process.cwd(), 'output', 'playwright', 'perf-report.before-after.md');

function parseArg(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find((entry) => entry.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function flattenNumericLeaves(value, prefix = '') {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return [[prefix, value]];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      flattenNumericLeaves(entry, prefix ? `${prefix}.${index}` : String(index))
    );
  }

  if (value && typeof value === 'object') {
    return Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([key, entry]) =>
        flattenNumericLeaves(entry, prefix ? `${prefix}.${key}` : key)
      );
  }

  return [];
}

function formatDelta(value) {
  if (!Number.isFinite(value)) {
    return 'n/a';
  }

  if (value === 0) {
    return '0';
  }

  return `${value > 0 ? '+' : ''}${value}`;
}

function formatPercent(before, after) {
  if (!Number.isFinite(before) || before === 0 || !Number.isFinite(after)) {
    return 'n/a';
  }

  const deltaPercent = ((after - before) / Math.abs(before)) * 100;
  const rounded = Math.round(deltaPercent * 100) / 100;
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}

function buildMarkdown(beforePath, afterPath, beforeReport, afterReport) {
  const beforeMetrics = new Map(flattenNumericLeaves(beforeReport));
  const afterMetrics = new Map(flattenNumericLeaves(afterReport));
  const comparisons = [...beforeMetrics.entries()]
    .filter(([metric]) => afterMetrics.has(metric))
    .map(([metric, before]) => {
      const after = afterMetrics.get(metric);
      const delta = after - before;
      const deltaPercent =
        before === 0 ? Number.NaN : ((after - before) / Math.abs(before)) * 100;

      return {
        after,
        before,
        delta,
        deltaPercent,
        metric,
      };
    })
    .sort((left, right) => {
      const leftMagnitude = Number.isFinite(left.deltaPercent)
        ? Math.abs(left.deltaPercent)
        : Math.abs(left.delta);
      const rightMagnitude = Number.isFinite(right.deltaPercent)
        ? Math.abs(right.deltaPercent)
        : Math.abs(right.delta);

      if (rightMagnitude !== leftMagnitude) {
        return rightMagnitude - leftMagnitude;
      }

      return left.metric.localeCompare(right.metric);
    });
  const topChanges = comparisons.slice(0, 10);
  const lines = [
    '# Performance Comparison',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    'This file is a generated comparison artifact between two performance-report JSON snapshots.',
    `- Before: \`${path.relative(process.cwd(), beforePath)}\``,
    `- After: \`${path.relative(process.cwd(), afterPath)}\``,
    '- `delta` is `after - before`.',
    '- `delta%` is relative to the absolute `before` value when `before != 0`; otherwise it is `n/a`.',
    '- Improvement direction is metric-specific; interpret the rows using the metric semantics from `scripts/perf-report.mjs`.',
    '',
    '## Summary',
    `- Numeric metrics compared: ${comparisons.length}`,
    `- Top absolute changes surfaced below: ${topChanges.length}`,
    '',
    '## Largest Changes',
  ];

  if (!topChanges.length) {
    lines.push('- No overlapping numeric metrics were found.');
  } else {
    for (const entry of topChanges) {
      lines.push(
        `- \`${entry.metric}\`: ${entry.before} -> ${entry.after} (${formatDelta(entry.delta)}, ${formatPercent(entry.before, entry.after)})`
      );
    }
  }

  lines.push('');
  lines.push('## Full Comparison');
  lines.push('| metric | before | after | delta | delta% |');
  lines.push('| --- | ---: | ---: | ---: | ---: |');

  for (const entry of comparisons) {
    lines.push(
      `| ${entry.metric} | ${entry.before} | ${entry.after} | ${formatDelta(entry.delta)} | ${formatPercent(entry.before, entry.after)} |`
    );
  }

  return `${lines.join('\n')}\n`;
}

async function main() {
  const beforePath = parseArg('before', DEFAULT_BEFORE);
  const afterPath = parseArg('after', DEFAULT_AFTER);
  const outputPath = parseArg('out', DEFAULT_OUTPUT);
  const [beforeReport, afterReport] = await Promise.all([
    readFile(beforePath, 'utf8').then((payload) => JSON.parse(payload)),
    readFile(afterPath, 'utf8').then((payload) => JSON.parse(payload)),
  ]);
  const markdown = buildMarkdown(beforePath, afterPath, beforeReport, afterReport);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdown, 'utf8');
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
