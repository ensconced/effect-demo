/**
 * Effect Fiber Management & Interruption
 * 
 * Features demonstrated:
 * - Fine-grained fiber control and interruption
 * - Scoped resource management with fibers
 * - Fork/join patterns
 * - Automatic cleanup on interruption
 * - Racing and timeout handling
 */

import { Effect, Fiber, FiberRef, pipe } from "effect";

interface Task {
  id: string;
  name: string;
  duration: number;
}

class TaskError {
  readonly _tag = "TaskError";
  constructor(readonly message: string, readonly taskId: string) {}
}

// Fiber-local state
const currentTaskRef = FiberRef.unsafeMake<string | null>(null);

// Long-running task that can be interrupted
const executeTask = (task: Task): Effect.Effect<string, TaskError> =>
  Effect.gen(function* () {
    yield* FiberRef.set(currentTaskRef, task.id);
    yield* Effect.sync(() => console.log(`🚀 Starting task: ${task.name}`));
    
    // Simulate work with interruptible operations
    const steps = Math.ceil(task.duration / 500);
    
    for (let i = 1; i <= steps; i++) {
      yield* Effect.sleep(500);
      
      // Check if we should fail
      if (Math.random() < 0.1) {
        yield* Effect.fail(new TaskError(`Task failed at step ${i}`, task.id));
      }
      
      yield* Effect.sync(() => process.stdout.write(`${task.id}-${i} `));
    }
    
    const result = `Task ${task.name} completed successfully`;
    yield* Effect.sync(() => console.log(`\n✅ ${result}`));
    return result;
  }).pipe(
    Effect.onInterrupt(() =>
      Effect.gen(function* () {
        const taskId = yield* FiberRef.get(currentTaskRef);
        yield* Effect.sync(() => console.log(`\n❌ Task ${taskId} was interrupted`));
      })
    )
  );

export class FiberManagementService {
  
  /**
   * Fork tasks and manage their lifecycle
   */
  manageConcurrentTasks = (tasks: Task[]): Effect.Effect<string[], never> =>
    Effect.gen(function* () {
      console.log(`🔄 Starting ${tasks.length} concurrent tasks`);
      
      // Fork all tasks
      const fibers = yield* Effect.all(
        tasks.map(task => Effect.fork(executeTask(task)))
      );
      
      console.log(`🧵 Forked ${fibers.length} fibers`);
      
      // Wait for all to complete or collect partial results
      const results = yield* Effect.all(
        fibers.map(fiber =>
          Fiber.join(fiber).pipe(
            Effect.either,
            Effect.map(result => 
              result._tag === 'Right' ? result.right : `Failed: ${result.left.message}`
            )
          )
        )
      );
      
      return results;
    });

  /**
   * Racing tasks with automatic cleanup
   */
  raceTasksWithTimeout = (tasks: Task[], timeoutMs: number): Effect.Effect<string, never> =>
    Effect.gen(function* () {
      console.log(`🏁 Racing ${tasks.length} tasks with ${timeoutMs}ms timeout`);
      
      const raceEffect = Effect.race(
        ...tasks.map(task => executeTask(task))
      );
      
      const result = yield* raceEffect.pipe(
        Effect.timeout(timeoutMs),
        Effect.either
      );
      
      if (result._tag === 'Right') {
        return result.right;
      } else {
        return `Race failed: timeout or error`;
      }
    });

  /**
   * Supervised task execution with error recovery
   */
  supervisedExecution = (tasks: Task[]): Effect.Effect<void, never> =>
    Effect.gen(function* () {
      console.log(`👁️  Starting supervised execution of ${tasks.length} tasks`);
      
      // Create supervisor fiber
      const supervisor = yield* Effect.fork(
        Effect.gen(function* () {
          const workerFibers = yield* Effect.all(
            tasks.map(task =>
              Effect.fork(
                executeTask(task).pipe(
                  Effect.retry({ times: 2 }),
                  Effect.catchAll(error =>
                    Effect.sync(() => console.log(`🔄 Supervisor: Task ${error.taskId} failed permanently`))
                  )
                )
              )
            )
          );
          
          // Monitor workers
          yield* Effect.all(
            workerFibers.map(fiber => Fiber.join(fiber))
          );
          
          yield* Effect.sync(() => console.log("👁️  Supervisor: All tasks completed"));
        })
      );
      
      // Let it run for a bit, then demonstrate interruption
      yield* Effect.sleep(3000);
      yield* Effect.sync(() => console.log("\n⏹️  Stopping supervisor..."));
      yield* Fiber.interrupt(supervisor);
      yield* Effect.sync(() => console.log("✅ Supervisor and all workers stopped"));
    });

  /**
   * Resource management with fibers
   */
  managedResourceProcessing = (tasks: Task[]): Effect.Effect<string[], never> =>
    Effect.gen(function* () {
      console.log("🔧 Processing with managed resources");
      
      return yield* Effect.acquireRelease(
        // Acquire: Start monitoring fiber
        Effect.fork(
          Effect.gen(function* () {
            while (true) {
              yield* Effect.sleep(1000);
              yield* Effect.sync(() => console.log("💓 Resource monitor heartbeat"));
            }
          })
        ),
        // Release: Cleanup monitor
        monitor => Fiber.interrupt(monitor).pipe(
          Effect.tap(() => Effect.sync(() => console.log("🔧 Resource monitor cleaned up")))
        )
      ).pipe(
        Effect.flatMap(monitorFiber =>
          // Use the resource
          Effect.all(
            tasks.map(task =>
              executeTask(task).pipe(
                Effect.either,
                Effect.map(result =>
                  result._tag === 'Right' ? result.right : `Failed: ${result.left.message}`
                )
              )
            ),
            { concurrency: 2 }
          )
        )
      );
    });

  /**
   * Demonstrate fiber interruption and cleanup
   */
  interruptionDemo = (): Effect.Effect<void, never> =>
    Effect.gen(function* () {
      console.log("\n🛑 Interruption Demo");
      
      // Start long-running task
      const longTask = yield* Effect.fork(
        executeTask({
          id: "long",
          name: "Long Running Task",
          duration: 5000
        }).pipe(
          Effect.onInterrupt(() =>
            Effect.sync(() => console.log("🧹 Long task cleaned up resources"))
          )
        )
      );
      
      // Let it run briefly
      yield* Effect.sleep(1500);
      
      // Interrupt it
      yield* Effect.sync(() => console.log("\n🛑 Interrupting long task..."));
      yield* Fiber.interrupt(longTask);
      
      yield* Effect.sync(() => console.log("✅ Long task interrupted and cleaned up"));
    });
}

// Advanced: Custom fiber pool
const createFiberPool = (maxSize: number) =>
  Effect.gen(function* () {
    // In production, use FiberRef and Semaphore for proper pooling
    let activeCount = 0;
    
    const execute = <A, E>(effect: Effect.Effect<A, E>): Effect.Effect<A, E> =>
      Effect.gen(function* () {
        if (activeCount >= maxSize) {
          yield* Effect.sleep(100); // Wait for slot
          return yield* execute(effect);
        }
        
        activeCount++;
        const result = yield* effect;
        activeCount--;
        return result;
      });
    
    return { execute, getActiveCount: () => activeCount };
  });

export const runExample = Effect.gen(function* () {
  console.log("=== Effect Fiber Management Example ===");
  
  const service = new FiberManagementService();
  
  const testTasks: Task[] = [
    { id: "A", name: "Quick Task", duration: 1000 },
    { id: "B", name: "Medium Task", duration: 2000 },
    { id: "C", name: "Slow Task", duration: 3000 }
  ];
  
  // Concurrent task management
  console.log("\n--- Concurrent Tasks ---");
  const concurrentResults = yield* service.manageConcurrentTasks(testTasks);
  console.log(`✅ Concurrent results: ${concurrentResults.length} completed`);
  
  // Racing with timeout
  console.log("\n--- Racing Tasks ---");
  const raceWinner = yield* service.raceTasksWithTimeout(
    [
      { id: "Fast", name: "Fast Task", duration: 800 },
      { id: "Slow", name: "Slow Task", duration: 2500 }
    ],
    2000
  );
  console.log(`🏆 Race winner: ${raceWinner}`);
  
  // Interruption demo
  yield* service.interruptionDemo();
  
  // Managed resource processing
  console.log("\n--- Managed Resource Processing ---");
  const managedResults = yield* service.managedResourceProcessing([
    { id: "R1", name: "Resource Task 1", duration: 1200 },
    { id: "R2", name: "Resource Task 2", duration: 800 }
  ]);
  console.log(`✅ Managed results: ${managedResults.length} completed`);
  
  // Supervised execution (will be interrupted)
  console.log("\n--- Supervised Execution ---");
  yield* service.supervisedExecution([
    { id: "S1", name: "Supervised Task 1", duration: 2000 },
    { id: "S2", name: "Supervised Task 2", duration: 4000 }
  ]);
  
  console.log('\n✅ All fiber operations completed with proper cleanup!');
});

