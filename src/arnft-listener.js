ARnft.prototype.addEventListener = function (name, callback) {
    if (!this.listeners[name]) {
        this.listeners[name] = [];
    }
    this.listeners[name].push(callback);
};

ARnft.prototype.dispatchEvent = function (event) {
    var listeners = this.listeners[event.name];
    if (listeners) {
        for (var i = 0; i < listeners.length; i++) {
            listeners[i].call(this, event);
        }
    }
};
