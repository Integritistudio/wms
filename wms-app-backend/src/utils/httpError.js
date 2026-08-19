function httpError(statusCode, message, errors) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (errors) {
    error.errors = errors;
  }
  return error;
}

module.exports = {
  httpError,
};
