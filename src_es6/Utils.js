import axios from 'axios'

export default class Utils {
  static async fetchRemoteData (url) {
    try {
      const response = await axios.get(url, { responseType: 'arraybuffer' })
      return new Uint8Array(response.data)
    } catch (error) {
      throw error
    }
  }

  static async fetchRemoteDataCallback (url, callback) {
    try {
      const response = await axios.get(url, { responseType: 'arraybuffer' })
      .then((response) => {
        data = new Uint8Array(response.data)
        console.log(data);
        callback(response)
      })
      return response
    } catch (error) {
      throw error
    }
  }

  /*static async fetchRemoteNFTData (url) {
    const response = await axios.get(url + '.fset', { responseType: 'arraybuffer' })
      .get(url + '.iset', { responseType: 'arraybuffer' })
      .get(url + '.fset3', { responseType: 'arraybuffer' })
      .then((res) => { return res.data })
      .catch((error) => { console.error(error) })
  }*/

  static async fetchRemoteNFTData (url) {
    const response = await axios.all([
      axios.get(url + '.fset', { responseType: 'arraybuffer' }),
      axios.get(url + '.iset', { responseType: 'arraybuffer' }),
      axios.get(url + '.fset3', { responseType: 'arraybuffer' })
    ])
      .then((res) => { return res.data })
      .catch((error) => { console.error(error) })
  }

  static async fetchRemoteNFTData_new (url) {
    const response = await axios.get(url + '.fset', { responseType: 'arraybuffer' })
      .get(url + '.iset', { responseType: 'arraybuffer' })
      .get(url + '.fset3', { responseType: 'arraybuffer' })
      .then((res) => { return res.data })
      .catch((error) => { console.error(error) })
  }

  static string2Uint8Data (string) {
    const data = new Uint8Array(string.length)
    for (let i = 0; i < data.length; i++) {
      data[i] = string.charCodeAt(i) & 0xff
    }
    return data
  }

  static writeStringToFS(target, string, callback) {
      let byteArray = new Uint8Array(string.length);
      for (let i = 0; i < byteArray.length; i++) {
          byteArray[i] = string.charCodeAt(i) & 0xff;
      }
      this.writeByteArrayToFS(target, byteArray, callback);
  }

  static writeByteArrayToFS(target, byteArray, callback) {
      Module.FS.writeFile(target, byteArray, { encoding: 'binary' });
      // console.log('FS written', target);

      callback(byteArray);
  }

  static ajax(url, target, callback, errorCallback) {
      let oReq = new XMLHttpRequest();
      oReq.open('GET', url, true);
      oReq.responseType = 'arraybuffer'; // blob arraybuffer

      oReq.onload = function () {
          if (this.status == 200) {
              // console.log('ajax done for ', url);
              var arrayBuffer = oReq.response;
              var byteArray = new Uint8Array(arrayBuffer);
              Utils.writeByteArrayToFS(target, byteArray, callback);
          }
          else {
              errorCallback(this.status);
          }
      };

      oReq.send();
  }
}
