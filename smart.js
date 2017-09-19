const path = require('path');

const {core} = require( path.join(__dirname, 'core.js') );

function smart(configuration) {
  const und = core(configuration);
  // Perform smart presets...

  und.path('./und/');
  return und;

}

module.exports = smart;
