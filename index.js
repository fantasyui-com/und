const path = require('path');

const {core} = require( path.join(__dirname, 'core.js') );

function standard(configuration) {

  // Allow plain old configuration.
  const und = core(configuration);
  return und;

}

module.exports = standard;
