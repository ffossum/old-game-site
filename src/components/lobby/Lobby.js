import React from 'react';
import {Button} from 'react-bootstrap';
import {LinkContainer} from 'react-router-bootstrap';
import GameList from './GameList';

export default class Lobby extends React.Component {
  render() {
    const {loggedIn} = this.props.login;
    const {games} = this.props.lobby;

    return (
      <div>
        <h1>Lobby</h1>
        <div className="form-group">
          <LinkContainer
            disabled={!loggedIn}
            to="/create">
            <Button>Create game</Button>
          </LinkContainer>
        </div>

        <GameList games={games} />
      </div>
    );
  }
};