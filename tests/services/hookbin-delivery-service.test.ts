import { HookbinDeliveryService } from '../../src/services/messages/deliveries/hookbin-delivery-service';
import { User } from '../../src/schemas/user';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedIsAxiosError = axios.isAxiosError as jest.MockedFunction<typeof axios.isAxiosError>;

describe('HookbinDeliveryService', () => {
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

  describe('send', () => {
    it('should send HTTP POST to hookbin.com', async () => {
      mockedAxios.post.mockResolvedValueOnce({ status: 200 });

      const deliveryService = new HookbinDeliveryService();
      await deliveryService.send(mockUser, 'Test message', 'birthday');

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://hookbin.com/test-endpoint',
        expect.objectContaining({
          message: 'Test message',
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

      const deliveryService = new HookbinDeliveryService();
      await expect(deliveryService.send(mockUser, 'Test message', 'birthday')).rejects.toThrow(
        'HOOKBIN_URL environment variable is not set'
      );
    });

    it('should throw error on HTTP failure', async () => {
      const axiosError = new Error('Network error');
      mockedAxios.post.mockRejectedValueOnce(axiosError);
      mockedIsAxiosError.mockReturnValue(true);

      const deliveryService = new HookbinDeliveryService();
      await expect(deliveryService.send(mockUser, 'Test message', 'birthday')).rejects.toThrow(
        'Failed to send message: Network error'
      );
    });

    it('should throw error on non-2xx status code', async () => {
      mockedAxios.post.mockResolvedValueOnce({ status: 500 });

      const deliveryService = new HookbinDeliveryService();
      await expect(deliveryService.send(mockUser, 'Test message', 'birthday')).rejects.toThrow(
        'Unexpected status code: 500'
      );
    });

    it('should accept 200, 201, and 204 status codes', async () => {
      const statusCodes = [200, 201, 204];

      for (const statusCode of statusCodes) {
        mockedAxios.post.mockResolvedValueOnce({ status: statusCode });
        const deliveryService = new HookbinDeliveryService();
        await expect(
          deliveryService.send(mockUser, 'Test message', 'birthday')
        ).resolves.not.toThrow();
      }
    });
  });
});
