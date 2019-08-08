import {inspect} from 'util';




export async function get(){
  console.log('get running', this)
}

export async function set(){
  console.log('set running', this)
}
