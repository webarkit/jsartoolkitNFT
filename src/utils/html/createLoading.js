function createLoading(configData) {
  var loader = document.createElement('div');
  loader.id = "loading";
  var logo = document.createElement('img');
  logo.src = configData.loading.logo.src;
  logo.alt = configData.loading.logo.alt;
  var loadingMessage = document.createElement('span');
  loadingMessage.setAttribute('class', "loading-text");
  loadingMessage.innerText = configData.loading.loadingMessage;
  loader.appendChild(logo);
  loader.appendChild(loadingMessage);
  var marker = document.getElementById('marker');
  document.body.insertBefore(loader, document.body.firstChild);
}
