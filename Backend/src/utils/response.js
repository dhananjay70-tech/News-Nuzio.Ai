/**
 * Standardized API response helpers
 */
export const successResponse = (res, data, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

export const errorResponse = (res, message, statusCode = 500, code = null) => {
  const response = {
    success: false,
    message,
  };
  if (code) response.code = code;
  return res.status(statusCode).json(response);
};

export const created = (res, data, message = 'Created') => successResponse(res, data, message, 201);

export const notFound = (res, message = 'Resource not found') =>
  errorResponse(res, message, 404, 'NOT_FOUND');

export const unauthorized = (res, message = 'Unauthorized') =>
  errorResponse(res, message, 401, 'UNAUTHORIZED');

export const forbidden = (res, message = 'Forbidden') =>
  errorResponse(res, message, 403, 'FORBIDDEN');

export const badRequest = (res, message = 'Bad request') =>
  errorResponse(res, message, 400, 'BAD_REQUEST');
