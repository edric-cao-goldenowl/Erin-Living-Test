import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { UserService } from '../services/user-service';
import { TimezoneService } from '../services/timezone-service';
import {
  CreateUserRequest,
  UpdateUserRequest,
  CreateUserRequestSchema,
  UpdateUserRequestSchema,
} from '../schemas/user';
import { ZodError } from 'zod';

const createResponse = (
  statusCode: number,
  body: Record<string, unknown>,
  headers: Record<string, string> = {}
): APIGatewayProxyResult => {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  };
};

export const createUser = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (!event.body) {
      return createResponse(400, { error: 'Request body is required' });
    }

    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(event.body);
    } catch {
      return createResponse(400, { error: 'Invalid JSON in request body' });
    }

    // Validate with Zod schema
    const validationResult = CreateUserRequestSchema.safeParse(parsedBody);
    if (!validationResult.success) {
      const errors = validationResult.error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      return createResponse(400, {
        error: 'Validation failed',
        details: errors,
      });
    }

    const request: CreateUserRequest = validationResult.data;
    const timezoneService = new TimezoneService();
    const userService = new UserService(timezoneService);
    const user = await userService.createUser(request);

    return createResponse(201, {
      userId: user.userId,
      firstName: user.firstName,
      lastName: user.lastName,
      birthday: user.birthday,
      timezone: user.timezone,
      location: user.location,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } catch (error) {
    console.error('Error creating user:', error);
    if (error instanceof ZodError) {
      const errors = error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      return createResponse(400, {
        error: 'Validation failed',
        details: errors,
      });
    }
    return createResponse(500, {
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

export const deleteUser = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.pathParameters?.userId;

    if (!userId) {
      return createResponse(400, { error: 'userId is required' });
    }

    const timezoneService = new TimezoneService();
    const userService = new UserService(timezoneService);
    const deleted = await userService.deleteUser(userId);

    if (!deleted) {
      return createResponse(404, { error: 'User not found' });
    }

    return createResponse(200, { message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    return createResponse(500, {
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

export const updateUser = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.pathParameters?.userId;

    if (!userId) {
      return createResponse(400, { error: 'userId is required' });
    }

    if (!event.body) {
      return createResponse(400, { error: 'Request body is required' });
    }

    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(event.body);
    } catch {
      return createResponse(400, { error: 'Invalid JSON in request body' });
    }

    // Validate with Zod schema
    const validationResult = UpdateUserRequestSchema.safeParse(parsedBody);
    if (!validationResult.success) {
      const errors = validationResult.error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      return createResponse(400, {
        error: 'Validation failed',
        details: errors,
      });
    }

    const request: UpdateUserRequest = validationResult.data;
    const timezoneService = new TimezoneService();
    const userService = new UserService(timezoneService);
    const user = await userService.updateUser(userId, request);

    if (!user) {
      return createResponse(404, { error: 'User not found' });
    }

    return createResponse(200, {
      userId: user.userId,
      firstName: user.firstName,
      lastName: user.lastName,
      birthday: user.birthday,
      timezone: user.timezone,
      location: user.location,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } catch (error) {
    console.error('Error updating user:', error);
    if (error instanceof ZodError) {
      const errors = error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      return createResponse(400, {
        error: 'Validation failed',
        details: errors,
      });
    }
    return createResponse(500, {
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};
