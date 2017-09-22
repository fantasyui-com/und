#!/usr/bin/env node

/**
 * Module dependencies.
 */

const path = require('path');
const {core} = require( path.join(__dirname, 'core.js') );
var program = require('commander');

program
.version('0.1.0')
.option('-T, --no-tests', 'ignore test hook');

program
  .command('clean [db]')
  .description('clean an entire database')
  .option("-d, --depth [depth]", "Depth to which clean the database to", 1)
  .action(async function(db, options){
    const und = core({});
    await und.path(db);
    await und.clean(options.depth);
  });
program.parse(process.argv);
