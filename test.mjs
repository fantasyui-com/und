#!/usr/bin/env node --experimental-modules --no-warnings

import und from './index.mjs';

(async function main(){

  const {get, set} = await und({db:'./my-db'})
  console.log({get, set})
  let doc = await get('spot-1');

  if(doc){
    // all is well
  }else{
    doc = set( {id:'spot-1', name: 'Hello World!'} )
  }


})()
