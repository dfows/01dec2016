var port = process.env.PORT || 8888;

var express = require('express');
var app = express();

var bodyParser = require('body-parser');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));

var apiRoutes = require('./api');
app.use('/api', apiRoutes);

app.all('/', function(req, res) {
  res.send("do i know what im doing. lol. no.");
});

app.listen(port);
