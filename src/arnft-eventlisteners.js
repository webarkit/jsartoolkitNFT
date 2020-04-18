ARnft.prototype.dispatchEvent = function (listeners) {
  var listeners = this.listeners[event.name];
  if (listeners) {
      for (var i = 0; i < listeners.length; i++) {
          listeners[i].call(this, event);
      }
  }
}

ARnft.prototype.addEventListener = function (name, callback) {
    if (!this.listeners[name]) {
        this.listeners[name] = [];
    }
    this.listeners[name].push(callback);
};

ARnft.prototype.removeEventListener = function (name, callback) {
    if (this.listeners[name]) {
        var index = this.listeners[name].indexOf(callback);
        if (index > -1) {
            this.listeners[name].splice(index, 1);
        }
    }
};
