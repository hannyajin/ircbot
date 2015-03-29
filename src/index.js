var net = require('net');
var mongoose = require('mongoose');

var auth = require('./auth.json');

var url = auth.mongolab.url
	.replace('<dbuser>', auth.mongolab.dbuser)
	.replace('<dbpassword>', auth.mongolab.dbpassword);

var db = mongoose.connect(url).connection;

db.on('error', function (err) {
	console.log("db connection error:" + err.message || err || ' null');
});

db.once('open', function () {
  var opts = {port: auth.port, host: auth.host};
  var client = net.connect(opts);

  client.on('connect', function () {
    console.log("Connected to server!");

    // Send authentication info
    client.write("PASS " + auth.oauth + "\n");
    client.write("NICK " + auth.nick + "\n");
  });

  var count = 0;
	var buffer = "";
  client.on('data', function (data) {
		count++;
    var str = data.toString('utf8');
    //console.log(str + "    ["+count+++"]");

		// parse the message
		buffer += str;
		var lastNewLine = buffer.lastIndexOf('\n');
		var stub = buffer.substring(0, lastNewLine);
		var split = stub.split('\n');
		for (i in split) {
			var line = split[i];
			console.log(line);
		}
  });

  client.on('end', function () {
    console.log("Disconnected from server");
  });

});

function parse (str) {
	
}
