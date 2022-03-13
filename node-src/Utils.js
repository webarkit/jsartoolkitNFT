const fs = require("fs");

class Utils {
  static async fetchRemoteData(url) {
    try {
      const response = fs.readFile(
        url,
        {
          encoding: "binary",
        },
        function (err) {
          console.error("Error from fs.readFile: ", err);
        }
      );
      return new Uint8Array(response);
    } catch (error) {
      throw ("Error from fetchRemoteData: ", error);
    }
  }
}

module.exports = Utils;
