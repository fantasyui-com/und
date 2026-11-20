#!/usr/bin/env node
'use strict';

const fs = require('node:fs/promises');
const { core } = require('./core.js');
const { version } = require('./package.json');

const help = `Usage: und clean [db] [-d|--depth N]
       und clean [-d|--depth N] -- db
       und --help
       und --version

Keep every file in the highest N distinct revision groups of each record.
Database defaults to the current directory; depth defaults to 1.
The database directory must already exist. Successful cleanup prints nothing.

Options:
  -d, --depth N    Positive safe integer revision-group count (also --depth=N)
  --               Treat the remaining argument as the database path
  -h, --help       Show usage
  -V, --version    Show package version
`;

function parse(args) {
  if (args.length === 0) return { action: 'help' };
  const [command, ...rest] = args;
  if (['-h', '--help', '-V', '--version'].includes(command)) {
    if (rest.length) throw new Error(`${command} must be used alone`);
    return { action: command === '-h' || command === '--help' ? 'help' : 'version' };
  }
  if (command !== 'clean') throw new Error(`Unknown command or option: ${command}`);
  let db, depth = 1, sawDepth = false, sawHelp = false, operandsOnly = false;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (operandsOnly || !arg.startsWith('-')) {
      if (db !== undefined) throw new Error(`Unexpected extra database operand: ${arg}`);
      if (!arg) throw new Error('Database path must not be empty');
      db = arg;
    } else if (arg === '--') {
      operandsOnly = true;
    } else if (arg === '-h' || arg === '--help') {
      if (sawHelp) throw new Error('Help option may only be supplied once');
      sawHelp = true;
    } else if (arg === '-d' || arg === '--depth' || arg.startsWith('--depth=')) {
      if (sawDepth) throw new Error('Depth option may only be supplied once');
      sawDepth = true;
      const inline = arg.startsWith('--depth=');
      const value = inline ? arg.slice('--depth='.length) : rest[++i];
      if (value === undefined) throw new Error(`${arg} requires a positive integer value`);
      depth = Number(value);
      if (!/^[0-9]+$/.test(value) || !Number.isSafeInteger(depth) || depth < 1) {
        throw new Error(`Invalid depth ${JSON.stringify(value)}; expected a positive safe integer`);
      }
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return { action: sawHelp ? 'help' : 'clean', db: db ?? process.cwd(), depth };
}

async function main() {
  const options = parse(process.argv.slice(2));
  if (options.action === 'help') { process.stdout.write(help); return; }
  if (options.action === 'version') { process.stdout.write(`${version}\n`); return; }
  // path() creates missing directories for writers. Cleanup must never create
  // a database, so a mistyped location fails instead of leaving a new tree.
  try { await fs.lstat(options.db); }
  catch (error) {
    if (error.code === 'ENOENT') throw new Error(`Database directory does not exist: ${options.db}`);
    throw error;
  }
  const api = core({});
  await api.path(options.db);
  await api.clean(options.depth);
}

main().catch(error => {
  process.stderr.write(`und: ${error.message}\nUse "und --help" for usage.\n`);
  process.exitCode = 1;
});
