import {LOG_IN_REQUEST, LOG_IN_SUCCESS, LOG_IN_FAILURE, LOG_OUT} from '../constants/ActionTypes';

const initialState = {
  loggedIn: false
};

export default function(state = initialState, action) {
  switch (action.type) {
    case LOG_IN_REQUEST:
      return {
        loggedIn: state.loggedIn,
        waiting: true,
        username: action.payload
      };

    case LOG_IN_SUCCESS:
      const {user} = action.payload;
      return {
        loggedIn: true,
        username: user.name,
        id: user.id
      };

    case LOG_IN_FAILURE:
      return {
        loggedIn: state.loggedIn,
        error: action.payload,
        username: state.username
      };

    case LOG_OUT:
      return initialState;

    default:
      return state;
  }
};
