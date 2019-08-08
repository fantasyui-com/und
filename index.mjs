

import {inspect} from 'util';
import {get,set} from './util.mjs';

export default async function main(context={}){

  return {
    get: get.bind(context),
    set: set.bind(context),
  }

}
