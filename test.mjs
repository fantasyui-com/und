#!/usr/bin/env node --experimental-modules --no-warnings
//

//

import und from './index.mjs';

import assert from 'assert';

async function test(label, fun){

  try{
    await fun(assert)
    console.info(`\nPASS: ${label}`)
  }catch(e){
    console.error(`\nFAIL: ${label}`)
    console.log(e);

  }

}


(async function main(){

  const {
    get, set, del,

    upsert,
    conflicts,

    erase,
    clean,
    cleanup,

    sync,
    rsync,

    view,


  } = await und({db:'./my-db'});

  test('Get Missing Document', async test => {
    let result = await get('mallory');
  	test.equal(result, null);
  });

  test('Get Existing Document', async test => {
    let {meta, data} = await get('alice');
  	test.equal(meta.id, 'alice');
  });

  test('Upsert a Document', async test => {
  	let doc = await upsert('alice', {name: 'Hello World!'});
  	test.equal(meta.id, 'alice');
  });

  test('Get Conflicts', async test => {
  	let conflicts = await conflicts('alice');
  	test.equal(meta.id, []);
  });

  test('Create a View', async test => {
  	let view = await map('list-administrators',
      function(doc){

        if(doc.data.administrator){
          if(doc.meta.deleted === false){
            return doc;
          }
        }

      }
    );

  	let view = await reduce('count-administrators', 'list-administrators'
      function(accumulator, doc){
        // for everytime a doc is emited

        // check if valid
        if(doc.meta.deleted === true){
          accumulator.count--;
        }else{
          accumulator.count++;
        }
        // increment

      },{count:0}
    );

  	test.equal(meta.id, []);
  });

})();
