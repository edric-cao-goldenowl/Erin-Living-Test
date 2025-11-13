import { MessageService } from '../../src/services/message-service';
import { User } from '../../src/models/user';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('MessageService', () => {
  const mockUser: User = {
    userId: '123',
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
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.HOOKBIN_URL = 'https://hookbin.com/test-endpoint';
  });

  describe('formatMessage', () => {
    it('should format message with full name', () => {
      const result = MessageService.formatMessage(mockUser);

      expect(result).toBe("Hey, John Doe it's your birthday");
    });
  });

  describe('sendBirthdayMessage', () => {
    it('should send HTTP POST to hookbin.com', async () => {
      mockedAxios.post.mockResolvedValueOnce({ status: 200 });

      await MessageService.sendBirthdayMessage(mockUser);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://hookbin.com/test-endpoint',
        expect.objectContaining({
          message: "Hey, John Doe it's your birthday",
        }),
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json',
          },
        })
      );
    });

    it('should throw error if HOOKBIN_URL is not set', async () => {
      delete process.env.HOOKBIN_URL;

      await expect(MessageService.sendBirthdayMessage(mockUser)).rejects.toThrow(
        'HOOKBIN_URL environment variable is not set'
      );
    });

    it('should throw error on HTTP failure', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('Network error'));

      await expect(MessageService.sendBirthdayMessage(mockUser)).rejects.toThrow();
    });

    it('should throw error on non-2xx status code', async () => {
      mockedAxios.post.mockResolvedValueOnce({ status: 500 });

      await expect(MessageService.sendBirthdayMessage(mockUser)).rejects.toThrow(
        'Unexpected status code: 500'
      );
    });
  });
});
