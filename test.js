const und = require('./index.js');

und.db('./test-db');

und.put({id:0, name: 'Hello World!'})
const doc = und.get(0);
console.log(doc);
const doc = und.get(1);
