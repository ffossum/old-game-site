var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var favicon = require('serve-favicon');
var path = require('path');
var shortid = require('shortid');
var _ = require('underscore');

app.use(express.static('public'));
app.use(favicon(path.join(__dirname,'public','static','meeple.png')));

app.get('*', (req, res) => {
  res.render('index.jade', {
    env: process.env.NODE_ENV
  });
});

var users = {};
var games = {};

io.on('connection', socket => {
  var loggedIn = false;

  socket.emit('UPDATE_GAMES', games);

  socket.on('SEND_MESSAGE', data => {
    socket.broadcast.emit('NEW_MESSAGE', data);
  });

  socket.on('LOG_IN_REQUEST', username => {

    if (loggedIn) {
      delete users[socket.username];
    }

    if (users[username]){
      socket.emit('LOG_IN_FAILURE', 'USERNAME_TAKEN');
    } else {

      socket.username = username;
      users[username] = username;

      loggedIn = true;
      socket.emit('LOG_IN_SUCCESS');
    }
  });

  socket.on('CREATE_GAME_REQUEST', () => {
    var gameId = shortid.generate();
    socket.join(gameId);

    var game = {
      host: socket.username,
      players: [socket.username]
    };

    games[gameId] = game;

    var response = {
      id: gameId,
      game: game
    };

    socket.emit('CREATE_GAME_SUCCESS', response);
    socket.broadcast.emit('GAME_CREATED', response);
  });

  socket.on('JOIN_GAME_REQUEST', gameId => {
    socket.join(gameId);
    var game = games[gameId];

    if (game) {
      game.players.push(socket.username);

      socket.emit('JOIN_GAME_SUCCESS', {
        id: gameId,
        game: game
      });
      socket.broadcast.to(gameId).emit('PLAYER_JOINED', {
        id: gameId,
        name: socket.username
      });

    } else {
      socket.emit('JOIN_GAME_FAILURE', gameId);
    }
  });

  socket.on('LEAVE_GAME_REQUEST', gameId => {
    socket.leave(gameId);
    var game = games[gameId];

    if (game) {
      game.players = _.without(game.players, socket.username);

      socket.emit('LEAVE_GAME_SUCCESS', {
        id: gameId,
        game: game
      });
      socket.broadcast.to(gameId).emit('PLAYER_LEFT', {
        id: gameId,
        name: socket.username
      });
    }
  });

  socket.on('SEND_GAME_MESSAGE', data => {
    var gameId = data.id;
    var game = games[gameId];
    if (game) {
      socket.broadcast.to(gameId).emit('NEW_GAME_MESSAGE', data);
    }
  });

  socket.on('LOG_OUT', () => {
    loggedIn = false;
    delete users[socket.username];
  });

  socket.on('disconnect', () => {
    delete users[socket.username];
  });
});

server.listen(8080, 'localhost', err => {
  if (err) {
    console.log(err);
    return;
  }

  var environment = process.env.NODE_ENV === 'production' ? 'Production' : 'Development';
  console.log(environment + ' environment');

  console.log('Listening at localhost:8080');
});