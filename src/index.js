var net = require('net');
var mongoose = require('mongoose');

var auth = require('./auth.json');

// parse argv
var argv = {};
process.argv.forEach(function (val, index, array) {
  if (val[0] === '-') {
    var i = val.indexOf('=');
    if (~i) {
      argv[val.slice(0, i)] = val.slice(i);
    } else {
      argv[val] = true;
    }
  }
});

var logging = argv['-log'];
var consoleLogging = argv['-console'];
var chatMessageLogging = argv['-chat'];
var fs = require('fs');

console.log(logging);
console.log(consoleLogging);
console.log(chatMessageLogging);
console.log("db: " + argv['-db']);

var url = auth.mongolab.url
.replace('<dbuser>', auth.mongolab.admin.dbuser)
.replace('<dbpassword>', auth.mongolab.admin.dbpassword);

console.log("mongolab url: " + url);

var channel = "totalbiscuit";

// init database
var db = mongoose.connect(url).connection;

var Schema = mongoose.Schema;
var ChatMessage = mongoose.model('ChatMessage', mongoose.Schema({
  _id: { type: Schema.ObjectId, auto: true },
  channel: String,
  user: String,
  message: String
}));

db.on('error', function (err) {
  console.log("db connection error:" + err.message || err || ' null');
});

db.once('open', function () {
	console.log("Connected to Database");
  var opts = {port: auth.port, host: auth.host};
	console.log(opts);
  var client = net.connect(opts);

  client.on('connect', function () {
    console.log("Connected to Twitch");

    // Send authentication info
    client.write("PASS " + auth.oauth + "\n");
    client.write("NICK " + auth.nick + "\n");

    client.write("JOIN #"+channel+"\n");
  });

  var count = 0;
  var buffer = "";
  client.on('data', function (data) {
    count++;
    var str = data.toString('utf8');

    // parse the message
    buffer += str;
    var lastNewLine = buffer.lastIndexOf('\n');
    var stub = buffer.substring(0, lastNewLine);
    // rewind the buffer!!
    buffer = buffer.substring(lastNewLine);
    var split = stub.split('\n');
    for (i in split) {
      var line = split[i];
      var msg = parseMessage(line);

      if (logging) {
        fs.appendFile('irclog.txt', msg.message, function (err) {
          if (err)
            console.log("Error appending to file: " + err);
        });
      }

      if (consoleLogging) {
        sysout(msg);
      }

      // handle the message (repond to PING etc)
      handleMessage(client, msg);
    }
  });

  client.on('end', function (err) {
    console.log("Disconnected from server: " + err);
		setTimeout(function() {
			console.log("Process Exit");
    	process.exit(1); // exit failure
		}, 5000);
  });

});

function sysout(msg) {
  console.log(msg.message);
  console.log({
    prefix: msg.prefix,
    command: msg.command,
    params: msg.params
  });
  console.log();
}

var saveCount = 0;
var messagesCount = 0;

function statsOut() {
  console.log("   =============   ");
  console.log("     " + saveCount + "/" + messagesCount);
  console.log("   =============   ");

  setTimeout(statsOut, 30000);
}
statsOut();

function handleMessage (client, msg) {
  switch (msg.command.trim()) {
    case 'PING':
        client.write("PONG " + auth.host + "\n");
        console.log("PONG!\n");
      break;
    case 'PRIVMSG':
        messagesCount++;

        var chatMessageIndexOf = msg.params.indexOf(':');
        var channel = msg.params.slice(0, chatMessageIndexOf);
        var chatMessage = msg.params.slice(chatMessageIndexOf + 1);
        var user = msg.prefix.user.slice(1);

        if (chatMessageLogging) {
          console.log(user + ": " + chatMessage);
        }

        if (argv['-db']) {
          // save to mongodb
          var cm = new ChatMessage({
            channel: channel,
            user: user,
            message: chatMessage
          });
          cm.save(function (err, doc) {
            if (err) return console.log("error saving to database: " + err);
            saveCount++;
          });
        }

      break;
  }
}

/** RFC 1459, 2.3.1
<message>  ::= [':' <prefix> <SPACE> ] <command> <params> <crlf>
<prefix>   ::= <servername> | <nick> [ '!' <user> ] [ '@' <host> ]
<command>  ::= <letter> { <letter> } | <number> <number> <number>
<SPACE>    ::= ' ' { ' ' }
<params>   ::= <SPACE> [ ':' <trailing> | <middle> <params> ]

<middle>   ::= <Any *non-empty* sequence of octets not including SPACE
               or NUL or CR or LF, the first of which may not be ':'>
<trailing> ::= <Any, possibly *empty*, sequence of octets not including
                NUL or CR or LF>
<crlf>     ::= CR LF
*/

function parseMessage (msg) {
  str = msg.trim();

  var prefix = null; // optional
  var command = null; // required
  var params = null; // required

  // parse prefix
  if (str[0] === ':') { // optional <prefix> found
    var l = prefixString = str.slice(0, str.indexOf(' ')).trim();
    var indexOfUser = l.indexOf('!');
    var indexOfHost = l.indexOf('@');

    var host = ''; // optional
    if (~indexOfHost) {
      host = l.slice( indexOfHost );
      l = l.slice(0, -host.length);
    }

    var user = ''; // optional
    if (~indexOfUser) {
      user = l.slice( indexOfUser );
      l = l.slice(0, -user.length);
    }

    var name = ''; // either <servername> or <nick>
    name = l.slice(1);

    prefix = {
      name: name,
      user: user,
      host: host,
      //data: prefixString
    }

    str = str.slice(prefixString.length); // cut out the prefix part
  } // eof prefix parse

  // str is now assumed to be without the prefix information
  str = str.trim();
  var indexOfParams = str.indexOf(' ');
  var command = str.slice(0, indexOfParams).trim();
  var params = str.slice(indexOfParams).trim();

  // check optionals
  if (params[0] === ':') { // <trailing> found
  } else { // <middle> <params> found
  }

  // return a message object
  return {
    message: msg,
    prefix: prefix,
    command: command,
    params: params
  }
}
