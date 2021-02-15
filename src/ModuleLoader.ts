import Module from '../build/artoolkitNFT_ES6_wasm'

const ModuleLoader = {
  init: () => {
    return new Promise(resolve => {
      Module({
        onRuntimeInitialized () {
          // need to wrap this in an object
          // otherwise it will cause Chrome to crash
          resolve({ instance: this })
        }
      })
    })
  }
}

export default ModuleLoader
