import * as types from '../constants/ActionTypes';

export function performGameAction(payload) {
  return {
    type: types.PERFORM_GAME_ACTION,
    payload,
    meta: {
      socket: true
    }
  };
};

export function updateGameState(payload) {
  return {
    type: types.UPDATE_GAME_STATE,
    payload
  };
};

export function dismissModal(gameId) {
  return {
    type: types.DISMISS_MODAL,
    payload: {
      game: {
        id: gameId
      }
    }
  };
}
