var express = require('express');
var http = require('http');

var app = express();
var server = http.Server(app);
var socketIO = require('socket.io');
var io = require('socket.io')(server);

var port = process.env.PORT || 40400;

var cache = [];
var cacheLimit = 30;

var config = {
  pollingInterval: 1000, // 1 second
  limit: 30, // 30 documents per poll
};

// connect to database
var mongoose = require('mongoose');
var auth = require('../auth.json');
var url = auth.mongolab.url
  .replace('<dbuser>', auth.mongolab.client.dbuser)
  .replace('<dbpassword>', auth.mongolab.client.dbpassword)
var db = mongoose.connect(url).connection;

db.on('error', function (err) {
  console.log("db connection error:" + err);
});
db.once('open', function () {
  console.log("connected to database");
  // start server
  server.listen(port, function () {
    console.log("listening on *:%s", port);
  });

  var Schema = mongoose.Schema;
  var ChatMessage = mongoose.model('ChatMessage', Schema({
    _id: { type: Schema.ObjectId },
    channel: String,
    user: String,
    message: String
  }));

  /* find latest entry, which we will use to
   * find the next batch of new entries
   * */
  var latest = null;
  ChatMessage.findOne().sort({field: 'asc', _id: -1}).limit(1).findOne(function (err, doc) {
    if (err) {
      return console.log("db error loading newest entry");
    }
    latest = doc;
    console.log("latest entry found: " + doc);
    cache.push(doc); // push it to the cache

		getLatestEntries(function() {
    	// start of the scheduled polling
    	setTimeout(getNewEntires, config.pollingInterval);
		});
  });

  function getNewEntires() {
    process.stdout.write("\nfetching new entries... ");
    ChatMessage
      .find({})
      .where('_id').gt(latest._id)
      .limit(config.limit || 30)
      .exec(function (err, docs) {
        if (err) { // failure
          process.stdout.write("db poll error: " + err);
        } else { // success
          latest = docs[docs.length - 1] || latest;
          process.stdout.write("found new entries: " + docs.length);
          for (var i = 0; i < docs.length; i++) {
            var doc = docs[i];
            if (doc && doc.user && doc.message) {
              console.log("  " + doc.user + ": " + doc.message);
            }
          }
          handleNewEntries(docs);
        }
        // schedule next poll
        setTimeout(getNewEntires, config.pollingInterval);
      });
  };

	// get latest cacheLimit (30) entries to update the cache
	function getLatestEntries(cb) {
		ChatMessage
			.find({})
			.sort('-_id')
			.where('_id').lt(latest.id)
			.limit(config.limit || 30)
			.exec(function (err, docs) {
				if (err) {
					return;
				}
				cache = docs.reverse();
				if ('function' == typeof cb)
					cb()
			});
	}

});

function handleNewEntries (docs) {
  cache = cache.concat(docs);
	cache = cache.slice(-cacheLimit);
  process.stdout.write(". Building batch..");

  if (docs.length > 0) {
    // send to all sockets the new messages
    var batch = docs.map(function (val, ind, arr) {
      return {
        "user": val.user,
        "message": val.message
      }
    });
    process.stdout.write(" sending batch..");
    io.emit('new batch', batch);
    process.stdout.write(" batch sent to: " + io.engine.clientsCount);
  } else {
    process.stdout.write(" Batch Empty. Nothing sent.");
  }
};

// setup routing
app.get('/', function (req, res) {
  res.sendFile(__dirname + '/index.html');
});

var emoticons = require('./emoticons.json');
app.get('/emoticons', function (req, res) {
	res.json(emoticons);
});

// setup web sockets
io.on('connection', function (socket) {
  process.stdout.write("\nuser has connected");
  // send recent message history to the newly connected user
  var list = cache.map(function (val, ind, arr) {
    return {
      "user": val.user,
      "message": val.message
    }
  });
  socket.emit('recent history', list);
  process.stdout.write(" > recent history sent [%s]".replace('%s', list.length));

  socket.on('disconnect', function () {
    process.stdout.write("\nuser disconnected");
  });
});
