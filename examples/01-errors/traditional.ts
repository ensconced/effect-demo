/**
 * Traditional Error Handling - User Profile Service
 * 
 * Problems demonstrated:
 * - Nested try-catch blocks
 * - instanceof checks everywhere
 * - Mixed error types (Error, string, unknown)
 * - Silent failures possible
 * - No compile-time guarantees about error handling
 */

interface User {
  id: string;
  email: string;
  name: string;
}

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

class DatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseError';
  }
}

class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

// Simulated external services
async function validateEmail(email: string): Promise<boolean> {
  if (Math.random() < 0.1) throw new NetworkError("Email validation service down");
  if (!email.includes('@')) throw new ValidationError("Invalid email format");
  return true;
}

async function saveToDatabase(user: User): Promise<User> {
  if (Math.random() < 0.15) throw new DatabaseError("Database connection failed");
  return user;
}

async function sendWelcomeEmail(user: User): Promise<void> {
  if (Math.random() < 0.1) throw new NetworkError("Email service unavailable");
}

// The main service with nested error handling
export async function createUserProfile(email: string, name: string): Promise<User | null> {
  try {
    // Validation layer
    try {
      await validateEmail(email);
    } catch (error) {
      if (error instanceof ValidationError) {
        console.error(`Validation failed: ${error.message}`);
        return null;
      } else if (error instanceof NetworkError) {
        console.error(`Network issue during validation: ${error.message}`);
        // Should we retry? How many times? This logic gets duplicated everywhere
        return null;
      } else {
        console.error(`Unexpected validation error: ${error}`);
        return null;
      }
    }

    const user: User = {
      id: Math.random().toString(36),
      email,
      name
    };

    // Database layer
    let savedUser: User;
    try {
      savedUser = await saveToDatabase(user);
    } catch (error) {
      if (error instanceof DatabaseError) {
        console.error(`Database error: ${error.message}`);
        // In production, this might need rollback logic
        return null;
      } else {
        console.error(`Unexpected database error: ${error}`);
        return null;
      }
    }

    // Email layer - failures here shouldn't block user creation
    try {
      await sendWelcomeEmail(savedUser);
    } catch (error) {
      if (error instanceof NetworkError) {
        console.warn(`Failed to send welcome email: ${error.message}`);
        // User was created successfully, but email failed - this is okay
      } else {
        console.warn(`Unexpected email error: ${error}`);
      }
    }

    return savedUser;

  } catch (error) {
    // This catch-all might hide important errors
    console.error(`Unexpected error in createUserProfile: ${error}`);
    return null;
  }
}

// Usage example
export async function runExample() {
  console.log("=== Traditional Error Handling Example ===");
  
  const results = await Promise.allSettled([
    createUserProfile("john@example.com", "John Doe"),
    createUserProfile("invalid-email", "Jane Doe"),
    createUserProfile("bob@example.com", "Bob Smith"),
  ]);

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      console.log(`User ${index + 1}:`, result.value ? 'Created' : 'Failed');
    } else {
      console.log(`User ${index + 1}: Error - ${result.reason}`);
    }
  });
}

