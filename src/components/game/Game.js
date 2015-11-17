import React, {PropTypes} from 'react';
import {Alert, Panel} from 'react-bootstrap';
import Chat from '../chat/Chat';
import GameLobbyButtons from './GameLobbyButtons';
import _ from 'lodash';
import PlayerList from './PlayerList';
import '../../stylesheets/game.scss';

export default class Game extends React.Component {
  render() {
    const userId = this.props.login.id;
    const {game, players} = this.props;

    if (!game) {
      return <Alert bsStyle='danger'>Invalid game id</Alert>;
    } else {
      const {messages = []} = game;
      const inGame = _.contains(game.players, userId);

      return (
        <div>
          <div className='game-player-list'>
            <PlayerList players={players} game={game} />
          </div>
          <GameLobbyButtons
            login={this.props.login}
            game={game}
            joinGame={this.props.joinGame}
            leaveGame={this.props.leaveGame}
            startGame={this.props.startGame} />
          {
            inGame ?
              <Panel>
                <Chat
                  login={this.props.login}
                  messages={messages}
                  users={players}
                  sendMessage={_.partial(this.props.sendGameMessage, game.id)} />
              </Panel> : null
          }
        </div>
      );
    }
  }
};

Game.propTypes = {
  login: PropTypes.object.isRequired,
  game: PropTypes.object,
  joinGame: PropTypes.func.isRequired,
  leaveGame: PropTypes.func.isRequired,
  startGame: PropTypes.func.isRequired
};