/**
 * Effect Streaming & Backpressure - Real-time Data Pipeline
 * 
 * Benefits demonstrated:
 * - Streaming data processing with automatic backpressure
 * - Composable stream transformations
 * - Built-in flow control and resource management
 * - Memory-efficient processing of large datasets
 * - Seamless integration with async operations
 * - Error handling in streaming contexts
 */

import { Effect, Stream, Sink, pipe, Schedule } from "effect";

interface DataPoint {
  id: string;
  timestamp: number;
  value: number;
  metadata?: Record<string, any>;
}

interface ProcessedBatch {
  count: number;
  average: number;
  min: number;
  max: number;
  timestamp: number;
}

interface MetricsEvent {
  type: 'data' | 'batch' | 'error' | 'completion';
  payload: any;
  timestamp: number;
}

class StreamError {
  readonly _tag = "StreamError";
  constructor(readonly message: string) {}
}

class ValidationError {
  readonly _tag = "ValidationError";
  constructor(readonly message: string) {}
}

// Data generators - infinite streams
const generateSensorData = (): Stream.Stream<DataPoint, never> =>
  Stream.repeatEffect(
    Effect.gen(function* () {
      yield* Effect.sleep(Math.random() * 500 + 100); // Variable intervals
      
      return {
        id: `sensor-${Math.random().toString(36).slice(2)}`,
        timestamp: Date.now(),
        value: Math.random() * 100,
        metadata: {
          source: 'temperature-sensor',
          location: ['room-a', 'room-b', 'room-c'][Math.floor(Math.random() * 3)]
        }
      };
    })
  );

const generateHighVolumeData = (): Stream.Stream<DataPoint, never> =>
  Stream.range(0, Number.MAX_SAFE_INTEGER).pipe(
    Stream.map(id => ({
      id: `bulk-${id}`,
      timestamp: Date.now(),
      value: Math.random() * 1000
    })),
    Stream.schedule(Schedule.spaced(10)) // 100 items per second
  );

// Stream transformations
const validateDataPoint = (point: DataPoint): Effect.Effect<DataPoint, ValidationError> =>
  Effect.gen(function* () {
    if (point.value < 0 || point.value > 1000) {
      yield* Effect.fail(new ValidationError(`Invalid value: ${point.value}`));
    }
    if (!point.id || point.id.length === 0) {
      yield* Effect.fail(new ValidationError("Missing ID"));
    }
    return point;
  });

const enrichDataPoint = (point: DataPoint): Effect.Effect<DataPoint, StreamError> =>
  Effect.gen(function* () {
    // Simulate enrichment from external service
    if (Math.random() < 0.1) {
      yield* Effect.fail(new StreamError("Enrichment service unavailable"));
    }
    
    yield* Effect.sleep(50); // Simulate API call
    
    return {
      ...point,
      metadata: {
        ...point.metadata,
        enriched: true,
        category: point.value > 50 ? 'high' : 'low',
        region: 'us-east-1'
      }
    };
  });

export class StreamingDataPipeline {
  
  /**
   * Basic streaming pipeline with error handling
   */
  basicPipeline = (): Stream.Stream<DataPoint, ValidationError | StreamError> =>
    pipe(
      generateSensorData(),
      Stream.take(20), // Limit for demo
      Stream.mapEffect(validateDataPoint),
      Stream.mapEffect(enrichDataPoint),
      Stream.tap(point => 
        Effect.sync(() => console.log(`📊 Processed: ${point.id} = ${point.value}`))
      )
    );

  /**
   * Batched processing with windows
   */
  batchedPipeline = (): Stream.Stream<ProcessedBatch, never> =>
    pipe(
      generateHighVolumeData(),
      Stream.take(100), // Process 100 items
      Stream.mapEffect(point => validateDataPoint(point).pipe(
        Effect.catchAll(() => Effect.succeed(null as DataPoint | null))
      )),
      Stream.filter((point): point is DataPoint => point !== null),
      Stream.grouped(10), // Batch into groups of 10
      Stream.map(batch => ({
        count: batch.length,
        average: batch.reduce((sum, p) => sum + p.value, 0) / batch.length,
        min: Math.min(...batch.map(p => p.value)),
        max: Math.max(...batch.map(p => p.value)),
        timestamp: Date.now()
      })),
      Stream.tap(batch =>
        Effect.sync(() => 
          console.log(`📈 Batch: ${batch.count} items, avg=${batch.average.toFixed(2)}`)
        )
      )
    );

  /**
   * Parallel stream processing with merge
   */
  parallelStreams = (): Stream.Stream<MetricsEvent, never> => {
    const dataStream = pipe(
      generateSensorData(),
      Stream.take(15),
      Stream.map(point => ({
        type: 'data' as const,
        payload: point,
        timestamp: Date.now()
      }))
    );

    const batchStream = pipe(
      this.batchedPipeline(),
      Stream.take(5),
      Stream.map(batch => ({
        type: 'batch' as const,
        payload: batch,
        timestamp: Date.now()
      }))
    );

    const errorStream = pipe(
      Stream.range(1, 3),
      Stream.schedule(Schedule.spaced(2000)),
      Stream.map(i => ({
        type: 'error' as const,
        payload: { message: `Simulated error ${i}` },
        timestamp: Date.now()
      }))
    );

    // Merge multiple streams
    return Stream.merge(dataStream, batchStream, errorStream);
  };

  /**
   * Streaming with backpressure and flow control
   */
  backpressureDemo = (): Effect.Effect<void, never> =>
    Effect.gen(function* () {
      console.log("\n🌊 Backpressure Demo - Fast producer, slow consumer");
      
      // Fast producer
      const fastProducer = Stream.range(1, 100).pipe(
        Stream.schedule(Schedule.spaced(10)), // 100 items/second
        Stream.tap(i => Effect.sync(() => process.stdout.write(`P${i} `)))
      );

      // Slow consumer with backpressure
      const slowConsumer = Sink.forEach((value: number) =>
        Effect.gen(function* () {
          yield* Effect.sleep(200); // Slow processing
          yield* Effect.sync(() => process.stdout.write(`C${value} `));
        })
      );

      // Effect automatically handles backpressure
      yield* Stream.run(fastProducer, slowConsumer);
      yield* Effect.sync(() => console.log("\n✅ Backpressure handled automatically"));
    });

  /**
   * Advanced: Stream with error recovery and retry
   */
  resilientStream = (): Stream.Stream<DataPoint, never> =>
    pipe(
      generateSensorData(),
      Stream.take(30),
      Stream.mapEffect(point =>
        pipe(
          enrichDataPoint(point),
          Effect.retry(Schedule.exponential(100).pipe(Schedule.compose(Schedule.recurs(2)))),
          Effect.catchAll(error =>
            Effect.succeed({
              ...point,
              metadata: { 
                ...point.metadata, 
                enrichmentFailed: true, 
                error: error.message 
              }
            })
          )
        )
      ),
      Stream.tap(point =>
        Effect.sync(() => {
          const status = point.metadata?.enrichmentFailed ? '❌' : '✅';
          console.log(`${status} ${point.id}: ${point.value}`);
        })
      )
    );

  /**
   * Stream aggregation and windowing
   */
  windowedAggregation = (): Effect.Effect<void, never> =>
    Effect.gen(function* () {
      console.log("\n🪟 Windowed Aggregation Demo");
      
      const stream = pipe(
        generateHighVolumeData(),
        Stream.take(50),
        Stream.mapEffect(point => 
          Effect.succeed(point).pipe(Effect.delay(Math.random() * 100))
        )
      );

      // Sliding window aggregation
      yield* pipe(
        stream,
        Stream.grouped(10), // Fixed size windows
        Stream.map(window => ({
          windowSize: window.length,
          sum: window.reduce((acc, p) => acc + p.value, 0),
          timestamp: Date.now()
        })),
        Stream.runForEach(agg =>
          Effect.sync(() => 
            console.log(`📊 Window: ${agg.windowSize} items, sum=${agg.sum.toFixed(2)}`)
          )
        )
      );
    });

  /**
   * Stream to multiple sinks (fan-out)
   */
  fanOutProcessing = (): Effect.Effect<void, never> =>
    Effect.gen(function* () {
      console.log("\n🔄 Fan-out Processing Demo");
      
      const sourceStream = pipe(
        generateSensorData(),
        Stream.take(15),
        Stream.mapEffect(validateDataPoint),
        Stream.catchAll(() => Stream.empty) // Skip invalid data
      );

      // Multiple processing paths
      const highValueSink = Sink.forEach((point: DataPoint) =>
        point.value > 70 
          ? Effect.sync(() => console.log(`🔥 High value alert: ${point.value}`))
          : Effect.void
      );

      const lowValueSink = Sink.forEach((point: DataPoint) =>
        point.value < 30 
          ? Effect.sync(() => console.log(`❄️ Low value alert: ${point.value}`))
          : Effect.void
      );

      const allValuesSink = Sink.forEach((point: DataPoint) =>
        Effect.sync(() => console.log(`📊 All values: ${point.id} = ${point.value}`))
      );

      // Fan out to multiple sinks
      yield* Effect.all([
        Stream.run(sourceStream, highValueSink),
        Stream.run(sourceStream, lowValueSink),
        Stream.run(sourceStream, allValuesSink)
      ], { concurrency: "unbounded" });
    });
}

// Advanced streaming patterns
const createBufferedStream = <A>(
  source: Stream.Stream<A, any>,
  bufferSize: number = 100
): Stream.Stream<A, never> =>
  // In a real implementation, this would use Effect.Queue for buffering
  source.pipe(
    Stream.grouped(bufferSize),
    Stream.flatMap(batch => Stream.fromIterable(batch))
  );

const rateLimitedStream = <A, E>(
  source: Stream.Stream<A, E>,
  itemsPerSecond: number
): Stream.Stream<A, E> =>
  source.pipe(
    Stream.schedule(Schedule.spaced(1000 / itemsPerSecond))
  );

// Usage example
export const runExample = Effect.gen(function* () {
  console.log("=== Effect Streaming & Backpressure Example ===");
  
  const pipeline = new StreamingDataPipeline();
  
  // Basic pipeline
  console.log("\n--- Basic Pipeline ---");
  yield* Stream.runCollect(pipeline.basicPipeline()).pipe(
    Effect.either,
    Effect.map(result => {
      if (result._tag === 'Right') {
        console.log(`✅ Processed ${result.right.length} items`);
      } else {
        console.log(`❌ Pipeline failed: ${result.left._tag}`);
      }
    })
  );
  
  // Batched processing
  console.log("\n--- Batched Processing ---");
  yield* Stream.runCollect(pipeline.batchedPipeline()).pipe(
    Effect.map(batches => 
      console.log(`✅ Generated ${batches.length} batches`)
    )
  );
  
  // Parallel streams
  console.log("\n--- Parallel Streams ---");
  yield* Stream.runForEach(
    pipeline.parallelStreams().pipe(Stream.take(10)),
    event => Effect.sync(() => 
      console.log(`📡 Event: ${event.type} at ${new Date(event.timestamp).toLocaleTimeString()}`)
    )
  );
  
  // Backpressure demo
  yield* pipeline.backpressureDemo();
  
  // Resilient stream
  console.log("\n--- Resilient Stream ---");
  yield* Stream.runCollect(pipeline.resilientStream().pipe(Stream.take(10))).pipe(
    Effect.map(items => 
      console.log(`✅ Processed ${items.length} items with error recovery`)
    )
  );
  
  // Windowed aggregation
  yield* pipeline.windowedAggregation();
  
  // Fan-out processing
  yield* pipeline.fanOutProcessing();
  
  console.log('\n✅ All streaming operations completed with automatic resource management!');
});

