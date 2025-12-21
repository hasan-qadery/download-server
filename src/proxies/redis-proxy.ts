// src/utils/redisProxy.ts
import { createClient, RedisClientType } from "redis";

/**
 * Enhanced Redis Proxy using node-redis v4+
 * - Supports individual ENV vars (HOST, PORT, PASSWORD, DB)
 * - Exposes init() for explicit async startup
 * - Handles graceful shutdown and reconnect logging
 * - Adds generic JSON helpers
 * - Supports unsubscribe in Pub/Sub
 * - Corrected method signatures and Redis API usage
 */

export class RedisProxy {
  private client: RedisClientType;
  private subscriber: RedisClientType;

  constructor() {
    const host = process.env.REDIS_HOST;
    const port = process.env.REDIS_PORT;
    const password = process.env.REDIS_PASSWORD;
    const db = process.env.REDIS_DB;

    if (!host || !port) {
      throw new Error(
        "Environment variables REDIS_HOST and REDIS_PORT must be set"
      );
    }

    const options: any = {
      socket: { host, port: parseInt(port, 10) },
    };
    if (password) options.password = password;
    if (db) options.database = parseInt(db, 10);

    this.client = createClient(options);
    this.subscriber = this.client.duplicate();

    this.client.on("error", (err: any) =>
      console.error("Redis Client Error:", err)
    );
    this.subscriber.on("error", (err: any) =>
      console.error("Redis Subscriber Error:", err)
    );

    this.client.on("connect", () =>
      console.log("🔌 Redis client connecting...")
    );
    this.client.on("ready", () => console.log("✅ Redis client ready"));
    this.client.on("reconnecting", () =>
      console.warn("🔄 Redis client reconnecting")
    );
    this.client.on("end", () => console.warn("🔌 Redis client disconnected"));

    process.once("SIGINT", async () => await this.shutdown());
    process.once("SIGTERM", async () => await this.shutdown());
  }

  /** Initialize both publisher and subscriber */
  public async init(): Promise<void> {
    await this.client.connect();
    await this.subscriber.connect();
  }

  /** Graceful shutdown */
  public async shutdown(): Promise<void> {
    console.log("🛑 Shutting down Redis connections...");
    try {
      await this.subscriber.disconnect();
      await this.client.disconnect();
      console.log("🟢 Redis connections closed");
      process.exit(0);
    } catch (err) {
      console.error("Error during Redis shutdown:", err);
      process.exit(1);
    }
  }

  /*** Basic KV operations ***/
  public get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  public async getObject<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  public set(
    key: string,
    value: string,
    ttlSeconds?: number
  ): Promise<string | null> {
    return ttlSeconds
      ? this.client.set(key, value, { EX: ttlSeconds })
      : this.client.set(key, value);
  }

  public setObject<T>(
    key: string,
    obj: T,
    ttlSeconds?: number
  ): Promise<string | null> {
    return this.set(key, JSON.stringify(obj), ttlSeconds);
  }

  public del(key: string): Promise<number> {
    return this.client.del(key);
  }

  public expire(key: string, seconds: number): Promise<number> {
    return this.client.expire(key, seconds);
  }

  /*** List operations ***/
  public lLen(key: string): Promise<number> {
    return this.client.lLen(key);
  }

  public rPush(key: string, ...values: string[]): Promise<number> {
    return this.client.rPush(key, values);
    // return this.client.rPush(key, ...values); // If problem test it.
  }

  /**
   * Removes elements from a list stored at the given key.
   *
   * @param key - The Redis list key.
   * @param count - Number of occurrences to remove.
   *                > 0: head to tail,
   *                < 0: tail to head,
   *                0: all occurrences.
   * @param value - The value to remove.
   * @returns Number of removed elements.
   */
  async lRem(key: string, count: number, value: string): Promise<number> {
    return this.client.lRem(key, count, value);
  }

  /**
   * List pop (LPOP):
   * Removes and returns the first element of the list stored at key.
   * Useful for implementing a FIFO queue alongside RPUSH.
   */
  public lPop(key: string): Promise<string | null> {
    return this.client.lPop(key);
  }

  /*** Sorted Set operations ***/
  public zCount(key: string, min: number, max: number): Promise<number> {
    return this.client.zCount(key, min, max);
  }

  public zAdd(key: string, score: number, member: string): Promise<number> {
    return this.client.zAdd(key, { score, value: member });
  }

  public zRange(key: string, start: number, stop: number): Promise<string[]> {
    return this.client.zRange(key, start, stop);
  }

  public zRevRange(
    key: string,
    start: number,
    stop: number
  ): Promise<string[]> {
    return this.client.zRange(key, start, stop, { REV: true });
  }

  public zRangeByScore(
    key: string,
    min: number,
    max: number
  ): Promise<string[]> {
    return this.client.zRangeByScore(key, min, max);
  }

  public zRemRangeByScore(
    key: string,
    min: number,
    max: number
  ): Promise<number> {
    return this.client.zRemRangeByScore(key, min, max);
  }

  public zRem(key: string, member: string): Promise<number> {
    return this.client.zRem(key, member);
  }

  /*** Hash operations ***/
  public hGet(key: string, field: string): Promise<string | null> {
    return this.client.hGet(key, field);
  }

  public hGetAll(key: string): Promise<Record<string, string>> {
    return this.client.hGetAll(key);
  }

  public hmGet(key: string, fields: string[]): Promise<(string | null)[]> {
    return this.client.hmGet(key, fields);
  }

  /*** Hash operations ***/
  // Overloaded hSet: single field or multiple fields
  public hSet(key: string, field: string, value: string): Promise<number>;
  public hSet(key: string, map: Record<string, string>): Promise<number>;
  public hSet(
    key: string,
    fieldOrMap: string | Record<string, string>,
    value?: string
  ): Promise<number> {
    if (typeof fieldOrMap === "string" && value !== undefined) {
      return this.client.hSet(key, fieldOrMap, value);
    }
    if (typeof fieldOrMap === "object") {
      return this.client.hSet(key, fieldOrMap);
    }
    throw new Error("Invalid arguments for hSet");
  }

  // public hSet(key: string, field: string, value: string): Promise<number> {
  //   return this.client.hSet(key, field, value);
  // }

  public hDel(key: string, field: string): Promise<number> {
    return this.client.hDel(key, field);
  }

  /*** Pub/Sub ***/
  public publish(channel: string, message: string): Promise<number> {
    return this.client.publish(channel, message);
  }

  public subscribe(
    channel: string,
    handler: (message: string) => void
  ): Promise<void> {
    return this.subscriber.subscribe(channel, handler);
  }

  public unsubscribe(channel: string): Promise<void> {
    return this.subscriber.unsubscribe(channel);
  }
}

export const redis = new RedisProxy();
