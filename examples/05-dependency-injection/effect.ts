/**
 * Effect Dependency Injection & Context Management
 * 
 * Features demonstrated:
 * - Type-safe dependency injection with Context
 * - Layer-based service composition
 * - Easy testing with mock implementations
 * - Compile-time dependency tracking
 * - No runtime DI container needed
 */

import { Effect, Context, Layer } from "effect";

// Service interfaces
interface DatabaseService {
  readonly findUser: (id: string) => Effect.Effect<User | null, DatabaseError>;
  readonly saveUser: (user: User) => Effect.Effect<void, DatabaseError>;
}

interface EmailService {
  readonly sendWelcome: (email: string) => Effect.Effect<void, EmailError>;
}

interface LoggingService {
  readonly info: (message: string) => Effect.Effect<void, never>;
  readonly error: (message: string, error?: any) => Effect.Effect<void, never>;
}

// Types
interface User {
  id: string;
  name: string;
  email: string;
}

class DatabaseError {
  readonly _tag = "DatabaseError";
  constructor(readonly message: string) {}
}

class EmailError {
  readonly _tag = "EmailError";
  constructor(readonly message: string) {}
}

// Context tags - type-safe service identifiers
class DatabaseServiceTag extends Context.Tag("DatabaseService")<
  DatabaseServiceTag,
  DatabaseService
>() {}

class EmailServiceTag extends Context.Tag("EmailService")<
  EmailServiceTag,
  EmailService
>() {}

class LoggingServiceTag extends Context.Tag("LoggingService")<
  LoggingServiceTag,
  LoggingService
>() {}

// Production implementations
const DatabaseServiceLive = Layer.succeed(
  DatabaseServiceTag,
  DatabaseServiceTag.of({
    findUser: (id: string) =>
      Effect.gen(function* () {
        yield* Effect.sleep(100); // Simulate DB query
        if (Math.random() < 0.2) {
          yield* Effect.fail(new DatabaseError("Database connection failed"));
        }
        return { id, name: `User ${id}`, email: `user${id}@example.com` };
      }),
    
    saveUser: (user: User) =>
      Effect.gen(function* () {
        yield* Effect.sleep(50);
        if (Math.random() < 0.1) {
          yield* Effect.fail(new DatabaseError("Failed to save user"));
        }
      })
  })
);

const EmailServiceLive = Layer.succeed(
  EmailServiceTag,
  EmailServiceTag.of({
    sendWelcome: (email: string) =>
      Effect.gen(function* () {
        yield* Effect.sleep(200);
        if (Math.random() < 0.15) {
          yield* Effect.fail(new EmailError("Email service unavailable"));
        }
      })
  })
);

const LoggingServiceLive = Layer.succeed(
  LoggingServiceTag,
  LoggingServiceTag.of({
    info: (message: string) => Effect.sync(() => console.log(`ℹ️ ${message}`)),
    error: (message: string, error?: any) => Effect.sync(() => console.error(`❌ ${message}`, error))
  })
);

// Business logic using injected dependencies
const createUser = (name: string, email: string): Effect.Effect<User, DatabaseError | EmailError, DatabaseServiceTag | EmailServiceTag | LoggingServiceTag> =>
  Effect.gen(function* () {
    const db = yield* DatabaseServiceTag;
    const emailSvc = yield* EmailServiceTag;
    const logger = yield* LoggingServiceTag;
    
    const user: User = { id: Math.random().toString(36), name, email };
    
    yield* logger.info(`Creating user: ${name}`);
    yield* db.saveUser(user);
    yield* emailSvc.sendWelcome(email);
    yield* logger.info(`User created successfully: ${user.id}`);
    
    return user;
  });

const getUser = (id: string): Effect.Effect<User | null, DatabaseError, DatabaseServiceTag | LoggingServiceTag> =>
  Effect.gen(function* () {
    const db = yield* DatabaseServiceTag;
    const logger = yield* LoggingServiceTag;
    
    yield* logger.info(`Fetching user: ${id}`);
    const user = yield* db.findUser(id);
    
    if (user) {
      yield* logger.info(`User found: ${user.name}`);
    } else {
      yield* logger.info(`User not found: ${id}`);
    }
    
    return user;
  });

// Compose all layers
const AppLive = Layer.merge(
  DatabaseServiceLive,
  EmailServiceLive
).pipe(Layer.merge(LoggingServiceLive));

// Test implementations
const DatabaseServiceTest = Layer.succeed(
  DatabaseServiceTag,
  DatabaseServiceTag.of({
    findUser: (id: string) => Effect.succeed({ id, name: `Test User ${id}`, email: `test${id}@example.com` }),
    saveUser: (user: User) => Effect.void
  })
);

const EmailServiceTest = Layer.succeed(
  EmailServiceTag,
  EmailServiceTag.of({
    sendWelcome: (email: string) => Effect.sync(() => console.log(`📧 Mock email sent to ${email}`))
  })
);

const AppTest = Layer.merge(DatabaseServiceTest, EmailServiceTest).pipe(
  Layer.merge(LoggingServiceLive)
);

// Usage
export const runExample = Effect.gen(function* () {
  console.log("=== Effect Dependency Injection Example ===");
  
  // Production environment
  console.log("\n--- Production Environment ---");
  const prodUser = yield* createUser("Alice", "alice@example.com");
  const foundUser = yield* getUser(prodUser.id);
  console.log(`Found user: ${foundUser?.name}`);
}).pipe(Effect.provide(AppLive));

export const runTest = Effect.gen(function* () {
  console.log("\n--- Test Environment ---");
  const testUser = yield* createUser("Bob", "bob@example.com");
  const foundUser = yield* getUser(testUser.id);
  console.log(`Test user: ${foundUser?.name}`);
}).pipe(Effect.provide(AppTest));

