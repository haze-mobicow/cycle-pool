var EventEmitter = require('events').EventEmitter;
var util = require('util');

var MAX_CLIENT_ID = Math.pow(2, 31) - 1;

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
    if(this._constructor.queue){
        try{
            var async = require('async');
            this._q = async.queue(function (task, callback) {
                setImmediate(function() {
                    self._getClient(task.callback);
                    callback();
                })
            }, this._constructor.queue);
            this._q.drain = function() {
                self._debug('Async Queue Empty');
            };
            this._q.on('saturated',function(){
                self._debug('Async Queue Saturated');
            })

        }catch(e){
            self._debug('Error Loading queue, To use queue please install async! "npm install async"');
            throw new Error('To use queue please install async! "npm install async"')
        }
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
        var c ={
            _cycle_blocked:false,
            _cycle_id: self._nextID,
            _cycle_health:1
        };
        ++self._online;
        for (var attrname in con) { c[attrname] = con[attrname]; }
        self.pools.connections.push(c);
        if(self.pools.connections.length >= self._constructor.size){
            self._debug('Pool is full');
            self.emit('full');
        }
    });
};



Client.prototype.release = function release(client){
    var self = this;
    self._debug('Releasing:'+client._cycle_id);
    client._cycle_blocked=false;
    return true;
};
Client.prototype.block = function block(client){
    var self = this;
    self._debug('Blocking:'+client._cycle_id);
    client._cycle_blocked=true;
    return true;
};
Client.prototype._evict = function _evict(client,cb){
    var self = this;
    self._debug('Evicting:'+client._cycle_id);
    for(var i = 0; i < self.pools.connections.length; i++) {
        if (self.pools.connections[i]._cycle_id === client._cycle_id) {
            self.pools.connections.splice(i, 1);
            break;
        }
    }
    //todo : validate
    this._constructor.destroy(client);
    self._debug('Destroyed:'+client._cycle_id);
    cb();
};

Client.prototype.destroy = function destroy(client){
    var self = this;
    self._debug('Destroying:'+client._cycle_id);
    this._evict(client, function () {
    });
    return true;
};

Client.prototype.acquire = function acquire(cb){
    var self = this;
    self._debug('Acquiring Client');
    this._getClient(function(err,client){
        if(err){
            self._debug('Error Acquiring Client:'+err);
            return cb(err);
        }
        self._debug('Acquired Client:'+client._cycle_id);
        cb(null,client);
    });
    return (self.pools.connections.length);
};
Client.prototype._getClient = function _getClient(cb){
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
            self._debug('No Available Pools Clients!');
            cb("No Available Pools Clients!")
        },1000);
    }
    cb(null,client);

};

//init the pool client
function Pool(opts){
    //todo add option validations
    return (new Client(opts));
}


exports.Pool = Pool;