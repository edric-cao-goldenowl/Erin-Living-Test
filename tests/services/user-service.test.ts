import { UserService } from '../../src/services/user-service';
import { dynamoDBClient } from '../../src/utils/dynamodb';
import { PutCommand, GetCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { TimezoneService } from '../../src/services/timezone-service';

jest.mock('../../src/utils/dynamodb');
jest.mock('../../src/services/timezone-service');
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-123'),
}));

const mockedDynamoDB = dynamoDBClient as jest.Mocked<typeof dynamoDBClient>;

// Mock TimezoneService instance
const mockTimezoneService = {
  formatMonthDay: jest.fn(),
} as unknown as TimezoneService;

describe('UserService', () => {
  const mockUser = {
    userId: 'test-uuid-123',
    firstName: 'John',
    lastName: 'Doe',
    birthday: '1990-01-15',
    timezone: 'America/New_York',
    location: {
      city: 'New York',
      province: 'New York',
      lat: 40.7128,
      lng: -74.006,
    },
    birthdayMonthDay: '01-15',
    createdAt: expect.any(String),
    updatedAt: expect.any(String),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DYNAMODB_TABLE = 'test-table';
    (mockTimezoneService.formatMonthDay as jest.Mock).mockReturnValue('01-15');
  });

  describe('createUser', () => {
    it('should create a new user', async () => {
      (mockedDynamoDB.send as jest.Mock).mockResolvedValueOnce({});
      const userService = new UserService(mockTimezoneService);

      const result = await userService.createUser({
        firstName: 'John',
        lastName: 'Doe',
        birthday: '1990-01-15',
        timezone: 'America/New_York',
        location: {
          city: 'New York',
          province: 'New York',
          lat: 40.7128,
          lng: -74.006,
        },
      });

      expect(result).toMatchObject({
        userId: 'test-uuid-123',
        firstName: 'John',
        lastName: 'Doe',
        birthday: '1990-01-15',
        timezone: 'America/New_York',
        location: {
          city: 'New York',
          province: 'New York',
          lat: 40.7128,
          lng: -74.006,
        },
      });
      expect(mockedDynamoDB.send).toHaveBeenCalledWith(expect.any(PutCommand));
    });
  });

  describe('getUserById', () => {
    it('should return user if found', async () => {
      (mockedDynamoDB.send as jest.Mock).mockResolvedValueOnce({
        Item: mockUser,
      });
      const userService = new UserService(mockTimezoneService);

      const result = await userService.getUserById('test-uuid-123');

      expect(result).toEqual(mockUser);
      expect(mockedDynamoDB.send).toHaveBeenCalledWith(expect.any(GetCommand));
    });

    it('should return null if user not found', async () => {
      (mockedDynamoDB.send as jest.Mock).mockResolvedValueOnce({});
      const userService = new UserService(mockTimezoneService);

      const result = await userService.getUserById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('updateUser', () => {
    it('should update user fields', async () => {
      (mockedDynamoDB.send as jest.Mock)
        .mockResolvedValueOnce({ Item: mockUser }) // getUserById call
        .mockResolvedValueOnce({
          Attributes: { ...mockUser, firstName: 'Jane' },
        }); // UpdateCommand call
      const userService = new UserService(mockTimezoneService);

      const result = await userService.updateUser('test-uuid-123', {
        firstName: 'Jane',
      });

      expect(result?.firstName).toBe('Jane');
      expect(mockedDynamoDB.send).toHaveBeenCalledTimes(2);
    });

    it('should update location field', async () => {
      const newLocation = {
        city: 'Melbourne',
        province: 'Victoria',
        lat: -37.8136,
        lng: 144.9631,
      };
      (mockedDynamoDB.send as jest.Mock)
        .mockResolvedValueOnce({ Item: mockUser }) // getUserById call
        .mockResolvedValueOnce({
          Attributes: { ...mockUser, location: newLocation },
        }); // UpdateCommand call
      const userService = new UserService(mockTimezoneService);

      const result = await userService.updateUser('test-uuid-123', {
        location: newLocation,
      });

      expect(result?.location).toEqual(newLocation);
      expect(mockedDynamoDB.send).toHaveBeenCalledTimes(2);
    });

    it('should return null if user not found', async () => {
      (mockedDynamoDB.send as jest.Mock).mockResolvedValueOnce({}); // getUserById returns null
      const userService = new UserService(mockTimezoneService);

      const result = await userService.updateUser('non-existent', {
        firstName: 'Jane',
      });

      expect(result).toBeNull();
    });
  });

  describe('deleteUser', () => {
    it('should delete user and return true', async () => {
      (mockedDynamoDB.send as jest.Mock).mockResolvedValueOnce({
        Attributes: mockUser,
      });
      const userService = new UserService(mockTimezoneService);

      const result = await userService.deleteUser('test-uuid-123');

      expect(result).toBe(true);
      expect(mockedDynamoDB.send).toHaveBeenCalledWith(expect.any(DeleteCommand));
    });

    it('should return false if user not found', async () => {
      (mockedDynamoDB.send as jest.Mock).mockResolvedValueOnce({});
      const userService = new UserService(mockTimezoneService);

      const result = await userService.deleteUser('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('getUsersByBirthdayMonthDay', () => {
    it('should return users with matching birthday month-day', async () => {
      (mockedDynamoDB.send as jest.Mock).mockResolvedValueOnce({
        Items: [mockUser],
      });
      const userService = new UserService(mockTimezoneService);

      const result = await userService.getUsersByBirthdayMonthDay('01-15');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockUser);
      expect(mockedDynamoDB.send).toHaveBeenCalledWith(expect.any(QueryCommand));
    });
  });
});
