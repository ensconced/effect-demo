/**
 * Effect-based Error Handling - User Profile Service
 * 
 * Benefits demonstrated:
 * - All errors in type signature
 * - No nested try-catch
 * - Composable error recovery
 * - Compile-time error handling guarantees
 * - Clear separation of concerns
 */

import { Effect, pipe } from "effect";

interface User {
  id: string;
  email: string;
  name: string;
}

// Typed error classes
class ValidationError {
  readonly _tag = "ValidationError";
  constructor(readonly message: string) {}
}

class DatabaseError {
  readonly _tag = "DatabaseError";
  constructor(readonly message: string) {}
}

class NetworkError {
  readonly _tag = "NetworkError";
  constructor(readonly message: string) {}
}

// Services that return Effect instead of Promise
const validateEmail = (email: string): Effect.Effect<boolean, ValidationError | NetworkError> =>
  Effect.gen(function* () {
    if (Math.random() < 0.1) yield* Effect.fail(new NetworkError("Email validation service down"));
    if (!email.includes('@')) yield* Effect.fail(new ValidationError("Invalid email format"));
    return true;
  });

const saveToDatabase = (user: User): Effect.Effect<User, DatabaseError> =>
  Effect.gen(function* () {
    if (Math.random() < 0.15) yield* Effect.fail(new DatabaseError("Database connection failed"));
    return user;
  });

const sendWelcomeEmail = (user: User): Effect.Effect<void, NetworkError> =>
  Effect.gen(function* () {
    if (Math.random() < 0.1) yield* Effect.fail(new NetworkError("Email service unavailable"));
  });

// Main service - notice the clear error type in the signature
export const createUserProfile = (email: string, name: string): Effect.Effect<User, ValidationError | DatabaseError | NetworkError> =>
  Effect.gen(function* () {
    // All errors are automatically propagated up
    yield* validateEmail(email);
    
    const user: User = {
      id: Math.random().toString(36),
      email,
      name
    };

    const savedUser = yield* saveToDatabase(user);
    
    // Email failure shouldn't fail the whole operation
    yield* sendWelcomeEmail(savedUser).pipe(
      Effect.catchAll(error => 
        Effect.sync(() => console.warn(`Failed to send welcome email: ${error.message}`))
      )
    );

    return savedUser;
  });

// Composable error recovery strategies
const createUserProfileWithRecovery = (email: string, name: string): Effect.Effect<User | null, never> =>
  createUserProfile(email, name).pipe(
    Effect.catchTags({
      ValidationError: error => Effect.sync(() => {
        console.error(`Validation failed: ${error.message}`);
        return null;
      }),
      DatabaseError: error => Effect.sync(() => {
        console.error(`Database error: ${error.message}`);
        return null;
      }),
      NetworkError: error => Effect.sync(() => {
        console.error(`Network error: ${error.message}`);
        return null;
      })
    })
  );

// Usage example
export const runExample = Effect.gen(function* () {
  console.log("=== Effect-based Error Handling Example ===");
  
  // Process multiple users in parallel
  const results = yield* Effect.all([
    createUserProfileWithRecovery("john@example.com", "John Doe"),
    createUserProfileWithRecovery("invalid-email", "Jane Doe"),
    createUserProfileWithRecovery("bob@example.com", "Bob Smith"),
  ], { concurrency: "unbounded" });

  results.forEach((user, index) => {
    console.log(`User ${index + 1}:`, user ? 'Created' : 'Failed');
  });
});

