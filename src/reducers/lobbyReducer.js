import * as types from '../constants/ActionTypes';
import _ from 'underscore';
import Immutable, {List} from 'immutable';

const initialState = {};

export default function games(state = initialState, action) {
  switch (action.type) {

    case types.UPDATE_GAMES:
      return action.payload;

    case types.GAME_CREATED:
    case types.LEAVE_GAME_SUCCESS:
      return {
        ...state,
        [action.payload.id]: action.payload.game
      };

    case types.CREATE_GAME_SUCCESS:
    case types.JOIN_GAME_SUCCESS: {
      const game = _.extend({}, action.payload.game, {messages: []});
      return {
        ...state,
        [action.payload.id]: game
      };
    }

    case types.PLAYER_JOINED: {
      const immutableState = Immutable.fromJS(state);

      return immutableState
        .updateIn([action.payload.id, 'players'],
          players => players.push(action.payload.name))
        .updateIn([action.payload.id, 'messages'],
          messages => (messages || new List()).push({text: `${action.payload.name} has joined the game.`}))
        .toJS();
    }

    case types.PLAYER_LEFT: {
      const immutableState = Immutable.fromJS(state);

      return immutableState
        .updateIn([action.payload.id, 'players'],
          players => players.filter(player => player !== action.payload.name))
        .updateIn([action.payload.id, 'messages'],
          messages => (messages || new List()).push({text: `${action.payload.name} has left the game.`}))
        .toJS();
    }

    case types.NEW_GAME_MESSAGE:
    case types.SEND_GAME_MESSAGE: {
      const immutableState = Immutable.fromJS(state);

      return immutableState.updateIn([action.payload.id, 'messages'],
        messages => (messages || new List()).push(action.payload.msg)).toJS();
    }

    default:
      return state;
  }
}
