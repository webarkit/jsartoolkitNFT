async function jsonParser(requestURL, callback) {
  return await new Promise( function(resolve, reject) {
    let data;
    let request = new XMLHttpRequest();
    request.open('GET', requestURL);
    request.responseType = 'json';
    request.onload = function() {
      resolve(request.response);
    }
    request.onerror = function () {
      reject('error ' + request.status);
    }
    request.send(null);
  });
}
