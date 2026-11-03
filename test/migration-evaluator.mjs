import { run } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Exact frozen case inventory. Changing this list requires separate review;
// the behavioral source remains part of the registered evaluator closure.
export const EXPECTED = Object.freeze({
  package: Object.freeze([
    'package: next major, dependency-free manifests and a built-in test entry',
    'package: original unfinished sketches and license are retained as historical source'
  ]),
  storage: Object.freeze([
    'storage: explicit initialization and nested directory creation',
    'storage: put/get persistence, UUIDs, input preservation and independent instances',
    'storage: numeric revisions and locale-independent full-filename tie breaking',
    'storage: clean preserves all tied revisions, respects depth and is idempotent',
    'storage: all lists records deterministically and preserves unrelated root files',
    'storage: invalid IDs, invalid revisions and unserializable data do not create records',
    'storage: corrupt latest data is reported and clean does not destroy that record',
    'storage: symlink records/files reject without changing external data',
    'storage: simultaneous writers retain every same-base revision and leak no stdout'
  ]),
  cli: Object.freeze([
    'cli: help, no-argument help and package-derived version',
    'cli: explicit and default database, depth and conflict-preserving cleanup',
    'cli: invalid commands/options/depths fail before storage mutation'
  ])
});
const names = Object.values(EXPECTED).flat();
const expected = new Set(names);

// Consume structured TestsStream results, never TAP/stdout pass-count text.
// A file-wrapper pass is an unexpected result, not a behavioral test.
export function assessExecution(events, file, executionError = null) {
  const problems = [], cases = new Map(), summaries = [];
  if (executionError) problems.push(executionError);
  for (const event of events) {
    const data = event.data ?? {};
    if (event.type === 'test:pass' || event.type === 'test:fail') {
      if (!expected.has(data.name)) problems.push(`Unexpected test result: ${String(data.name)}`);
      const entries = cases.get(data.name) ?? [];
      entries.push(event); cases.set(data.name, entries);
      if (event.type !== 'test:pass') problems.push(`Failed test/process: ${String(data.name)}`);
      if (data.skip !== undefined && data.skip !== false) problems.push(`Skipped test: ${String(data.name)}`);
      if (data.todo !== undefined && data.todo !== false) problems.push(`TODO test: ${String(data.name)}`);
      if (data.file !== file || data.entryFile !== file || data.nesting !== 0 || data.details?.type !== 'test') problems.push(`Unexpected test origin or shape: ${String(data.name)}`);
    } else if (event.type === 'test:summary') {
      summaries.push(data);
    } else if (event.type === 'test:interrupted') {
      problems.push('Test execution was interrupted.');
    }
  }
  for (const name of names) {
    const count = cases.get(name)?.length ?? 0;
    if (count !== 1) problems.push(`Expected exactly one result for ${name}; received ${count}.`);
  }
  const fileSummaries = summaries.filter(s => s.file === file && s.entryFile === file);
  const finalSummaries = summaries.filter(s => s.file === undefined && s.entryFile === undefined);
  if (fileSummaries.length !== 1 || finalSummaries.length !== 1 || summaries.length !== 2) problems.push('Expected one file summary and one final run summary.');
  for (const summary of summaries) {
    const counts = summary.counts ?? {};
    if (summary.success !== true || counts.tests !== names.length || counts.passed !== names.length || counts.topLevel !== names.length ||
        !['failed', 'skipped', 'todo', 'cancelled', 'suites'].every(key => counts[key] === 0)) problems.push('Structured summary is incomplete, unsuccessful, skipped, TODO or canceled.');
  }
  const passed = problems.length === 0;
  return {
    passed,
    expectedCount: names.length,
    observedCount: [...cases.values()].reduce((sum, list) => sum + list.length, 0),
    groups: Object.fromEntries(Object.entries(EXPECTED).map(([group, groupNames]) => [group, {
      passed,
      expected: groupNames,
      observed: groupNames.map(name => ({ name, count: cases.get(name)?.length ?? 0, outcomes: (cases.get(name) ?? []).map(e => ({ type: e.type, skip: e.data.skip ?? false, todo: e.data.todo ?? false })) }))
    }])),
    problems: [...new Set(problems)]
  };
}

function retain(event) {
  const d = event.data ?? {};
  if (event.type === 'test:pass' || event.type === 'test:fail') return { type: event.type, data: {
    name: d.name, nesting: d.nesting, file: d.file, entryFile: d.entryFile,
    skip: d.skip, todo: d.todo,
    details: { type: d.details?.type, duration_ms: d.details?.duration_ms,
      error: d.details?.error ? { message: d.details.error.message, code: d.details.error.code, failureType: d.details.error.failureType, cause: d.details.error.cause?.message } : null }
  } };
  if (['test:summary', 'test:interrupted'].includes(event.type)) return event;
  if (['test:stderr', 'test:stdout', 'test:diagnostic'].includes(event.type)) return { type: event.type, data: { file: d.file, entryFile: d.entryFile, message: d.message } };
  return null;
}

export async function evaluateTestFile(file, { testNamePatterns } = {}) {
  file = path.resolve(file);
  const controller = new AbortController(), events = [];
  let executionError = null, bytes = 0, count = 0;
  const timer = setTimeout(() => { executionError = 'Test execution exceeded 45 seconds.'; controller.abort(); }, 45000);
  try {
    const stream = run({ files: [file], concurrency: 1, isolation: 'process', watch: false, only: false, execArgv: [], timeout: 45000, signal: controller.signal, ...(testNamePatterns ? { testNamePatterns } : {}) });
    for await (const event of stream) {
      const saved = retain(event);
      if (saved) { bytes += Buffer.byteLength(JSON.stringify(saved)); events.push(saved); }
      count++;
      if (bytes > 4 * 1024 * 1024 || count > 2000) { executionError = 'Test event/output limit exceeded.'; controller.abort(); break; }
    }
  } catch (error) { executionError ??= `Test runner failed: ${error.message}`; }
  finally { clearTimeout(timer); }
  return { ...assessExecution(events, file, executionError), events };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const prefix = process.argv[2] ?? 'C-001';
  if (!/^C-\d{3,}$/.test(prefix) || process.argv.length > 3) {
    console.error('Usage: node test/migration-evaluator.mjs [C-001]');
    process.exitCode = 2;
  } else {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const result = await evaluateTestFile(path.join(root, 'test/migration.test.cjs'));
    const operations = Object.keys(EXPECTED).map(group => ({ id: `${prefix}:${group}`, status: result.groups[group].passed ? 'pass' : 'fail', evidence: JSON.stringify({ ...result, groups: { [group]: result.groups[group] } }) }));
    console.log(JSON.stringify({ version: 1, operations, summary: 'Frozen named-case completeness checked using structured node:test events. No skips, TODOs, missing/duplicate/extra cases or process failures permitted. Public tests do not establish distributed or power-loss correctness.' }));
    if (!result.passed) process.exitCode = 1;
  }
}
