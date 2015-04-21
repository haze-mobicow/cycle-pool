var EventEmitter = require('events').EventEmitter;
var util = require('util');

function Client(constructor) {
    EventEmitter.call(this);
    var self = this;
    this._q = undefined;
    this.pools = {
        connections: [],
        counter: 0
    };
    this._created = 0;
    this._online = 0;
    this._nextID = 0;
    this._constructor = constructor;
    this._constructor.queue = constructor.queue || false;
    this._constructor.overGrow = constructor.overGrow || false;
    this._constructor.validate = constructor.validate || function () {
        return true;
    };
    this._constructor.destroy = constructor.destroy || function () {
        return true;
    };
    if(constructor.queue) {
        this._loadQ();
    }
    this._load();
}

util.inherits(Client, EventEmitter);


Client.prototype._loadQ = function _loadQ() {
    var self = this;
    if(this._constructor.queue){
        try{
            var async = require('async');
            this._q = async.queue(function (task, callback) {
                setImmediate(function() {
                    self._getClient(task.callback);
                    callback();
                })
            }, this._constructor.queue);
        }catch(e){
            throw new Error('To use queue please install async! "npn install async"')
        }
    }
};

Client.prototype._load = function _load() {
    //events
    this.once('full', sendReady);
    function sendReady() {
        console.log('Ready');
        self.emit('ready');
    }
    var self = this;
    while (this._created < this._constructor.size) {
        this._created += 1;
        setImmediate(function () {
            self._createConnection();
        });
    }

};



Client.prototype._createConnection = function _createConnection() {
    var self = this;
    self._constructor.create(function(err,con){
        var cID = ++self._nextID;
        var c ={
            _cycle_blocked:false,
            _cycle_id: cID,
            _cycle_health:1
        };
        ++self._online;
        for (var attrname in con) { c[attrname] = con[attrname]; }
        self.pools.connections.push(c);
        console.log('L',self.pools.connections.length,self._constructor.size)
        if(self.pools.connections.length >= self._constructor.size){
            self.emit('full');
        }
    });
};



Client.prototype.release = function release(client){
    //self.release = function(client){
    //release the client
    client._cycle_blocked=false;
    return true;
};
Client.prototype.block = function block(client){
    //self.block = function(client){
    //Block the client
    client._cycle_blocked=true;
    return true;
};
Client.prototype._evict = function _evict(client,cb){
    //function evict(client,cb){
    var self = this;
    for(var i = 0; i < self.pools.connections.length; i++) {
        if (self.pools.connections[i]._cycle_id === client._cycle_id) {
            self.pools.connections.splice(i, 1);
            break;
        }
    }
    //todo : validate
    this._constructor.destroy(client);
    cb();
};

Client.prototype.destroy = function destroy(client){
    //self.destroy = function(client){
    //delete the con
    this._evict(client, function () {
    });
    return true;
};

Client.prototype.acquire = function acquire(cb){
    //self.acquire = function(cb){
    var self = this;
    this._getClient(function(err,client){
        if(err){
            return cb(err);
        }
        cb(null,client);
    });
    return (self.pools.connections.length);
};
Client.prototype._getClient = function _getClient(cb){
    //function getClient(cb){
    var self = this;
    var client = undefined;
    var found;
    var counter = 0;
    for( connectionKey in self.pools.connections ){
        if (self.pools.counter >= self.pools.connections.length) self.pools.counter = 0;
        client = self.pools.connections[self.pools.counter++];
        if (client && !client._cycle_blocked) {
            found = true;
            break;
        }
        if (client && client._cycle_blocked) {
            if(this._constructor.queue && self.pools.connections.length > 1){
                return this._q.push({callback: cb}, function (err) {
                });
            }
        }
        counter++;
    }
    if(!found){
        return setTimeout(function(){
            cb("No Available Pools Clients!")
        },1000);
    }
    cb(null,client);

};

//init the pool client
function Pool(opts){
    return (new Client(opts));
}


exports.Pool = Pool;