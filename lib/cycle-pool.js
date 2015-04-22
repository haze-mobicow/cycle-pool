var EventEmitter = require('events').EventEmitter;
var util = require('util');

///--- Constants

var MAX_CLIENT_ID = Math.pow(2, 31) - 1;

///--- Helpers

function clone(obj) {
    if (!obj) {
        return (obj);
    }
    var copy = {};
    Object.keys(obj).forEach(function (k) {
        copy[k] = obj[k];
    });
    return (copy);
}

function merge(obj,obj2) {
    if (!obj || !obj2) {
        return (obj && obj2);
    }
    var c = clone(obj);
    for (var attrname in obj2) { c[attrname] = obj2[attrname]; }

    return (c);
}

///--- Client Prototype

function Client(constructor) {
    EventEmitter.call(this);
    var self = this;
    this._q = undefined;
    this.pools = {
        clients: [],
        counter: 0
    };
    this._created = 0;
    this._online = 0;
    this._nextID = 0;
    this._queuedClients = 0;
    this._blockedClients = 0;
    this._constructor = constructor;
    this._constructor.size = constructor.size || 5;
    this._constructor.queue = constructor.queue || false;
    this._constructor.overGrow = constructor.overGrow || false;
    if(!this._constructor.name){
        this._constructor.name = 'cycle-pool';
    }
    this._debug = require('debug')(this._constructor.name);

    this._constructor.validate = constructor.validate || function () {
        return true;
    };

    this._constructor.destroy = constructor.destroy || function () {
        return true;
    };

    if(this._constructor.queue) {
        this._debug('Loading queue');
        this._loadQ();
    }
    this._load();
}

util.inherits(Client, EventEmitter);


Client.prototype._loadQ = function _loadQ() {
    var self = this;
    if(self._constructor.queue){
        var async = require('async');
        self._q = async.queue(function (task, callback) {
            setImmediate(function() {
                self._queuedClients--;
                self._getClient(task.callback);
                callback();
            })
        }, self._constructor.queue);
    }
};


Client.prototype._load = function _load() {
    var self = this;
    this.once('full', sendReady);
    function sendReady() {
        self._debug('All Clients Are Now Ready');
        self.emit('ready');
    }
    while (this._created < this._constructor.size) {
        this._created += 1;
        self._debug('Creating Connection :'+self._created);
        setImmediate(function () {
            self._createConnection();
        });
    }
};


Client.prototype._createConnection = function _createConnection() {
    var self = this;
    self._constructor.create(function(err,con){
        if (++self._nextID >= MAX_CLIENT_ID)
            self._nextID = 1;

        var c =con;
        c._cycle_blocked=false;
        c._cycle_id= self._nextID;
        ++self._online;
        self.pools.clients.push(c);
        if(self.pools.clients.length >= self._constructor.size){
            self._debug('Pool is full');
            self.emit('full');
        }
    });
};


Client.prototype.release = function release(client){
    var self = this;
    self._debug('Releasing:'+client._cycle_id);
    client._cycle_blocked=false;
    if(self._blockedClients>0) {
        self._blockedClients--;
    }
    return true;
};


Client.prototype._block = function _block(client){
    var self = this;
    self._debug('Blocking:'+client._cycle_id);
    client._cycle_blocked=true;
    self._blockedClients++;
    return true;
};


Client.prototype._evict = function _evict(client,cb){
    var self = this;
    self._debug('Evicting:'+client._cycle_id);
    for(var i = 0; i < self.pools.clients.length; i++) {
        if (self.pools.clients[i]._cycle_id === client._cycle_id) {
            self.pools.clients.splice(i, 1);
            break;
        }
    }
    if(self._constructor.validate(client)) {
        self._constructor.destroy(client);
        self._debug('Destroyed:' + client._cycle_id);
    }
    cb();
};


Client.prototype.destroy = function destroy(client){
    var self = this;
    self._debug('Destroying:'+client._cycle_id);
    self._evict(client, function () {
    });
    return true;
};


Client.prototype.acquire = function acquire(cb,blocking){
    var self = this;
    self._debug('Acquiring Client');
    this._getClient(function(err,client){
        if(err){
            self._debug('Error Acquiring Client:'+err);
            return cb(err);
        }
        self._debug('Acquired Client:'+client._cycle_id);
        if(blocking){
            self._block(client);
        }
        cb(null,client);
    });
    return (self.pools.clients.length);
};


Client.prototype._getClient = function _getClient(cb){
    var self = this;
    var found;
    for( connectionKey in self.pools.clients ){
        if (self.pools.counter >= self.pools.clients.length) self.pools.counter = 0;
        var client = self.pools.clients[self.pools.counter++];
        if (client && !client._cycle_blocked && self._constructor.validate(client)) {
            found = true;
            break;
        }
        if (client && client._cycle_blocked) {
            if(self._constructor.queue && self.pools.clients.length > 1){
                self._queuedClients++;
                return this._q.push({callback: cb}, function (err) {
                });
            }
        }
    }
    if(!found){
        return setTimeout(function(){
            self._debug('No Available Pool Clients!');
            cb("No Available Pool Clients!");
        },1000);
    }
    cb(null,client);

};

Client.prototype.info = function info(){
    var self = this;
    return {
        name:self._constructor.name,
        clients : self.pools.clients.length,
        blockedClients:self._blockedClients,
        queuedClients: self._queuedClients,
        currentID:self._nextID
    };
};

///--- Pool Export

function Pool(opts){
    var options = clone(opts);
    //todo add option validations
    return (new Client(options));
}


exports.Pool = Pool;