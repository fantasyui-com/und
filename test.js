mconst und = require('./smart.js')({});

(async function main(){

  //console.log( (await und.clean()) );

  let doc = await und.get('spot-1');

  if(doc){
    // all is well
  }else{
    doc = und.put( {id:'spot-1', name: 'Hello World!'} )
  }

  //
  // console.log( doc );
  //
  // // console.log( await und.rev( 'foo' ) );
  //
  // //console.log( await und.u( 'foo' ) );
  // await und.put( doc )
  // await und.put( doc )
  // await und.put( Object.assign(doc,{rev:null}) ) // by removing rev, system will assign the latest available

})()

// und.put( {id:'spot-0', name: 'Hello World!'} )

// und.path('./test-db');
//
// console.log('Scenario 1: Upsert');
// und.put({id:0, name: 'Hello World!'});
// const doc = und.get(0);
// console.log(doc);
//
// console.log('Scenario 2 - Get');
// const doc = und.get(1);
