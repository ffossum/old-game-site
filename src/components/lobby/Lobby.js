import React from 'react';
import {Button, LinkContainer, Panel} from '../common';
import GameList from './GameList';

export default class Lobby extends React.Component {
  render() {
    const {games, loggedIn} = this.props;

    return (
      <div className="container">
        <Panel>
          <h1>Lobby</h1>
          <div className="lobby-game-buttons">
            <LinkContainer
              disabled={!loggedIn}
              to="/create">
              <Button>Create game</Button>
            </LinkContainer>
          </div>
          <GameList games={games} />
        </Panel>
      </div>
    );
  }
};
