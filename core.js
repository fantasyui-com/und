const path = require('path');
const fs = require('fs');
const mkdirp = require('mkdirp');

const pify = require('pify');
const uuidv4 = require('uuid/v4');
const sort = require('alphanum-sort');

const pathExists = require('path-exists');

function core() {

  const options = {
    path: null,
  };

  const api = {};

  api.path = async function(location){
    options.path = path.resolve(location);
    mkdirp.sync(options.path);
  }

  api.rev = async function(id){
    const directory = path.join(options.path, id);
    const objectFilenames = await pify(fs.readdir)(directory);
    if(objectFilenames.length === 0) objectFilenames.push('0-a')
    const [latestRevision] = sort(objectFilenames).pop().split('-');
    return parseInt(latestRevision)||1;
  }

  api.has = async function(id){
    const directory = path.join(options.path, id);
    return await pathExists(directory);
  }

  api.all = async function(){
    const directory = path.join(options.path);
    return await pify(fs.readdir)(directory);
  }

  api.get = async function(id){
    if(!id) throw new Error('.id is required');
    const dataHasExisted = await api.has(id);

    if(!dataHasExisted){
      return null;
    }

    const directory = path.join(options.path, id);
    const objectFilenames = await pify(fs.readdir)(directory);
    const filename = sort(objectFilenames).pop();
    return JSON.parse(fs.readFileSync( path.join(directory, filename) ).toString());
  }

  api.put = async function(data){

    /*
      id is as important as data.
    */
    if(!data) throw new Error('data is required')
    if(!data.id) throw new Error('.id is required')

    /*
      Get solution to revision.
    */
    const dataHasRevision = (data.rev);
    const dataHasExisted = await api.has(data.id);
    let rev = 0;

    if(dataHasRevision) {
      rev = data.rev; // Revision Exists in the data being saved, reuse.
    } else if ( dataHasExisted ) {
      rev = await api.rev( data.id ); // Document exists, get the latest revision.
    } else {
      rev = 0; // no revision was provided, and the document does not exist, this revision is 0.
    }

    /*
      Increment revision
    */
    rev = rev + 1;
    const updated = Object.assign({},data,{rev})

    console.log(updated);

    /*
      Save File - no file error will occur here becasue the filename is unique.
    */
    const directory = path.join(options.path, updated.id);
    const fullpath = path.join( directory , updated.rev + '-' + uuidv4() + '.json');
    if ( ! dataHasExisted ) await mkdirp ( directory );
    fs.writeFileSync( fullpath, JSON.stringify( updated, null, '  ' ) );

    return updated;
  }


  return api;

}

module.exports = {core};
