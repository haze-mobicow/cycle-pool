# About

  Generic blocking/non blocking resource pool.  This module was inspired by the generic-pool module by James Cooper and can work as a drop-in replacement.
  cycle-pool round robins connections letting you choose to block/release a pool thread. 

## Installation

    $ npm install haze-mobicow/cycle-pool
    
## Example

### Step 1 - Create pool using a factory object

```js
// Create a MySQL connection pool with
// 10 connections, and a queue with 5 concurrent workers
var poolModule = require('cycle-pool');
var pool = poolModule.Pool({
    name     : 'mysql',
    size:10,
    queue:5,
    create   : function(callback) {
        var Client = require('mysql').Client;
        var c = new Client();
        c.user     = 'scott';
        c.password = 'tiger';
        c.database = 'mydb';
        c.connect();
        // parameter order: err, resource
        callback(null, c);
    },
    destroy  : function(client) { client.end(); },
});
```

### Step 2 - Use pool in your code to acquire/release resources    

#### Blocking client

```js
// acquire connection - callback function is called
// once a resource becomes available
pool.acquire(function(err, client) {
    if (err) {
        // handle error - this is generally the err from your
        // factory.create function  
    }
    else {
        client.query("select * from foo", [], function() {
            // return object back to pool
            pool.release(client);
        });
    }
},true);
```


#### Non Blocking client

```js
// acquire connection - callback function is called
pool.acquire(function(err, client) {
    if (err) {
        // handle error - this is generally the err from your
        // factory.create function  
    }
    else {
        client.query("select * from foo", [], function() {
        });
    }
});
```