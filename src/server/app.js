import express from 'express';
import {Server} from 'http';
import favicon from 'serve-favicon';
import path from 'path';
import shortid from 'shortid';
import _ from 'lodash';
import db, {getUser} from './db';
import * as loveLetter from './loveLetter';
import passport from 'passport';
import {Strategy as LocalStrategy} from 'passport-local';
import bodyParser from 'body-parser';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import expressJwt from 'express-jwt';
import {secret} from './config';
import graphQLHTTP from 'express-graphql';
import {Schema} from './graphql/schema';
import falcorExpress from 'falcor-express';
import falcorRouter from './falcor/falcorRouter';
import {match, RouterContext} from 'react-router';
import React from 'react';
import {renderToString} from 'react-dom/server';
import routes from '../serverRoutes';
import {createStore} from 'redux';
import {Provider} from 'react-redux';
import reducer from '../reducers';
import compress from 'compression';
import cookie from 'cookie';
import cookieParser from 'cookie-parser';

const app = express();
const server = Server(app);
const io = require('socket.io')(server);

app.use(compress());
app.use(express.static('public'));
app.use(favicon(path.join('public','static','meeple.png')));

app.use('/model.json', falcorExpress.dataSourceRoute((req, res) => falcorRouter));

const graphQLOptions = {schema: Schema};
if (process.env.NODE_ENV !== 'production') {
  graphQLOptions.graphiql = true;
  graphQLOptions.pretty = true;
}
app.use('/graphql', graphQLHTTP(graphQLOptions));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  done(null, db.users[id]);
});

passport.use(new LocalStrategy({
    session: false
  },
  (username, password, done) => {
    const user = _.findWhere(db.users, {name: username});

    if (!user) {
      return done(null, false);
    }

    bcrypt.compare(password, user.password, (err, res) => {
      return done(null, res && user);
    });
  }
));

app.use(bodyParser.json());
app.use(passport.initialize());

app.post('/register',
  (req, res) => {
    const {email, username, password} = req.body;
    const emailTaken = _.findWhere(db.users, {email});
    const usernameTaken = _.findWhere(db.users, {name: username});

    const errors = {};
    if (emailTaken) {
      errors.email = 'EMAIL_TAKEN';
    }
    if (usernameTaken) {
      errors.username = 'USERNAME_TAKEN';
    }

    if (!_.isEmpty(errors)) {
      res.status(403).json(errors);
    } else {
      const userId = shortid.generate();
      bcrypt.genSalt(10, function(err, salt) {
        bcrypt.hash(password, salt, (err, hash) => {
          const avatar = crypto.createHash('md5').update(email).digest('hex');
          db.users[userId] = {
            id: userId,
            name: username,
            email,
            password: hash,
            avatar
          };

          jwt.sign({id: userId}, secret, {expiresIn: '7d'}, token => {
            res.cookie('token', token, {
              httpOnly: true,
              expires: getCookieExpirationDate()
            });
            const user = {
              id: userId,
              name: username,
              avatar
            };
            res.status(200).json(user);
          });
        });
      });
    }
  }
);

function getCookieExpirationDate() {
  return new Date(Number(new Date()) + 604800000); // 7 days
}

function setJwtCookie(req, res, next) {
  jwt.sign({id: req.user.id}, secret, {expiresIn: '7d'}, token => {
    res.cookie('token', token, {
      httpOnly: true,
      expires: getCookieExpirationDate()
    });
    next();
  });
}

app.post('/login',
  passport.authenticate('local'),
  setJwtCookie,
  (req, res) => {
    const {id, name, avatar} = req.user;
    const user = {id, name, avatar};
    res.status(200).json(user);
  }
);

app.use(cookieParser());
const jwtMiddleware = expressJwt({
  secret,
  credentialsRequired: false,
  getToken(req) {
    return req.cookies.token;
  }
});

app.get('*',
  jwtMiddleware,
  (req, res) => {
    const initialState = reducer({}, {type: '@@INIT'});
    if (!req.user) {
      respondRenderedApp(req, res, initialState);
      return;
    }
    getUser(req.user.id)
      .then(user => {
        initialState.login = {
          loggedIn: true,
          username: user.name,
          id: user.id
        };
        respondRenderedApp(req, res, initialState);
      })
      .catch(error => {
        respondRenderedApp(req, res, initialState);
      });
  });

function respondRenderedApp(req, res, initialState) {
  match({routes, location: req.url}, (error, redirectLocation, renderProps) => {
    const renderedApp = renderApp(initialState, renderProps);
    res.render(path.join(__dirname, 'views', 'index.jade'), {
      env: process.env.NODE_ENV,
      renderedApp,
      initialState: JSON.stringify(initialState)
    });
  });
}

function renderApp(initialState, renderProps) {
  const reduxStore = createStore(reducer, initialState);
  return renderToString(
    <Provider store={reduxStore}>
      <RouterContext {...renderProps}/>
    </Provider>
  );
}

const users = {};
const userSockets = {};
const games = {};

function isStartable(game) {
  return game.players.length >= game.settings.players.required;
}

function isJoinable(game) {
  const {required, optional} = game.settings.players;
  return game.players.length < required + optional;
}

io.on('connection', socket => {
  const {headers} = socket.request;
  const cookies = headers.cookie
    ? cookie.parse(headers.cookie)
    : {};

  if (cookies.token) {
    jwt.verify(cookies.token, secret, (err, decoded) => {
      if (err) {
        socket.emit('LOG_IN_FAILURE', 'AUTHENTICATION_FAILURE');
      } else {
        const userId = decoded.id;
        const user = db.users[userId];

        if (!user) {
          socket.emit('LOG_IN_FAILURE', 'AUTHENTICATION_FAILURE');
        } else {
          socket.user = _.pick(user, ['id', 'name', 'avatar']);
          users[user.id] = socket.user;
          userSockets[user.id] = _.union(userSockets[user.id], [socket]);

          _.each(games, (game, gameId) => {
            if (_.contains(game.players, user.id)) {
              socket.join(gameId);
              socket.broadcast.to(gameId).emit('PLAYER_RECONNECTED', {
                game: {id: gameId},
                user: {id: user.id}
              });

              if (game.status === 'IN_PROGRESS') {
                socket.emit('UPDATE_GAME_STATE', {
                  game: {
                    id: gameId,
                    state: loveLetter.asVisibleBy(game.state, user.id)
                  }
                });
              }
            }
          });
        }
      }
    });
  }

  socket.emit('UPDATE_GAMES', _.mapValues(games, game => {
    return _.pick(game, ['id', 'host', 'players', 'status', 'settings']);
  }));

  socket.on('SEND_MESSAGE', data => {
    socket.broadcast.emit('NEW_MESSAGE', data);
  });

  socket.on('CREATE_GAME_REQUEST', settings => {
    const gameId = shortid.generate();
    _.each(userSockets[socket.user.id], userSocket => userSocket.join(gameId));

    const game = {
      id: gameId,
      host: socket.user.id,
      players: [socket.user.id],
      settings
    };

    games[gameId] = game;

    socket.emit('CREATE_GAME_SUCCESS', game);
    socket.broadcast.emit('GAME_CREATED', game);
  });

  socket.on('JOIN_GAME_REQUEST', gameId => {
    const game = games[gameId];

    if (game && isJoinable(game)) {
      _.each(userSockets[socket.user.id], userSocket => userSocket.join(gameId));
      game.players.push(socket.user.id);

      socket.emit('JOIN_GAME_SUCCESS', game);
      socket.broadcast.emit('PLAYER_JOINED', {
        game: {id: gameId},
        user: {id: socket.user.id}
      });

    } else {
      socket.emit('JOIN_GAME_FAILURE', gameId);
    }
  });

  socket.on('LEAVE_GAME_REQUEST', gameId => {
    socket.leave(gameId);
    const game = games[gameId];

    if (game) {
      game.players = _.without(game.players, socket.user.id);

      socket.emit('LEAVE_GAME_SUCCESS', game);
      socket.broadcast.emit('PLAYER_LEFT', {
        game: {id: gameId},
        user: {id: socket.user.id}
      });
    }
  });

  socket.on('SEND_GAME_MESSAGE', data => {
    const gameId = data.game.id;
    const game = games[gameId];
    if (game) {
      socket.broadcast.to(gameId).emit('NEW_GAME_MESSAGE', data);
    }
  });

  socket.on('START_GAME_REQUEST', data => {
    const gameId = data.game.id;
    const game = games[gameId];

    if (game && isStartable(game)) {
      game.status = 'IN_PROGRESS';
      game.state = loveLetter.createInitialState(game.players);
      _.each(game.players, userId => {
        _.each(userSockets[userId], userSocket => {
          userSocket.emit('UPDATE_GAME_STATE', {
            game: {
              id: gameId,
              state: loveLetter.asVisibleBy(game.state, userId)
            }
          });
        });
      });

      socket.emit('START_GAME_SUCCESS', data);
      socket.broadcast.to(gameId).emit('GAME_STARTED', data);
    }
  });

  socket.on('PERFORM_GAME_ACTION', data => {
    const gameId = data.game.id;
    const game = games[gameId];

    const action = _.extend(data.action, {acting: socket.user.id});
    game.state = loveLetter.useCard(game.state, action);

    _.each(game.players, userId => {
      _.each(userSockets[userId], userSocket => {
        userSocket.emit('UPDATE_GAME_STATE', {
          game: {
            id: gameId,
            state: loveLetter.asVisibleBy(game.state, userId)
          }
        });
      });
    });
  });

  socket.on('LOG_OUT', () => {
    if (socket.user) {
      _.each(games, (game, gameId) => {
        if (_.contains(game.players, socket.user.id)) {
          socket.leave(gameId);
          socket.broadcast.to(gameId).emit('PLAYER_DISCONNECTED', {
            game: {id: gameId},
            user: {id: socket.user.id}
          });
        }
      });

      userSockets[socket.user.id] = _.without(userSockets[socket.user.id], socket);
      if (_.isEmpty(userSockets[socket.user.id])) {
        delete users[socket.user.id];
      }
    }
  });

  socket.on('disconnect', () => {
    if (socket.user) {
      _.each(games, (game, gameId) => {
        if (_.contains(game.players, socket.user.id)) {
          socket.broadcast.to(gameId).emit('PLAYER_DISCONNECTED', {
            game: {id: gameId},
            user: {id: socket.user.id}
          });
        }
      });

      userSockets[socket.user.id] = _.without(userSockets[socket.user.id], socket);
      if (_.isEmpty(userSockets[socket.user.id])) {
        delete users[socket.user.id];
      }
    }
  });
});

server.listen(8080, '0.0.0.0', err => {
  if (err) {
    console.log(err);
    return;
  }

  var environment = process.env.NODE_ENV === 'production' ? 'Production' : 'Development';
  console.log(environment + ' environment');

  console.log('Listening on port 8080');
});
