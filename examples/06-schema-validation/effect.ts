/**
 * Effect Schema Validation & Type Safety
 * 
 * Features demonstrated:
 * - Runtime type validation with compile-time types
 * - Schema composition and transformation
 * - Branded types for domain modeling
 * - Automatic error handling for invalid data
 * - Zero-cost type safety
 */

import { Effect, Schema, Brand } from "effect";

// Branded types for domain safety
type UserId = string & Brand.Brand<"UserId">;
type Email = string & Brand.Brand<"Email">;
type Age = number & Brand.Brand<"Age">;

// Schema definitions with built-in validation
const UserIdSchema = Schema.string.pipe(
  Schema.nonEmpty(),
  Schema.pattern(/^user_[a-zA-Z0-9]+$/),
  Schema.brand<UserId>()
);

const EmailSchema = Schema.string.pipe(
  Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
  Schema.brand<Email>()
);

const AgeSchema = Schema.number.pipe(
  Schema.int(),
  Schema.between(0, 150),
  Schema.brand<Age>()
);

// Complex object schemas
const UserSchema = Schema.struct({
  id: UserIdSchema,
  name: Schema.string.pipe(Schema.minLength(2), Schema.maxLength(50)),
  email: EmailSchema,
  age: AgeSchema,
  roles: Schema.array(Schema.literal("admin", "user", "guest")),
  metadata: Schema.optional(Schema.record(Schema.string, Schema.unknown))
});

const CreateUserRequestSchema = Schema.struct({
  name: Schema.string.pipe(Schema.minLength(2)),
  email: EmailSchema,
  age: AgeSchema,
  role: Schema.literal("user", "guest")
});

// Inferred types from schemas
type User = typeof UserSchema.Type;
type CreateUserRequest = typeof CreateUserRequestSchema.Type;

class ValidationError {
  readonly _tag = "ValidationError";
  constructor(readonly errors: Schema.ParseResult.ParseError) {}
}

// Service using schema validation
export class UserValidationService {
  
  validateUser = (input: unknown): Effect.Effect<User, ValidationError> =>
    Effect.gen(function* () {
      const result = Schema.decodeUnknown(UserSchema)(input);
      
      if (result._tag === "Left") {
        yield* Effect.fail(new ValidationError(result.left));
      }
      
      return result.right;
    });

  validateCreateRequest = (input: unknown): Effect.Effect<CreateUserRequest, ValidationError> =>
    Effect.gen(function* () {
      const result = Schema.decodeUnknown(CreateUserRequestSchema)(input);
      
      if (result._tag === "Left") {
        yield* Effect.fail(new ValidationError(result.left));
      }
      
      return result.right;
    });

  createUser = (request: CreateUserRequest): Effect.Effect<User, never> =>
    Effect.succeed({
      id: `user_${Math.random().toString(36).slice(2)}` as UserId,
      name: request.name,
      email: request.email,
      age: request.age,
      roles: [request.role],
      metadata: { created: new Date().toISOString() }
    });

  // Transform and validate API data
  processUserData = (apiData: unknown[]): Effect.Effect<User[], ValidationError> =>
    Effect.gen(function* () {
      const results: User[] = [];
      
      for (const data of apiData) {
        const validationResult = Schema.decodeUnknown(UserSchema)(data);
        
        if (validationResult._tag === "Right") {
          results.push(validationResult.right);
        } else {
          console.warn(`⚠️ Skipping invalid user data:`, 
            Schema.TreeFormatter.formatErrors(validationResult.left.errors));
        }
      }
      
      return results;
    });
}

// Advanced: Schema composition and transformation
const APIResponseSchema = Schema.struct({
  data: Schema.array(UserSchema),
  meta: Schema.struct({
    total: Schema.number,
    page: Schema.number
  }),
  timestamp: Schema.string.pipe(Schema.datetime())
});

const transformToInternal = Schema.transform(
  APIResponseSchema,
  Schema.struct({
    users: Schema.array(UserSchema),
    pagination: Schema.struct({
      total: Schema.number,
      currentPage: Schema.number
    }),
    fetchedAt: Schema.Date
  }),
  (api) => ({
    users: api.data,
    pagination: { total: api.meta.total, currentPage: api.meta.page },
    fetchedAt: new Date(api.timestamp)
  }),
  (internal) => ({
    data: internal.users,
    meta: { total: internal.pagination.total, page: internal.pagination.currentPage },
    timestamp: internal.fetchedAt.toISOString()
  })
);

export const runExample = Effect.gen(function* () {
  console.log("=== Effect Schema Validation Example ===");
  
  const service = new UserValidationService();
  
  // Valid data
  const validUserData = {
    id: "user_abc123",
    name: "Alice Johnson",
    email: "alice@example.com",
    age: 30,
    roles: ["admin", "user"]
  };
  
  console.log("\n--- Validating Valid User ---");
  const validUser = yield* service.validateUser(validUserData).pipe(
    Effect.catchAll(error => 
      Effect.sync(() => {
        console.log("Validation errors:", Schema.TreeFormatter.formatErrors(error.errors.errors));
        return null;
      })
    )
  );
  
  if (validUser) {
    console.log(`✅ Valid user: ${validUser.name} (${validUser.email})`);
  }
  
  // Invalid data
  console.log("\n--- Validating Invalid User ---");
  const invalidUserData = {
    id: "invalid-id", // Wrong format
    name: "A", // Too short
    email: "not-an-email", // Invalid format
    age: 200, // Too high
    roles: ["invalid-role"] // Not allowed
  };
  
  yield* service.validateUser(invalidUserData).pipe(
    Effect.catchAll(error => 
      Effect.sync(() => {
        console.log("❌ Validation failed:");
        console.log(Schema.TreeFormatter.formatErrors(error.errors.errors));
      })
    )
  );
  
  // Create user flow
  console.log("\n--- Create User Flow ---");
  const createRequest = {
    name: "Bob Smith",
    email: "bob@example.com",
    age: 25,
    role: "user" as const
  };
  
  const validatedRequest = yield* service.validateCreateRequest(createRequest).pipe(
    Effect.catchAll(error => 
      Effect.sync(() => {
        console.log("Create request validation failed:", error);
        return null;
      })
    )
  );
  
  if (validatedRequest) {
    const newUser = yield* service.createUser(validatedRequest);
    console.log(`✅ Created user: ${newUser.name} with ID ${newUser.id}`);
  }
  
  // Batch processing
  console.log("\n--- Batch Processing ---");
  const mixedData = [
    { id: "user_good1", name: "Good User 1", email: "good1@example.com", age: 25, roles: ["user"] },
    { id: "bad-id", name: "Bad User", email: "bad-email", age: -5, roles: ["invalid"] },
    { id: "user_good2", name: "Good User 2", email: "good2@example.com", age: 35, roles: ["guest"] }
  ];
  
  const validUsers = yield* service.processUserData(mixedData);
  console.log(`✅ Processed ${validUsers.length} valid users out of ${mixedData.length} total`);
  
  console.log('\n✅ Schema validation ensures runtime safety with compile-time types!');
});

