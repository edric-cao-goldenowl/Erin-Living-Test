import { z } from 'zod';

export const LocationSchema = z.object({
  city: z.string().min(1, 'City is required'),
  province: z.string().min(1, 'Province is required'),
  lat: z
    .number({
      invalid_type_error: 'Latitude must be a number',
    })
    .optional(),
  lng: z
    .number({
      invalid_type_error: 'Longitude must be a number',
    })
    .optional(),
});

export type Location = z.infer<typeof LocationSchema>;

export const CreateUserRequestSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid birthday format. Expected YYYY-MM-DD'),
  timezone: z.string().min(1, 'Timezone is required'),
  location: LocationSchema,
});

export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;

export const UpdateUserRequestSchema = CreateUserRequestSchema.partial().refine(
  (data) => {
    // Ensure at least one field is provided
    return Object.keys(data).length > 0;
  },
  {
    message: 'At least one field must be provided for update',
  }
);

export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>;

export interface User {
  userId: string;
  firstName: string;
  lastName: string;
  birthday: string; // ISO date string (YYYY-MM-DD)
  timezone: string; // IANA timezone string (e.g., "America/New_York")
  location: Location; // Location information (city, province, lat, lng)
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  birthdayMonthDay?: string; // GSI attribute: "MM-DD" format
  anniversaryDate?: string; // ISO date string (YYYY-MM-DD) - for future anniversary feature
}

export interface UserResponse {
  userId: string;
  firstName: string;
  lastName: string;
  birthday: string;
  timezone: string;
  location: Location;
  createdAt: string;
  updatedAt: string;
}
