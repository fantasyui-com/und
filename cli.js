#!/usr/bin/env node
'use strict';

const { core } = require('./core.js');
const { version } = require('./package.json');

const help = `Usage: und clean [db] [-d|--depth N]
       und --help
       und --version

Keep every file in the highest N distinct revision groups of each record.
Database defaults to the current directory; depth defaults to 1.

Options:
  -d, --depth N    Positive safe integer revision-group count
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
  let db, depth = 1, sawDepth = false, sawHelp = false;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '-h' || arg === '--help') {
      if (sawHelp) throw new Error('Help option may only be supplied once');
      sawHelp = true;
    } else if (arg === '-d' || arg === '--depth') {
      if (sawDepth) throw new Error('Depth option may only be supplied once');
      sawDepth = true;
      const value = rest[++i];
      if (value === undefined) throw new Error(`${arg} requires a positive integer value`);
      depth = Number(value);
      if (!/^[0-9]+$/.test(value) || !Number.isSafeInteger(depth) || depth < 1) {
        throw new Error(`Invalid depth ${JSON.stringify(value)}; expected a positive safe integer`);
      }
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      if (db !== undefined) throw new Error(`Unexpected extra database operand: ${arg}`);
      if (!arg) throw new Error('Database path must not be empty');
      db = arg;
    }
  }
  return { action: sawHelp ? 'help' : 'clean', db: db ?? process.cwd(), depth };
}

async function main() {
  const options = parse(process.argv.slice(2));
  if (options.action === 'help') { process.stdout.write(help); return; }
  if (options.action === 'version') { process.stdout.write(`${version}\n`); return; }
  const api = core({});
  await api.path(options.db);
  await api.clean(options.depth);
}

main().catch(error => {
  process.stderr.write(`und: ${error.message}\nUse "und --help" for usage.\n`);
  process.exitCode = 1;
});
