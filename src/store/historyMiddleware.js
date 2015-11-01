export default globals => store => next => action => {
  next(action);

  if (action.meta && action.meta.goTo) {
    const {history} = globals;
    history.pushState(null, action.meta.goTo);
  }
};