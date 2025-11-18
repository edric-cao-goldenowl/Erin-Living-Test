import { APIGatewayProxyEvent } from 'aws-lambda';
import { createUser, deleteUser, updateUser } from '../../src/handlers/user';
import { UserService } from '../../src/services/user-service';

jest.mock('../../src/services/user-service');
jest.mock('../../src/services/timezone-service');

// Mock UserService instance
const mockUserServiceInstance = {
  createUser: jest.fn(),
  deleteUser: jest.fn(),
  updateUser: jest.fn(),
} as unknown as UserService;

// Mock UserService constructor
(UserService as jest.MockedClass<typeof UserService>).mockImplementation(() => {
  return mockUserServiceInstance;
});

describe('User Handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createUser', () => {
    it('should create user successfully', async () => {
      const mockUser = {
        userId: '123',
        firstName: 'Edric',
        lastName: 'Cao',
        birthday: '1990-01-15',
        timezone: 'America/New_York',
        location: {
          city: 'New York',
          province: 'New York',
          lat: 40.7128,
          lng: -74.006,
        },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      (mockUserServiceInstance.createUser as jest.Mock).mockResolvedValue(mockUser);

      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          firstName: 'Edric',
          lastName: 'Cao',
          birthday: '1990-01-15',
          timezone: 'America/New_York',
          location: {
            city: 'New York',
            province: 'New York',
            lat: 40.7128,
            lng: -74.006,
          },
        }),
      };

      const result = await createUser(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.userId).toBe('123');
      expect(body.firstName).toBe('Edric');
      expect(body.location).toEqual({
        city: 'New York',
        province: 'New York',
        lat: 40.7128,
        lng: -74.006,
      });
    });

    it('should return 400 for missing fields', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          firstName: 'Edric',
        }),
      };

      const result = await createUser(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(400);
    });

    it('should return 400 for invalid date format', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          firstName: 'Edric',
          lastName: 'Cao',
          birthday: 'invalid-date',
          timezone: 'America/New_York',
          location: {
            city: 'New York',
            province: 'New York',
            lat: 40.7128,
            lng: -74.006,
          },
        }),
      };

      const result = await createUser(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(400);
    });

    it('should return 400 for missing location', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          firstName: 'Edric',
          lastName: 'Cao',
          birthday: '1990-01-15',
          timezone: 'America/New_York',
        }),
      };

      const result = await createUser(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(400);
    });

    it('should return 400 for invalid location format', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          firstName: 'Edric',
          lastName: 'Cao',
          birthday: '1990-01-15',
          timezone: 'America/New_York',
          location: {
            city: 'New York',
            // missing province, lat, lng
          },
        }),
      };

      const result = await createUser(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(400);
    });
  });

  describe('deleteUser', () => {
    it('should delete user successfully', async () => {
      (mockUserServiceInstance.deleteUser as jest.Mock).mockResolvedValue(true);

      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          userId: '123',
        },
      };

      const result = await deleteUser(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(200);
    });

    it('should return 404 if user not found', async () => {
      (mockUserServiceInstance.deleteUser as jest.Mock).mockResolvedValue(false);

      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          userId: 'non-existent',
        },
      };

      const result = await deleteUser(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(404);
    });
  });

  describe('updateUser', () => {
    it('should update user successfully', async () => {
      const mockUser = {
        userId: '123',
        firstName: 'Jane',
        lastName: 'Cao',
        birthday: '1990-01-15',
        timezone: 'America/New_York',
        location: {
          city: 'New York',
          province: 'New York',
          lat: 40.7128,
          lng: -74.006,
        },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      (mockUserServiceInstance.updateUser as jest.Mock).mockResolvedValue(mockUser);

      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          userId: '123',
        },
        body: JSON.stringify({
          firstName: 'Jane',
        }),
      };

      const result = await updateUser(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.firstName).toBe('Jane');
      expect(body.location).toEqual({
        city: 'New York',
        province: 'New York',
        lat: 40.7128,
        lng: -74.006,
      });
    });

    it('should update location successfully', async () => {
      const mockUser = {
        userId: '123',
        firstName: 'Edric',
        lastName: 'Cao',
        birthday: '1990-01-15',
        timezone: 'Australia/Melbourne',
        location: {
          city: 'Melbourne',
          province: 'Victoria',
          lat: -37.8136,
          lng: 144.9631,
        },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      (mockUserServiceInstance.updateUser as jest.Mock).mockResolvedValue(mockUser);

      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          userId: '123',
        },
        body: JSON.stringify({
          location: {
            city: 'Melbourne',
            province: 'Victoria',
            lat: -37.8136,
            lng: 144.9631,
          },
        }),
      };

      const result = await updateUser(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.location).toEqual({
        city: 'Melbourne',
        province: 'Victoria',
        lat: -37.8136,
        lng: 144.9631,
      });
    });

    it('should return 400 for invalid location format', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          userId: '123',
        },
        body: JSON.stringify({
          location: {
            city: 'New York',
            // missing province, lat, lng
          },
        }),
      };

      const result = await updateUser(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(400);
    });

    it('should return 404 if user not found', async () => {
      (mockUserServiceInstance.updateUser as jest.Mock).mockResolvedValue(null);

      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          userId: 'non-existent',
        },
        body: JSON.stringify({
          firstName: 'Edric',
        }),
      };

      const result = await updateUser(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(404);
    });
  });
});
