import { MessageServiceFactory } from '../../src/services/messages/message-service-factory';
import { MessageDeliveryService } from '../../src/services/messages/message-delivery-service';
import { User } from '../../src/schemas/user';

// Mock MessageDeliveryService
const mockDeliveryService: MessageDeliveryService = {
  send: jest.fn().mockResolvedValue(undefined),
};

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
    (mockDeliveryService.send as jest.Mock).mockResolvedValue(undefined);
  });

  describe('formatMessage', () => {
    it('should format message with full name', () => {
      const messageServiceFactory = new MessageServiceFactory();
      const messageService = messageServiceFactory.create('birthday');
      const result = messageService.formatMessage(mockUser, 'birthday');

      expect(result).toBe("Hey, John Doe it's your birthday");
    });
  });

  describe('sendMessage', () => {
    it('should delegate to delivery service with formatted message', async () => {
      const messageServiceFactory = new MessageServiceFactory(mockDeliveryService);
      const messageService = messageServiceFactory.create('birthday');
      await messageService.sendMessage(mockUser, 'birthday');

      expect(mockDeliveryService.send).toHaveBeenCalledWith(
        mockUser,
        "Hey, John Doe it's your birthday",
        'birthday'
      );
    });

    it('should propagate delivery service errors', async () => {
      const error = new Error('Delivery failed');
      (mockDeliveryService.send as jest.Mock).mockRejectedValueOnce(error);

      const messageServiceFactory = new MessageServiceFactory(mockDeliveryService);
      const messageService = messageServiceFactory.create('birthday');
      await expect(messageService.sendMessage(mockUser, 'birthday')).rejects.toThrow(
        'Delivery failed'
      );
    });
  });

  describe('sendEventMessage', () => {
    it('should send event message using sendMessage', async () => {
      const messageServiceFactory = new MessageServiceFactory(mockDeliveryService);
      const messageService = messageServiceFactory.create('birthday');
      await messageService.sendEventMessage(mockUser, 'birthday');

      expect(mockDeliveryService.send).toHaveBeenCalledWith(
        mockUser,
        "Hey, John Doe it's your birthday",
        'birthday'
      );
    });
  });
});
