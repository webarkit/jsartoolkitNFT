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

  static string2Uint8Data (string) {
    const data = new Uint8Array(string.length)
    for (let i = 0; i < data.length; i++) {
      data[i] = string.charCodeAt(i) & 0xff
    }
    return data
  }
}
